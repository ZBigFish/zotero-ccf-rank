import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import {
  registerMenuEntries,
  registerToolbar,
  runLibraryScan,
} from "../src/ui/toolbar";

/**
 * Menu integration.
 *
 * The identification jobs must be reachable without opening the settings page.
 * The item-tree toolbar is deliberately left alone: it is one shared row that
 * every plugin appends to, so an extra icon ends up drawn on top of a neighbour's
 * button. These tests pin both halves of that decision.
 */

const LABELS: Record<string, string> = {
  "menu-scan-library": "扫描全库并补齐分区信息",
  "menu-self-check": "自检：为什么列是空的（含重建列）",
  "self-check-title": "CCF 分区助手 自检",
  "menu-refresh-column": "刷新分区汇总列（识别完不显示时点这里）",
  "menu-refresh-column-done": "已刷新 { $count } 个分区列",
  "scan-progress-title": "CCF 分区助手",
  "scan-already-running": "扫描正在进行中",
  "scan-cancelled": "扫描已取消",
  "scan-finished": "扫描完成",
};

interface Harness {
  window: any;
  toolbarContainer: { children: unknown[] };
  registeredMenus: Array<{ popup: string; options: any }>;
}

function installStubs(): Harness {
  // A stand-in for Zotero's item toolbar; the plugin must never append to it.
  const toolbarContainer = { children: [] as unknown[] };
  const document = {
    getElementById: (id: string) =>
      id === "zotero-items-toolbar" ? toolbarContainer : null,
    createXULElement: () => ({ setAttribute: () => undefined }),
  };
  const window = { document } as any;

  const registeredMenus: Array<{ popup: string; options: any }> = [];
  (globalThis as any).ztoolkit = {
    log: () => undefined,
    Menu: {
      register: (popup: string, options: any) => {
        registeredMenus.push({ popup, options });
        return true;
      },
    },
    ProgressWindow: class {
      createLine() {
        return this;
      }

      show() {
        return this;
      }
    },
  };
  (globalThis as any).Zotero = { getMainWindows: () => [window] };
  (globalThis as any).addon = {
    data: {
      locale: {
        current: {
          formatMessagesSync: (entries: Array<{ id: string }>) =>
            entries.map((entry) => ({
              value:
                LABELS[entry.id.replace("ccfrank-", "")] ??
                entry.id.replace("ccfrank-", ""),
            })),
        },
      },
    },
  };

  return { window, toolbarContainer, registeredMenus };
}

function makeManager(overrides: Record<string, unknown> = {}) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    isScanning: false,
    async scanLibrary(options: Record<string, unknown> = {}) {
      calls.push(options);
      return {
        total: 12,
        scanned: 12,
        updated: 9,
        skipped: false,
        cancelled: false,
        errors: 0,
        casRefreshed: 0,
      };
    },
    ...overrides,
  };
}

describe("scan menu entries", () => {
  it("registers two scan entries and the self-check", () => {
    const harness = installStubs();
    registerMenuEntries({
      manager: makeManager() as never,
      columns: { repair: async () => ["key"] } as never,
    });
    const popups = harness.registeredMenus.map((entry) => entry.popup).sort();
    equal(popups.join(","), "item,menuTools,menuTools,menuTools");
    const scans = harness.registeredMenus.filter(
      (entry) => entry.options.label === "扫描全库并补齐分区信息",
    );
    equal(scans.length, 2, "the Tools menu and the item menu both scan");
    const selfCheck = harness.registeredMenus.find((entry) =>
      String(entry.options.label).includes("自检"),
    );
    ok(selfCheck, "the self-check entry must exist");
    for (const entry of harness.registeredMenus) {
      equal(typeof entry.options.commandListener, "function");
    }
  });

  it("the menu entry runs the scan", async () => {
    const harness = installStubs();
    const manager = makeManager();
    registerMenuEntries({ manager: manager as never });
    const item = harness.registeredMenus.find((e) => e.popup === "item");
    item?.options.commandListener();
    await new Promise((resolve) => setTimeout(resolve, 10));
    equal(manager.calls.length, 1);
  });

  it("never appends a button to the shared item toolbar", () => {
    const harness = installStubs();
    registerToolbar({
      manager: makeManager() as never,
      columns: { repair: async () => ["key"] } as never,
    });
    equal(
      harness.toolbarContainer.children.length,
      0,
      "the item toolbar must stay untouched: another plugin's button sits there",
    );
    equal(harness.registeredMenus.length, 4, "the menu entries are registered");
  });

  it("refuses to start a second scan and reports why", async () => {
    installStubs();
    const manager = makeManager({ isScanning: true });
    const messages: string[] = [];
    await runLibraryScan({ manager: manager as never }, (text) =>
      messages.push(text),
    );
    equal(manager.calls.length, 0, "no scan is started");
    equal(messages[0], "扫描正在进行中");
  });

  it("reports a cancelled scan as such", async () => {
    installStubs();
    const manager = makeManager({
      async scanLibrary() {
        return {
          total: 5,
          scanned: 2,
          updated: 1,
          skipped: false,
          cancelled: true,
          errors: 0,
          casRefreshed: 0,
        };
      },
    });
    const messages: string[] = [];
    await runLibraryScan({ manager: manager as never }, (text) =>
      messages.push(text),
    );
    equal(messages[0], "扫描已取消");
  });

  it("reports a failure instead of throwing", async () => {
    installStubs();
    const manager = makeManager({
      async scanLibrary() {
        throw new Error("db busy");
      },
    });
    const messages: string[] = [];
    await runLibraryScan({ manager: manager as never }, (text, type) =>
      messages.push(`${type}:${text}`),
    );
    equal(messages[0], "fail:db busy");
  });

  it("passes the forced flag through", async () => {
    installStubs();
    const manager = makeManager();
    await runLibraryScan({ manager: manager as never }, () => undefined, {
      force: true,
    });
    equal(manager.calls.length, 1);
    equal(manager.calls[0].force, true);
    ok(true);
  });
});
