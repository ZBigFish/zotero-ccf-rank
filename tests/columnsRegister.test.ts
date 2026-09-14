import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import { COLUMN_KEYS, Columns } from "../src/modules/columns";

/**
 * Column registration.
 *
 * `Zotero.ItemTreeManager.registerColumns()` returns the *namespaced* data keys
 * and `unregisterColumn()` has to be called with exactly those values, so the
 * register/unregister cycle is pinned down here.
 */

const PREFS = new Map<string, unknown>([
  ["extensions.zotero.ccfrank.showSummaryColumn", true],
  ["extensions.zotero.ccfrank.showCcfColumn", false],
  ["extensions.zotero.ccfrank.showCasColumn", false],
  ["extensions.zotero.ccfrank.showCitationColumn", true],
  ["extensions.zotero.ccfrank.summaryColumnLabel", ""],
  ["extensions.zotero.ccfrank.ccfColumnLabel", ""],
  ["extensions.zotero.ccfrank.casColumnLabel", ""],
  ["extensions.zotero.ccfrank.citationColumnLabel", ""],
]);

interface RegisteredColumn {
  pluginID: string;
  dataKey: string;
  label: string;
  dataProvider: (item: Zotero.Item) => string;
  zoteroPersist?: string[];
}

function installStub() {
  const registered: RegisteredColumn[] = [];
  const unregistered: string[] = [];
  let refreshCount = 0;

  (globalThis as any).Zotero = {
    Prefs: { get: (key: string) => PREFS.get(key) },
    ItemTreeManager: {
      registerColumns: (options: unknown) => {
        const list = Array.isArray(options) ? options : [options];
        for (const option of list as RegisteredColumn[]) {
          registered.push(option);
        }
        return (list as RegisteredColumn[]).map(
          (option) => `${option.pluginID}-${option.dataKey}`,
        );
      },
      unregisterColumn: (dataKey: string) => {
        unregistered.push(dataKey);
        return true;
      },
      refreshColumns: () => {
        refreshCount++;
      },
    },
    Notifier: { trigger: () => undefined },
    getMainWindows: () => [],
  };
  (globalThis as any).ztoolkit = { log: () => undefined };
  (globalThis as any).addon = {
    data: {
      locale: {
        current: {
          formatMessagesSync: (entries: Array<{ id: string }>) =>
            entries.map((entry) => ({
              value: LABELS[entry.id.replace("ccfrank-", "")] ?? entry.id,
            })),
        },
      },
    },
  };

  return {
    registered,
    unregistered,
    get refreshCount() {
      return refreshCount;
    },
  };
}

const LABELS: Record<string, string> = {
  "column-summary": "分区汇总",
  "column-ccf": "CCF 分区",
  "column-cas": "中科院分区",
  "column-citation": "引用次数",
};

describe("item tree columns", () => {
  it("registers only the enabled columns", async () => {
    const stub = installStub();
    const columns = new Columns();
    const keys = await columns.register();

    equal(stub.registered.length, 2, "summary + citation by default");
    equal(stub.registered[0].dataKey, COLUMN_KEYS.summary);
    equal(stub.registered[1].dataKey, COLUMN_KEYS.citation);
    equal(stub.registered[0].label, "分区汇总");
    equal(stub.registered[1].label, "引用次数");
    equal(keys.length, 2);
    ok(
      stub.registered.every((column) =>
        column.zoteroPersist?.includes("sortDirection"),
      ),
    );
  });

  it("is idempotent", async () => {
    const stub = installStub();
    const columns = new Columns();
    await columns.register();
    await columns.register();
    equal(stub.registered.length, 2, "a second register is a no-op");
  });

  it("unregisters with the returned keys before re-registering", async () => {
    const stub = installStub();
    const columns = new Columns();
    const keys = await columns.register();
    await columns.reload();

    equal(stub.unregistered.length, keys.length);
    for (const key of keys) {
      ok(stub.unregistered.includes(key), `${key} must be unregistered`);
    }
    equal(stub.registered.length, 4, "registered again after the reload");
    ok(stub.refreshCount > 0, "the tree is refreshed");
  });

  it("honours the label overrides", async () => {
    const stub = installStub();
    PREFS.set("extensions.zotero.ccfrank.summaryColumnLabel", "我的分区");
    const columns = new Columns();
    await columns.register();
    equal(stub.registered[0].label, "我的分区");
    PREFS.set("extensions.zotero.ccfrank.summaryColumnLabel", "");
  });

  it("exposes all four columns when everything is enabled", async () => {
    const stub = installStub();
    PREFS.set("extensions.zotero.ccfrank.showCcfColumn", true);
    PREFS.set("extensions.zotero.ccfrank.showCasColumn", true);
    const columns = new Columns();
    await columns.register();
    equal(stub.registered.length, 4);
    equal(
      stub.registered.map((column) => column.dataKey).join(","),
      [
        COLUMN_KEYS.summary,
        COLUMN_KEYS.ccf,
        COLUMN_KEYS.cas,
        COLUMN_KEYS.citation,
      ].join(","),
    );
    PREFS.set("extensions.zotero.ccfrank.showCcfColumn", false);
    PREFS.set("extensions.zotero.ccfrank.showCasColumn", false);
  });

  it("registers nothing when every column is disabled", async () => {
    const stub = installStub();
    PREFS.set("extensions.zotero.ccfrank.showSummaryColumn", false);
    PREFS.set("extensions.zotero.ccfrank.showCitationColumn", false);
    const columns = new Columns();
    const keys = await columns.register();
    equal(keys.length, 0);
    equal(stub.registered.length, 0);
    PREFS.set("extensions.zotero.ccfrank.showSummaryColumn", true);
    PREFS.set("extensions.zotero.ccfrank.showCitationColumn", true);
  });
});
