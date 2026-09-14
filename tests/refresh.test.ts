/**
 * Row repainting.
 *
 * Zotero builds every cell of a row once into `itemTree._rowCache[itemID]` and
 * serves it from there. A row read while the item had no rank therefore keeps
 * rendering an empty cell however often it is invalidated — which is exactly the
 * "the column stays empty after a scan" report. These tests pin the cache drop
 * down, because losing it silently brings the bug back.
 */
import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import { refreshAll, refreshRow } from "../src/modules/columns";

interface FakeView {
  _rowCache: Record<number, Record<string, string>>;
  invalidated: number;
  invalidatedRows: number[];
  tree: { invalidate: () => void; invalidateRow: (index: number) => void };
  getRowIndexByID: (id: string) => number;
}

function installZotero(cache: Record<number, Record<string, string>> = {}) {
  const view: FakeView = {
    _rowCache: cache,
    invalidated: 0,
    invalidatedRows: [],
    tree: {
      invalidate() {
        view.invalidated += 1;
      },
      invalidateRow(index: number) {
        view.invalidatedRows.push(index);
      },
    },
    getRowIndexByID: (id: string) => Number(id) - 1,
  };
  (globalThis as any).Zotero = {
    getMainWindows: () => [{ ZoteroPane: { itemsView: view } }],
    ItemTreeManager: { refreshColumns: () => undefined },
  };
  return view;
}

describe("item tree repainting", () => {
  it("drops the cached row so the provider runs again", () => {
    const view = installZotero({
      7: { ccfRankSummary: "" },
      8: { ccfRankSummary: "CCF-A ICML" },
    });

    refreshRow(7);

    equal(7 in view._rowCache, false, "the stale row must be forgotten");
    equal(8 in view._rowCache, true, "other rows are left alone");
    ok(view.invalidated > 0, "the tree is asked to repaint");
    equal(view.invalidatedRows.join(","), "6", "the row itself is invalidated");
  });

  it("survives a window without an item tree", () => {
    (globalThis as any).Zotero = {
      getMainWindows: () => [{ ZoteroPane: {} }, {}],
      ItemTreeManager: {},
    };
    refreshRow(1);
    refreshAll();
    ok(true, "no exception");
  });

  it("clears every row when the whole tree is refreshed", () => {
    const view = installZotero({ 1: {}, 2: {} });
    refreshAll();
    equal(Object.keys(view._rowCache).length, 0);
    ok(view.invalidated > 0);
  });
});
