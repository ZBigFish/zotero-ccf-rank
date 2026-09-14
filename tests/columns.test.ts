import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import {
  casText,
  ccfText,
  citationText,
  columnLabel,
  itemIsPreprint,
  readRecordOf,
  summaryText,
} from "../src/modules/columns";
import { mergeExtra } from "../src/modules/record";

/**
 * Column rendering.
 *
 * `summaryText` is what the user actually reads in the item tree, and it is
 * also what the item-pane row shows, so its behaviour for every record shape is
 * pinned down here.
 */

const PREFS = new Map<string, unknown>([
  ["extensions.zotero.ccfrank.summaryTemplate", "{cas} {ccf} {venue}"],
  ["extensions.zotero.ccfrank.separator", " "],
  ["extensions.zotero.ccfrank.ccfPrefix", true],
  ["extensions.zotero.ccfrank.placeholderNoCcf", "无分区"],
  ["extensions.zotero.ccfrank.placeholderPreprint", "arXiv预印本"],
  ["extensions.zotero.ccfrank.placeholderNotApplicable", "不适用"],
  ["extensions.zotero.ccfrank.placeholderNoCas", "无中科院分区"],
  ["extensions.zotero.ccfrank.summaryColumnLabel", ""],
  ["extensions.zotero.ccfrank.ccfColumnLabel", ""],
  ["extensions.zotero.ccfrank.casColumnLabel", ""],
  ["extensions.zotero.ccfrank.citationColumnLabel", ""],
]);

function installStubs() {
  (globalThis as any).Zotero = {
    Prefs: { get: (key: string) => PREFS.get(key) },
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
}

const LABELS: Record<string, string> = {
  "column-summary": "分区汇总",
  "column-ccf": "CCF 分区",
  "column-cas": "中科院分区",
  "column-citation": "引用次数",
  "type-journal": "期刊",
  "type-conference": "会议",
  "type-preprint": "预印本",
  "type-other": "其它",
};

function makeItem(extra: string, fields: Record<string, string> = {}) {
  return {
    id: 1,
    itemTypeID: 1,
    itemType: "journalArticle",
    getField: (field: string) =>
      field === "extra" ? extra : (fields[field] ?? ""),
    isRegularItem: () => true,
    isNote: () => false,
    isAttachment: () => false,
  } as unknown as Zotero.Item;
}

describe("column rendering", () => {
  it("renders the summary of a ranked journal with a CAS zone", () => {
    installStubs();
    const item = makeItem(
      mergeExtra("", {
        ccf: "A",
        ccfVenue: "TPAMI",
        cas: "1区",
        venueType: "journal",
        updated: "2026-09-12",
      }),
      { date: "2024" },
    );
    equal(summaryText(item), "中科院1区 CCF-A TPAMI");
  });

  it("renders a conference without a CAS zone", () => {
    installStubs();
    const item = makeItem(
      mergeExtra("", {
        ccf: "A",
        ccfVenue: "NeurIPS",
        venueType: "conference",
      }),
    );
    equal(summaryText(item), "CCF-A NeurIPS");
  });

  it("renders an arXiv preprint", () => {
    installStubs();
    const item = makeItem(
      mergeExtra("", {
        ccf: "None",
        ccfVenue: "arXiv",
        venueType: "preprint",
      }),
      { repository: "arXiv" },
    );
    equal(summaryText(item), "arXiv预印本 arXiv");
    equal(ccfText(item), "arXiv预印本");
    equal(casText(item), "");
  });

  it("renders an unranked but known venue", () => {
    installStubs();
    const item = makeItem(
      mergeExtra("", {
        ccf: "None",
        ccfVenue: "COLM",
        venueType: "conference",
      }),
    );
    equal(summaryText(item), "无分区 COLM");
    equal(ccfText(item), "无分区");
  });

  it("renders the not-applicable placeholder for books", () => {
    installStubs();
    const item = makeItem(
      mergeExtra("", { ccf: "NotApplicable", venueType: "other" }),
    );
    equal(ccfText(item), "不适用");
    ok(summaryText(item).includes("不适用"));
  });

  it("stays empty for an item that was never identified", () => {
    installStubs();
    const item = makeItem("Citation Key: x");
    equal(summaryText(item), "");
    equal(ccfText(item), "");
    equal(casText(item), "");
    equal(citationText(item), "");
    equal(readRecordOf(item).ccf, undefined);
  });

  it("shows a migrated citation count", () => {
    installStubs();
    const item = makeItem(
      mergeExtra("", { ccf: "A", ccfVenue: "TPAMI", citation: "128" }),
    );
    equal(citationText(item), "128");
  });

  it("ignores notes and attachments", () => {
    installStubs();
    const note = {
      id: 2,
      itemTypeID: 1,
      getField: () => "CCF-RANK: A",
      isRegularItem: () => false,
      isNote: () => true,
      isAttachment: () => false,
    } as unknown as Zotero.Item;
    equal(summaryText(note), "");
    equal(ccfText(note), "");
  });

  it("uses the preference override for column labels", () => {
    installStubs();
    equal(columnLabel("summaryColumnLabel", "column-summary"), "分区汇总");
    PREFS.set("extensions.zotero.ccfrank.summaryColumnLabel", "My Rank");
    equal(columnLabel("summaryColumnLabel", "column-summary"), "My Rank");
    PREFS.set("extensions.zotero.ccfrank.summaryColumnLabel", "");
  });

  it("recognizes preprints from the repository field", () => {
    installStubs();
    const item = makeItem("", { repository: "arXiv" });
    equal(itemIsPreprint(item, {}), true);
    equal(itemIsPreprint(makeItem("", {}), {}), false);
    equal(itemIsPreprint(makeItem("", {}), { venueType: "preprint" }), true);
  });

  it("honours a custom summary template", () => {
    installStubs();
    PREFS.set(
      "extensions.zotero.ccfrank.summaryTemplate",
      "{ccf} | {venue} · {cas}",
    );
    const item = makeItem(
      mergeExtra("", {
        ccf: "B",
        ccfVenue: "ICSE",
        cas: "2区",
        venueType: "conference",
      }),
    );
    equal(summaryText(item), "CCF-B | ICSE · 中科院2区");
    PREFS.set(
      "extensions.zotero.ccfrank.summaryTemplate",
      "{cas} {ccf} {venue}",
    );
  });
});
