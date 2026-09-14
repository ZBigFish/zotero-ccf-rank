/**
 * Item pane integration: a read-only "分区汇总" row in the item info box.
 *
 * The row is registered through `Zotero.ItemPaneManager`, which keeps the
 * native look and removes the row automatically when the plugin is disabled.
 */

import { config } from "../../package.json";
import { getString, getLocaleID } from "../utils/locale";
import { getPref, readRuntimeOptions } from "../utils/prefs";
import { parseRankRecord } from "./record";
import { renderSummary } from "./summary";
import { buildRenderOptions, itemIsPreprint } from "./columns";

interface InfoRowOptions {
  rowID: string;
  pluginID: string;
  label: { l10nID: string; l10nArgs?: string };
  position?: "start" | "afterCreators" | "end";
  multiline?: boolean;
  nowrap?: boolean;
  editable?: boolean;
  onGetData?: (data: { item?: Zotero.Item }) => string;
  onItemChange?: (data: {
    item?: Zotero.Item;
    setEnabled?: (enabled: boolean) => void;
  }) => void;
}

const ROW_ID = `${config.addonRef}-summary-row`;

export class ItemPaneSection {
  private registered = false;

  /** Inject the plugin's Fluent strings into a window. */
  static insertFTL(win: _ZoteroTypes.MainWindow): void {
    try {
      win.MozXULElement?.insertFTLIfNeeded?.(`${config.addonRef}-addon.ftl`);
    } catch (error) {
      ztoolkit.log("insertFTLIfNeeded failed", error);
    }
  }

  register(): boolean {
    if (this.registered) return true;
    if (!getPref("showItemPaneRow", true)) return false;
    const manager = (Zotero as unknown as { ItemPaneManager?: any })
      .ItemPaneManager;
    if (!manager?.registerInfoRow) {
      ztoolkit.log("ItemPaneManager.registerInfoRow is unavailable");
      return false;
    }

    const options: InfoRowOptions = {
      rowID: ROW_ID,
      pluginID: config.addonID,
      label: { l10nID: getLocaleID("item-row-label") },
      position: "afterCreators",
      multiline: true,
      nowrap: false,
      editable: false,
      onGetData: ({ item }) => (item ? summaryFor(item) : ""),
      onItemChange: ({ item, setEnabled }) => {
        let enabled = false;
        try {
          enabled = Boolean(item && item.isRegularItem());
        } catch (_error) {
          enabled = false;
        }
        setEnabled?.(enabled);
      },
    };

    try {
      const result = manager.registerInfoRow(options);
      this.registered = Boolean(result);
      return this.registered;
    } catch (error) {
      ztoolkit.log("registerInfoRow failed", error);
      return false;
    }
  }

  unregister(): void {
    if (!this.registered) return;
    const manager = (Zotero as unknown as { ItemPaneManager?: any })
      .ItemPaneManager;
    try {
      manager?.unregisterInfoRow?.(ROW_ID);
    } catch (_error) {
      // ignore
    }
    this.registered = false;
  }

  /**
   * The registered row ids belonging to this plugin.
   *
   * `Zotero.ItemPaneManager.customInfoRowData` is `{ updateID, options }` where
   * `options` holds the row descriptors — reading it as a map of rows silently
   * yields just `["updateID", "options"]`.
   */
  static registeredRowIDs(): string[] {
    const manager = (Zotero as unknown as { ItemPaneManager?: any })
      .ItemPaneManager;
    const options = manager?.customInfoRowData?.options;
    if (!Array.isArray(options)) return [];
    return options
      .map((entry: { rowID?: string }) => entry?.rowID)
      .filter((rowID: unknown): rowID is string => typeof rowID === "string");
  }

  /** Force the item pane to re-read the row. */
  static refresh(): void {
    try {
      const manager = (Zotero as unknown as { ItemPaneManager?: any })
        .ItemPaneManager;
      manager?.refreshInfoRow?.(ROW_ID);
    } catch (_error) {
      // ignore
    }
  }
}

function summaryFor(item: Zotero.Item): string {
  const options = readRuntimeOptions();
  let record = {};
  try {
    record = parseRankRecord((item.getField("extra") as string) ?? "");
  } catch (_error) {
    record = {};
  }
  const typed = record as ReturnType<typeof parseRankRecord>;
  if (!typed.ccf && !typed.cas && !typed.ccfVenue) return "";
  let year = "";
  try {
    year =
      ((item.getField("date") as string) ?? "").match(/(19|20)\d{2}/)?.[0] ??
      "";
  } catch (_error) {
    year = "";
  }
  const summary = renderSummary(
    typed,
    options.summaryTemplate,
    buildRenderOptions(),
    {
      year,
      isPreprint: itemIsPreprint(item, typed),
      notApplicable: typed.ccf === "NotApplicable",
    },
  );
  return summary || getString("item-row-empty");
}
