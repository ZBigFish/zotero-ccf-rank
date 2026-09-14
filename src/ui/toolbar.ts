/**
 * Menu integration.
 *
 * The identification jobs are also reachable without opening the settings: the
 * Tools menu runs the full-library scan, and the item context menu gets the same
 * entry.
 *
 * There is deliberately no button in the item-tree toolbar. That toolbar is a
 * single shared row that other plugins also append to, so an extra icon lands
 * on top of their buttons; the menus are reachable everywhere and cost no
 * screen space.
 */

import { config } from "../../package.json";
import { getString } from "../utils/locale";
import type { IdentifyManager } from "../modules/manager";
import type { Columns } from "../modules/columns";
import { runSelfCheck, showSelfCheckReport } from "./selfCheck";

const TOOLS_MENU_ITEM_ID = `${config.addonRef}-tools-scan`;
const TOOLS_SELFCHECK_ID = `${config.addonRef}-tools-selfcheck`;
const ITEM_MENU_SCAN_ID = `${config.addonRef}-itemmenu-scan-all`;

/** Item types a scan touches; the menu entry is only useful in these. */
const SCANNABLE_TREES = new Set(["main", "group", "trash"]);

type Notify = (text: string, type?: "default" | "success" | "fail") => void;

export interface ToolbarDeps {
  manager: IdentifyManager;
  /** Needed by the self-check, which rebuilds the columns. */
  columns?: Columns;
  /** Show a short message; defaults to a progress window. */
  notify?: Notify;
}

/**
 * Hook the menu entries up. Safe to call for every main window; each window only
 * gets the entries once.
 */
export function registerToolbar(deps: ToolbarDeps): void {
  registerMenuEntries(deps, deps.notify ?? defaultNotify);
}

function defaultNotify(
  text: string,
  type: "default" | "success" | "fail" = "default",
): void {
  try {
    new ztoolkit.ProgressWindow(getString("scan-progress-title"), {
      closeOtherProgressWindows: true,
    })
      .createLine({ text, type })
      .show();
  } catch (error) {
    ztoolkit.log("progress window failed", error);
  }
}

/** Register the Tools-menu entry and the item context menu entry. */
export function registerMenuEntries(deps: ToolbarDeps, notify?: Notify): void {
  const icon = `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`;
  const run = () => {
    void runLibraryScan(deps, notify ?? defaultNotify);
  };

  try {
    ztoolkit.Menu.register("menuTools", {
      tag: "menuitem",
      id: TOOLS_MENU_ITEM_ID,
      label: getString("menu-scan-library"),
      icon,
      commandListener: run,
    });
  } catch (error) {
    ztoolkit.log("could not register the Tools menu entry", error);
  }

  // Diagnostic entry: reports every link of the column pipeline for the
  // selected item and rebuilds the columns, so an empty column can be told
  // apart from a broken registration without a debugger.
  try {
    const columns = deps.columns;
    ztoolkit.Menu.register("menuTools", {
      tag: "menuitem",
      id: TOOLS_SELFCHECK_ID,
      label: getString("menu-self-check"),
      icon,
      commandListener: () => {
        if (!columns) {
          ztoolkit.log("self-check needs the columns service");
          return;
        }
        void runSelfCheck(columns)
          .then((checks) => showSelfCheckReport(checks))
          .catch((error) => ztoolkit.log("self-check failed", error));
      },
    });
  } catch (error) {
    ztoolkit.log("could not register the self-check entry", error);
  }

  // One press fixes the common case: the ranks are in `Extra`, but the rows were
  // already read (and cached as empty) before they were written.
  if (deps.columns) {
    const columnsService = deps.columns;
    const report = notify ?? defaultNotify;
    try {
      ztoolkit.Menu.register("menuTools", {
        tag: "menuitem",
        id: `${config.addonRef}-tools-refresh-column`,
        label: getString("menu-refresh-column"),
        icon,
        commandListener: () => {
          void columnsService
            .repair()
            .then((keys) => {
              report(
                getString("menu-refresh-column-done", {
                  args: { count: keys.length },
                }),
                "success",
              );
            })
            .catch((error) => {
              ztoolkit.log("repairing the columns failed", error);
              report(String((error as Error)?.message ?? error), "fail");
            });
        },
      });
    } catch (error) {
      ztoolkit.log("could not register the refresh entry", error);
    }
  }

  try {
    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: ITEM_MENU_SCAN_ID,
      label: getString("menu-scan-library"),
      icon,
      commandListener: run,
    });
  } catch (error) {
    ztoolkit.log("could not register the item menu entry", error);
  }
}

/**
 * Run the full-library scan and report the outcome.
 *
 * Exported so the menu entries and the button share exactly one code path.
 */
export async function runLibraryScan(
  deps: ToolbarDeps,
  notify: Notify,
  options: { force?: boolean } = {},
): Promise<void> {
  const { manager } = deps;
  const force = options.force === true;
  if (manager.isScanning) {
    notify(getString("scan-already-running"));
    return;
  }
  try {
    const summary = await manager.scanLibrary({ force });
    notify(
      summary.cancelled
        ? getString("scan-cancelled")
        : getString("scan-finished", {
            args: { updated: summary.updated, total: summary.total },
          }),
      summary.cancelled ? "default" : "success",
    );
  } catch (error) {
    ztoolkit.log("library scan failed", error);
    notify(String((error as Error)?.message ?? error), "fail");
  }
}

/** Whether the button should be shown for a given item tree. */
export function isScannableTree(treeID: string | undefined): boolean {
  return treeID === undefined || SCANNABLE_TREES.has(treeID);
}
