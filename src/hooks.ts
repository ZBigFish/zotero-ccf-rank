/**
 * Lifecycle hooks. Hooks only dispatch: the real work lives in the modules.
 */

import { config } from "../package.json";
import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { getPref, observePrefs, unobservePrefs } from "./utils/prefs";
import { IdentifyManager } from "./modules/manager";
import {
  Columns,
  cancelRepaint,
  refreshAll,
  refreshRow,
  repaintAfterWindowLoad,
  summaryText,
} from "./modules/columns";
import { ItemPaneSection } from "./modules/itemPane";
import { PreferencesPane } from "./ui/preferencesPane";
import { registerItemMenu } from "./ui/itemMenu";
import { registerToolbar } from "./ui/toolbar";

let prefsObserver: symbol | undefined;
let notifierID: string | undefined;

/**
 * `onStartup` runs once.
 *
 * Registering a preference pane makes Zotero reload every open preferences
 * window, and a reload can bring the add-on's bootstrap back around while the
 * first start-up is still in flight. Without this guard the second pass
 * registered a second pane and a second notifier, and a third, until the stack
 * ran out — the whole plugin then looked "dead" while Zotero recovered.
 */
let starting = false;

async function onStartup() {
  if (starting || addon.data.initialized) return;
  starting = true;
  try {
    await startOnce();
  } finally {
    starting = false;
  }
}

async function startOnce() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Every open main window needs the toolkit and the Fluent strings.
  for (const win of Zotero.getMainWindows()) {
    await onMainWindowLoad(win);
  }

  const manager = new IdentifyManager({
    onItemUpdated: (itemID) => {
      refreshRow(itemID);
      ItemPaneSection.refresh();
    },
    // Every long job reports here, so the settings page can show how far along
    // it is instead of leaving the user with a static "scanning…" line.
    onProgress: (report) => {
      PreferencesPane.broadcastProgress(report);
    },
  });
  addon.manager = manager;

  const columns = new Columns();
  addon.columns = columns;

  const itemPane = new ItemPaneSection();
  addon.itemPane = itemPane;

  try {
    await manager.init();
  } catch (error) {
    ztoolkit.log("could not initialize the journal cache", error);
  }

  const preferences = new PreferencesPane({
    manager,
    onAliasesChanged: () => {
      manager.reloadOptions();
      void columns.reload();
    },
    onCacheChanged: () => {
      refreshAll();
      ItemPaneSection.refresh();
    },
  });
  addon.preferences = preferences;

  await columns.register();
  itemPane.register();
  await preferences.register();
  registerItemMenu(manager);
  registerToolbar({ manager, columns });
  registerNotifier(manager);

  // Exposed so the runtime check can read what the column would show.
  addon.api.summaryText = (item: Zotero.Item) => summaryText(item);

  prefsObserver = observePrefs((key) => {
    void onPrefChange(key, manager, columns, itemPane);
  });

  // Repaint once the columns are in place.
  //
  // Zotero builds every cell of a row once into `itemTree._rowCache` and serves
  // it from there; the tree repaint that `registerColumns()` triggers does *not*
  // drop that cache. Any row rendered before this point therefore keeps an empty
  // 分区汇总 cell until something clears it — which is why the column used to
  // appear and stay blank on every start until the Tools → refresh entry was
  // used. `addon.data.initialized` is set last, so this cannot be overtaken by a
  // second start-up.
  refreshAll();

  addon.data.initialized = true;
}

/**
 * React to a preference change.
 *
 * Deliberately cheap. Every write from the settings pane arrives here, including
 * the ones the pane makes itself (ticking a checkbox, saving an alias), and
 * re-registering the columns means unregistering them first — which makes Zotero
 * rebuild the whole item tree. Doing that on every keystroke of every preference
 * is what turned a simple checkbox into a frozen settings window, so only the
 * preferences that really change the produced text do any work, and only once:
 * `reload()` also repaints the tree, so no second `refreshAll()` is needed.
 */
async function onPrefChange(
  key: string,
  manager: IdentifyManager,
  columns: Columns,
  itemPane: ItemPaneSection,
): Promise<void> {
  manager.reloadOptions();
  switch (key) {
    // Which columns exist.
    case "showSummaryColumn":
    case "showCcfColumn":
    case "showCasColumn":
    case "showCitationColumn":
      await columns.reload();
      break;
    // What the columns say: the text providers read the values live, so the tree
    // only needs a repaint, not a re-registration.
    case "summaryColumnLabel":
    case "ccfColumnLabel":
    case "casColumnLabel":
    case "citationColumnLabel":
    case "summaryTemplate":
    case "separator":
    case "ccfPrefix":
    case "placeholderNoCcf":
    case "placeholderPreprint":
    case "placeholderNotApplicable":
    case "placeholderNoCas":
    case "aliasMapping":
      refreshAll();
      break;
    case "showItemPaneRow":
      if (getPref("showItemPaneRow", true)) {
        itemPane.register();
      } else {
        itemPane.unregister();
      }
      break;
    default:
      // Nothing visible depends on this preference.
      break;
  }
}

/**
 * Watch newly added items so they can be identified without any user action.
 *
 * The toolkit does not register an observer for us, so this is done explicitly.
 */
function registerNotifier(manager: IdentifyManager): void {
  try {
    notifierID = Zotero.Notifier.registerObserver(
      {
        notify: (
          event: string,
          type: string,
          ids: Array<string | number>,
          extraData: { [key: string]: unknown },
        ) => {
          void onNotify(event, type, ids, extraData).catch((error) =>
            ztoolkit.log("notify handler failed", error),
          );
        },
      },
      ["item"],
      config.addonRef,
    );
  } catch (error) {
    ztoolkit.log("could not register the item observer", error);
    notifierID = undefined;
  }
  void manager;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
  // A failure here must never abort the plugin's start-up.
  try {
    ItemPaneSection.insertFTL(win);
  } catch (error) {
    ztoolkit.log("could not inject the locale file", error);
  }
  try {
    addon.preferences?.watchWindows();
  } catch (error) {
    ztoolkit.log("could not attach the preference-pane listener", error);
  }
  // The item tree is often already built by now, with our columns cached empty.
  repaintAfterWindowLoad(win as unknown as Window);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  // A repaint timer firing into a destroyed window throws inside Zotero.
  cancelRepaint(win);
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  void extraData;
  if (!addon.data.alive || !addon.data.initialized) return;
  if (type !== "item") return;

  const manager = addon.manager;
  if (!manager) return;

  switch (event) {
    case "add":
      if (getPref("autoIdentifyNewItems", true)) {
        manager.scheduleNewItems(ids);
      }
      break;
    default:
      break;
  }
}

/**
 * Preference pane events. The pane's `onload` attribute dispatches here.
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  const win: Window | undefined = data?.window;
  if (!win) return;
  switch (type) {
    case "load": {
      // Zotero loads the pane's scripts before the markup is inserted, so this
      // is where the controller gets wired to the real elements.
      try {
        addon.preferences?.watchWindow(win);
      } catch (error) {
        ztoolkit.log("could not wire the preference pane", error);
      }
      break;
    }
    case "unload":
      break;
    default:
      break;
  }
}

function onShutdown(): void {
  if (notifierID) {
    try {
      Zotero.Notifier.unregisterObserver(notifierID);
    } catch (error) {
      ztoolkit.log("could not remove the item observer", error);
    }
    notifierID = undefined;
  }
  if (prefsObserver) {
    unobservePrefs(prefsObserver);
    prefsObserver = undefined;
  }
  try {
    addon.manager?.clearTimers();
  } catch (_error) {
    // ignore
  }
  addon.preferences?.unregister();
  addon.itemPane?.unregister();
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - the instance is attached by src/index.ts
  delete Zotero[config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onNotify,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
