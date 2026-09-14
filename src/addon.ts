import { ColumnOptions, DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import type { IdentifyManager } from "./modules/manager";
import type { Columns } from "./modules/columns";
import type { ItemPaneSection } from "./modules/itemPane";
import type { PreferencesPane } from "./ui/preferencesPane";

class Addon {
  public data: {
    alive: boolean;
    /** Set once `onStartup` finished, used by scripts loaded earlier. */
    initialized: boolean;
    // Env type, see build.js
    env: "development" | "production";
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
      columns: Array<ColumnOptions>;
      rows: Array<{ [dataKey: string]: string }>;
    };
    dialog?: DialogHelper;
  };

  /** Runtime services, created in `onStartup`. */
  public manager?: IdentifyManager;

  public columns?: Columns;

  public itemPane?: ItemPaneSection;

  public preferences?: PreferencesPane;

  // Lifecycle hooks
  public hooks: typeof hooks;
  // APIs
  public api: {
    /** The one-line summary the 分区汇总 column shows for an item. */
    summaryText?: (item: Zotero.Item) => string;
  };

  constructor() {
    this.data = {
      alive: true,
      initialized: false,
      env: __env__,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;
