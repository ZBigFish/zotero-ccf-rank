/**
 * The preference pane.
 *
 * Registration uses Zotero's native `PreferencePanes.register()`, so the pane
 * appears in the sidebar and the `preference="..."` attributes in the markup
 * get two-way bound by Zotero itself.
 *
 * The pane's markup lives in `addon/chrome/content/preferences.xhtml`, its
 * behaviour in `src/ui/prefs-pane.js` (also bundled as a string so the file
 * ships inside the XPI), and the buttons/status messages are bridged to this
 * module through DOM events.
 */

import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { readTextFile, writeTextFile } from "../utils/files";
import type { IdentifyManager, ProgressReport } from "../modules/manager";
import { prefsPaneScript } from "../ui/prefs-pane.raw";

export interface PrefsPaneDeps {
  manager: IdentifyManager;
  /** Called after the alias mapping changed. */
  onAliasesChanged?: () => void;
  /** Called after a cache change that should repaint the item tree. */
  onCacheChanged?: () => void;
  /** Cancel a running job. */
  onCancel?: () => void;
}

const ACTION_EVENT = `${config.addonRef}:action`;
const STATUS_EVENT = `${config.addonRef}:status`;
const PANE_ID = `${config.addonRef}-prefpane`;

function addonEnv(): string {
  try {
    return String((globalThis as { __env__?: string }).__env__ ?? "production");
  } catch (_error) {
    return "production";
  }
}

interface PaneWindow extends Window {
  __ccfrankPrefsPane?: {
    emit?: (detail: Record<string, unknown>) => void;
    attach?: () => void;
  };
}

export class PreferencesPane {
  private paneID?: string;

  private readonly wiredWindows = new WeakSet<Window>();

  /** Windows whose pane controller accepted `attach()`. */
  private readonly attachedWindows = new WeakSet<Window>();

  constructor(private readonly deps: PrefsPaneDeps) {}

  async register(): Promise<boolean> {
    const manager = (Zotero as unknown as { PreferencePanes?: any })
      .PreferencePanes;
    if (!manager?.register) {
      ztoolkit.log("Zotero.PreferencePanes is unavailable");
      return false;
    }

    // `addon/prefs-pane.js` ships inside the XPI (generated from
    // `src/ui/prefs-pane.js` by `tools/build-prefs-pane.cjs`; the test suite
    // fails when the two drift apart). In a development profile the file is
    // written on every start so the pane never runs stale code.
    const rootURI = String((globalThis as any).rootURI ?? "");
    if (rootURI && addonEnv() === "development") {
      try {
        await writeTextFile(`${rootURI}prefs-pane.js`, prefsPaneScript);
      } catch (error) {
        ztoolkit.log("could not refresh prefs-pane.js", error);
      }
    }

    try {
      this.paneID = await manager.register({
        pluginID: config.addonID,
        id: PANE_ID,
        // Absolute `chrome://` URIs on purpose. `PreferencePanes.register()`
        // resolves a relative URI against the plugin root, which inside an XPI
        // becomes `jar:file:///...xpi!/chrome/content/...`; Zotero reads the
        // pane fragment with `Zotero.File.getContentsFromURL()`, which cannot
        // open that, and the pane silently stays empty. The registered chrome
        // mapping is readable, so it is used instead.
        src: `chrome://${config.addonRef}/content/preferences.xhtml`,
        scripts: [`chrome://${config.addonRef}/content/prefs-pane.js`],
        stylesheets: [`chrome://${config.addonRef}/content/preferences.css`],
        label: getString("pref-pane-title"),
        image: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
      });
      this.watchWindows();
      return true;
    } catch (error) {
      ztoolkit.log("registering the preference pane failed", error);
      return false;
    }
  }

  unregister(): void {
    const manager = (Zotero as unknown as { PreferencePanes?: any })
      .PreferencePanes;
    if (this.paneID) {
      try {
        manager?.unregister?.(this.paneID);
      } catch (_error) {
        // ignore
      }
      this.paneID = undefined;
    }
  }

  /** Attach the action listener to every open preferences window. */
  watchWindows(): void {
    const windows: Window[] = [];
    try {
      const enumerator = (globalThis as any).Services?.wm?.getEnumerator?.(
        "zotero:pref",
      );
      if (enumerator) {
        while (enumerator.hasMoreElements()) {
          windows.push(enumerator.getNext());
        }
      }
    } catch (_error) {
      // ignore
    }
    for (const win of windows) this.watchWindow(win);
  }

  /**
   * Attach the action listener to one preferences window. Called both when the
   * pane registers (in case Settings is already open) and from the pane's own
   * load event.
   */
  watchWindow(win: Window): void {
    const shouldCheck = !this.wiredWindows.has(win);
    if (shouldCheck) this.wiredWindows.add(win);
    if (shouldCheck) {
      win.addEventListener(ACTION_EVENT, (event: Event) => {
        const detail = ((event as CustomEvent).detail ?? {}) as {
          action?: string;
          aliases?: unknown;
        };
        void this.handleAction(win, detail.action, detail).catch((error) =>
          ztoolkit.log("preference action failed", detail.action, error),
        );
      });
    }
    // Retried until it succeeds: the pane's own load event fires after its
    // scripts were evaluated, so the controller may exist by then even if it did
    // not when the window was first wired. Once attached, it is never re-wired.
    if (!this.attachedWindows.has(win)) {
      this.attachController(win);
    }
  }

  /**
   * Hand the window over to the pane controller.
   *
   * Nothing is scheduled on the window here. Zotero reloads the preferences
   * window whenever a plugin registers or unregisters a pane, so a timer or a
   * DOM write on a window that is being torn down can throw in the preferences
   * window itself, which takes the pane (and Zotero's settings) with it.
   */
  private attachController(win: Window): void {
    try {
      (win as PaneWindow).__ccfrankPrefsPane?.attach?.();
      this.attachedWindows.add(win);
    } catch (error) {
      ztoolkit.log("could not attach the preference pane", error);
    }
  }

  /** Send a message back to every open preferences window. */
  static broadcast(detail: Record<string, unknown>): void {
    try {
      const enumerator = (globalThis as any).Services?.wm?.getEnumerator?.(
        "zotero:pref",
      );
      if (!enumerator) return;
      while (enumerator.hasMoreElements()) {
        const win = enumerator.getNext() as Window;
        try {
          win.dispatchEvent(new win.CustomEvent(STATUS_EVENT, { detail }));
        } catch (_error) {
          // ignore
        }
      }
    } catch (_error) {
      // ignore
    }
  }

  /**
   * Send one progress report to the settings pane.
   *
   * Kept separate from `broadcast` so the status text and the progress bar can
   * never overwrite each other: the pane reads `progress` only.
   */
  static broadcastProgress(report: ProgressReport): void {
    PreferencesPane.broadcast({ progress: report });
  }

  private async handleAction(
    win: Window,
    action: string | undefined,
    detail: Record<string, unknown>,
  ): Promise<void> {
    const { manager } = this.deps;
    switch (action) {
      case "hello": {
        PreferencesPane.broadcast({ cache: await this.cacheStatusText() });
        return;
      }
      case "scan": {
        if (manager.isScanning) {
          PreferencesPane.broadcast({
            scan: getString("scan-already-running"),
          });
          return;
        }
        PreferencesPane.broadcast({ scan: getString("scan-started") });
        void manager
          .scanLibrary({ force: false })
          .then((summary) =>
            PreferencesPane.broadcast({
              scan: this.scanSummaryText(summary),
              cache: undefined,
            }),
          )
          .then(() => this.refreshCacheStatus())
          .catch((error) =>
            PreferencesPane.broadcast({
              scan: `扫描失败：${String((error as Error)?.message ?? error)}`,
            }),
          );
        return;
      }
      case "scanForce": {
        if (manager.isScanning) {
          PreferencesPane.broadcast({
            scan: getString("scan-already-running"),
          });
          return;
        }
        PreferencesPane.broadcast({ scan: getString("scan-started") });
        void manager
          .scanLibrary({ force: true })
          .then((summary) =>
            PreferencesPane.broadcast({ scan: this.scanSummaryText(summary) }),
          )
          .then(() => this.refreshCacheStatus())
          .catch((error) =>
            PreferencesPane.broadcast({
              scan: `扫描失败：${String((error as Error)?.message ?? error)}`,
            }),
          );
        return;
      }
      case "identifySelected": {
        const items = this.selectedItems();
        if (items.length === 0) {
          PreferencesPane.broadcast({ scan: getString("scan-need-selection") });
          return;
        }
        PreferencesPane.broadcast({
          scan: getString("requesting-citations-multiple", {
            args: { count: items.length },
          }),
        });
        const { updated } = await manager.identifyNow(items, { force: true });
        PreferencesPane.broadcast({ scan: `已更新 ${updated} 条条目` });
        this.refreshCacheStatus();
        return;
      }
      case "cancel": {
        manager.cancelScan();
        this.deps.onCancel?.();
        PreferencesPane.broadcast({ scan: getString("scan-cancelled") });
        return;
      }
      case "casRefresh": {
        PreferencesPane.broadcast({ cas: "正在更新过期的分区数据…" });
        const count = await manager.refreshCasCache(false);
        PreferencesPane.broadcast({
          cas: getString("cas-refresh-finished", { args: { count } }),
        });
        this.refreshCacheStatus();
        return;
      }
      case "casRebuild": {
        PreferencesPane.broadcast({ cas: "正在重建全部分区数据…" });
        const count = await manager.refreshCasCache(true);
        PreferencesPane.broadcast({
          cas: getString("cas-rebuild-done", { args: { count } }),
        });
        this.refreshCacheStatus();
        return;
      }
      case "casWarm": {
        PreferencesPane.broadcast({ cas: "正在预取文献库中的期刊…" });
        const count = await manager.warmCasCache();
        PreferencesPane.broadcast({
          cas: getString("cas-warm-done", { args: { count } }),
        });
        this.refreshCacheStatus();
        return;
      }
      case "casClear": {
        const store = manager.casStore ?? (await manager.init());
        const count = await store.clear();
        PreferencesPane.broadcast({
          cas: getString("cas-clear-done", { args: { count } }),
        });
        this.refreshCacheStatus();
        return;
      }
      case "casImport": {
        await this.importCasData(win);
        return;
      }
      case "casExport": {
        await this.exportCasData(win);
        return;
      }
      case "aliasSave": {
        // The pane already wrote the preference; just refresh our options.
        manager.reloadOptions();
        this.deps.onAliasesChanged?.();
        PreferencesPane.broadcast({ cas: getString("alias-saved") });
        return;
      }
      default:
        ztoolkit.log("unknown preference action", action, detail);
    }
  }

  private scanSummaryText(summary: {
    total: number;
    updated: number;
    cancelled: boolean;
    errors: number;
  }): string {
    if (summary.cancelled) return getString("scan-cancelled");
    const base = getString("scan-finished", {
      args: { updated: summary.updated, total: summary.total },
    });
    return summary.errors ? `${base}（失败 ${summary.errors} 条）` : base;
  }

  private selectedItems(): Zotero.Item[] {
    const windows = Zotero.getMainWindows?.() ?? [];
    for (const win of windows) {
      try {
        const pane = (win as any).ZoteroPane;
        if (!pane?.getSelectedItems) continue;
        const items = pane.getSelectedItems() as Zotero.Item[];
        if (items?.length) return items;
      } catch (_error) {
        // try the next window
      }
    }
    return [];
  }

  private async cacheStatusText(): Promise<string> {
    try {
      const store =
        this.deps.manager.casStore ?? (await this.deps.manager.init());
      const size = store.size;
      if (size === 0) return getString("cas-store-empty");
      const updated = store.updatedAt
        ? new Date(store.updatedAt).toLocaleString()
        : "-";
      return `本地已缓存 ${size} 个期刊/会议的分区数据 · 最近更新 ${updated}`;
    } catch (error) {
      return String((error as Error)?.message ?? error);
    }
  }

  private refreshCacheStatus(): void {
    void this.cacheStatusText().then((cache) =>
      PreferencesPane.broadcast({ cache }),
    );
    this.deps.onCacheChanged?.();
  }

  private async importCasData(win: Window): Promise<void> {
    try {
      const picker = new ztoolkit.FilePicker(
        "选择分区数据文件（JSON / CSV / TSV）",
        "open",
        [
          ["分区数据", "*.json;*.csv;*.tsv;*.txt"],
          ["所有文件", "*"],
        ],
        undefined,
        win,
      );
      const selected = await picker.open();
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      const text = await readTextFile(path);
      if (!text) {
        PreferencesPane.broadcast({
          cas: getString("cas-import-failed"),
          error: true,
        });
        return;
      }
      const store =
        this.deps.manager.casStore ?? (await this.deps.manager.init());
      const result = await store.importData(text);
      if (result.imported === 0) {
        PreferencesPane.broadcast({
          cas: getString("cas-import-failed"),
          error: true,
        });
        return;
      }
      PreferencesPane.broadcast({
        cas: getString("cas-import-done", {
          args: { imported: result.imported, skipped: result.skipped },
        }),
      });
      this.refreshCacheStatus();
    } catch (error) {
      PreferencesPane.broadcast({
        cas: `${getString("cas-import-failed")}：${String((error as Error)?.message ?? error)}`,
        error: true,
      });
    }
  }

  private async exportCasData(win: Window): Promise<void> {
    try {
      const store =
        this.deps.manager.casStore ?? (await this.deps.manager.init());
      if (store.size === 0) {
        PreferencesPane.broadcast({ cas: getString("cas-export-empty") });
        return;
      }
      const suggested = `ccf-rank-cas-${new Date().toISOString().slice(0, 10)}.json`;
      const picker = new ztoolkit.FilePicker(
        "导出分区数据",
        "save",
        [["JSON 文件", "*.json"]],
        suggested,
        win,
      );
      const selected = await picker.open();
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      await writeTextFile(path, JSON.stringify(store.toJSON(), null, 2));
      PreferencesPane.broadcast({
        cas: getString("cas-export-done", { args: { path } }),
      });
    } catch (error) {
      PreferencesPane.broadcast({
        cas: `导出失败：${String((error as Error)?.message ?? error)}`,
        error: true,
      });
    }
  }
}
