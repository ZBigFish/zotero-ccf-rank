import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import { IdentifyManager } from "../src/modules/manager";

/**
 * Regression tests for the manager's interactions with Zotero's API.
 *
 * `Zotero.Items.getAll()` is async in Zotero 7+, so a missing `await` silently
 * produced an empty list and the CAS cache maintenance never ran. These tests
 * drive the manager against a stub of the Zotero globals.
 */

interface StubItem {
  id: number;
  libraryID: number;
  itemType: string;
  fields: Record<string, string>;
  saved: number;
  getField(field: string): string;
  setField(field: string, value: string): void;
  saveTx(): Promise<void>;
  isRegularItem(): boolean;
  isNote(): boolean;
  isAttachment(): boolean;
  getNotes(): number[];
}

function makeItem(
  id: number,
  libraryID: number,
  itemType: string,
  fields: Record<string, string> = {},
): StubItem {
  return {
    id,
    libraryID,
    itemType,
    fields: { ...fields },
    saved: 0,
    getField(field) {
      return this.fields[field] ?? "";
    },
    setField(field, value) {
      this.fields[field] = value;
    },
    async saveTx() {
      this.saved += 1;
    },
    isRegularItem() {
      return true;
    },
    isNote() {
      return false;
    },
    isAttachment() {
      return false;
    },
    getNotes() {
      return [];
    },
  };
}

interface StubOptions {
  libraries?: Array<{ libraryID: number; libraryType: string }>;
  items?: StubItem[];
  /** When true, `Items.getAll` resolves on the next macrotask. */
  delayed?: boolean;
  /** Library ids whose `getItems()` reports items (used by the fallback path). */
  fallbackLibraryIDs?: number[];
}

function installZoteroStub(options: StubOptions = {}) {
  const libraries = options.libraries ?? [
    { libraryID: 1, libraryType: "user" },
    { libraryID: 2, libraryType: "feed" },
  ];
  const items = options.items ?? [];
  const fallbackLibraryIDs =
    options.fallbackLibraryIDs ?? libraries.map((l) => l.libraryID);
  const calls: string[] = [];

  const Zotero = {
    Libraries: {
      userLibraryID: 1,
      getAll: () =>
        libraries.map((library) => ({
          ...library,
          getItems: () => items.map((item) => item.id),
        })),
      get: (id: number) =>
        libraries.find((library) => library.libraryID === id),
    },
    Items: {
      get: (id: number) => items.find((item) => item.id === id),
      getAll: async (libraryID: number) => {
        calls.push(`getAll:${libraryID}`);
        if (options.delayed) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return items.filter((item) => item.libraryID === libraryID);
      },
    },
    Prefs: {
      get: () => undefined,
      set: () => undefined,
      clear: () => undefined,
      registerObserver: () => Symbol("pref"),
    },
    Notifier: {
      trigger: () => undefined,
      registerObserver: () => 1,
      unregisterObserver: () => undefined,
    },
    Promise: { delay: (ms: number) => new Promise((r) => setTimeout(r, ms)) },
    getMainWindows: () => [],
  };

  (globalThis as any).Zotero = Zotero;
  (globalThis as any).ztoolkit = {
    log: () => undefined,
    getGlobal: (name: string) => (Zotero as any)[name],
    ProgressWindow: class {
      createLine() {
        return this;
      }

      show() {
        return this;
      }

      changeLine() {
        return this;
      }

      startCloseTimer() {
        return this;
      }
    },
  };
  // The localized strings come from the FTL files at runtime.
  (globalThis as any).addon = {
    data: {
      locale: {
        current: {
          formatMessagesSync: (entries: Array<{ id: string }>) =>
            entries.map((entry) => ({ value: entry.id })),
        },
      },
    },
  };

  return { Zotero, calls, items };
}

describe("IdentifyManager.allItems", () => {
  it("awaits the async Items.getAll and skips feed libraries", async () => {
    const userItem = makeItem(1, 1, "journalArticle");
    const feedItem = makeItem(2, 2, "journalArticle");
    const { calls } = installZoteroStub({
      items: [userItem, feedItem],
      delayed: true,
    });

    const manager = new IdentifyManager();
    const items = await manager.allItems();

    equal(items.length, 1, "only the user library item is returned");
    equal(items[0].id, 1);
    ok(
      calls.includes("getAll:1"),
      "Zotero.Items.getAll must be called with a library id",
    );
    ok(!calls.includes("getAll:2"), "feed libraries are skipped");
  });

  it("returns a promise, never an array-like of a promise", async () => {
    const { items } = installZoteroStub({
      items: [makeItem(1, 1, "journalArticle")],
      delayed: true,
    });
    const manager = new IdentifyManager();
    const result = manager.allItems();
    ok(typeof (result as Promise<unknown>).then === "function");
    const list = await result;
    equal(list.length, 1);
    void items;
  });

  it("walks every library when several exist", async () => {
    const { calls } = installZoteroStub({
      libraries: [
        { libraryID: 1, libraryType: "user" },
        { libraryID: 5, libraryType: "group" },
      ],
      items: [
        makeItem(1, 1, "journalArticle"),
        makeItem(2, 5, "journalArticle"),
      ],
    });
    const manager = new IdentifyManager();
    const items = await manager.allItems();
    equal(items.length, 2);
    ok(calls.includes("getAll:1") && calls.includes("getAll:5"));
  });

  it("remains usable when a library listing fails", async () => {
    const item = makeItem(7, 1, "journalArticle");
    const other = makeItem(8, 3, "journalArticle");
    const { Zotero } = installZoteroStub({
      libraries: [
        { libraryID: 1, libraryType: "user" },
        { libraryID: 3, libraryType: "group" },
      ],
      items: [item, other],
    });
    const original = Zotero.Items.getAll;
    let calls = 0;
    (Zotero.Items as any).getAll = async (libraryID: number) => {
      calls++;
      // Fail the first library only: the listing as a whole must still work.
      if (libraryID === 1) throw new Error("db busy");
      return original(libraryID);
    };
    const manager = new IdentifyManager();
    const items = await manager.allItems();
    ok(calls >= 1, "the listing is attempted");
    equal(items.length, 1, "the healthy library is still returned");
    equal(items[0].id, 8);
  });

  it("collectItems lists through Items.getAll, not a library method", async () => {
    const item = makeItem(7, 1, "journalArticle");
    const { calls } = installZoteroStub({ items: [item] });
    const manager = new IdentifyManager();
    // `Zotero.Library` has no `getItems()`, so a listing that relied on it
    // silently produced an empty scan.
    const found = await manager.collectItems();
    ok(
      calls.includes("getAll:1"),
      "Items.getAll(libraryID) must be used to list a library",
    );
    equal(found.length, 1, "the scan must see the item");
    equal(found[0].id, 7);

    const single = await manager.collectItems(1);
    equal(single.length, 1, "a single library can be listed too");
    equal((await manager.collectItems(99)).length, 0, "unknown library");
  });
});
