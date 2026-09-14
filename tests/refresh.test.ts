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

import {
  cancelRepaint,
  refreshAll,
  refreshRow,
  repaintAfterWindowLoad,
} from "../src/modules/columns";

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
  const win: any = {
    ZoteroPane: { itemsView: view },
    closed: false,
    __timers: [] as Array<{ id: number; handler: () => void; delay: number }>,
    setTimeout(handler: () => void, delay: number) {
      const id = win.__timers.length + 1;
      win.__timers.push({ id, handler, delay });
      return id;
    },
    clearTimeout(id: number) {
      win.__timers = win.__timers.filter((timer: any) => timer.id !== id);
    },
    /** Run every timer scheduled so far, as the event loop eventually would. */
    runTimers() {
      const pending = win.__timers.splice(0);
      for (const timer of pending) timer.handler();
    },
  };
  (globalThis as any).Zotero = {
    getMainWindows: () => [win],
    ItemTreeManager: { refreshColumns: () => undefined },
  };
  return { view, win };
}

describe("item tree repainting", () => {
  it("drops the cached row so the provider runs again", () => {
    const { view } = installZotero({
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
    const { view } = installZotero({ 1: {}, 2: {} });
    refreshAll();
    equal(Object.keys(view._rowCache).length, 0);
    ok(view.invalidated > 0);
  });

  it("clears the cache again shortly after a window loads", () => {
    // The one-shot refresh at the end of `onStartup` does not cover the case
    // where Zotero builds its item tree while the plugin is still waiting on
    // `initializationPromise`: those rows are cached empty and stay empty. This
    // is the "the column is blank until I press refresh" report.
    const { view, win } = installZotero({ 1: { ccfRankSummary: "" } });
    repaintAfterWindowLoad(win as never);
    equal(win.__timers.length, 3, "a few retries are scheduled");

    win.runTimers();
    equal(Object.keys(view._rowCache).length, 0, "the cache is dropped");
    ok(view.invalidated >= 3, "the tree repaints each time");
  });

  it("cancels its timers when the window goes away", () => {
    // A timer firing into a destroyed window throws inside Zotero.
    const { win } = installZotero();
    repaintAfterWindowLoad(win as never);
    equal(win.__timers.length, 3);

    cancelRepaint(win as never);
    equal(win.__timers.length, 0, "nothing is left to fire");
    // Cancelling twice, or a window that was never repainted, is harmless.
    cancelRepaint(win as never);
    cancelRepaint({} as never);
  });

  it("does not touch a window that is already closed", () => {
    const { view, win } = installZotero({ 1: {} });
    repaintAfterWindowLoad(win as never);
    win.closed = true;
    win.runTimers();
    equal(
      Object.keys(view._rowCache).length,
      1,
      "a closed window is left alone",
    );
  });
});
