import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EXTRA_KEYS,
  getExtraValue,
  mergeExtra,
  mergeRecord,
  parseLegacyNoteContent,
  parseRankRecord,
  recordFromLegacyCcfInfo,
} from "../src/modules/record";
import {
  DEFAULT_TEMPLATE,
  applyTemplate,
  renderSummary,
  validateTemplate,
} from "../src/modules/summary";

describe("extra field record", () => {
  it("appends the managed keys and keeps everything else", () => {
    const extra = "Citation Key: vaswani2017\nNote: keep me";
    const merged = mergeExtra(extra, {
      ccf: "A",
      ccfVenue: "NeurIPS",
      cas: "1区",
      casVenue: "ADVANCES IN NEURAL INFORMATION PROCESSING SYSTEMS",
      venueType: "conference",
      source: "dblp",
      updated: "2026-09-12",
    });
    ok(merged.startsWith("Citation Key: vaswani2017\nNote: keep me\n"));
    ok(merged.includes("CCF-RANK: A"));
    ok(merged.includes("CCF-VENUE: NeurIPS"));
    ok(merged.includes("CAS-ZONE: 1区"));
    ok(merged.includes("VENUE-TYPE: conference"));
  });

  it("replaces previous values instead of duplicating them", () => {
    const first = mergeExtra("", { ccf: "B", ccfVenue: "ICSE" });
    const second = mergeExtra(first, { ccf: "A", ccfVenue: "ICSE" });
    equal(second.match(/CCF-RANK:/g)?.length, 1);
    equal(getExtraValue(second, EXTRA_KEYS.ccf), "A");
  });

  it("round-trips through the parser", () => {
    const merged = mergeExtra("", {
      ccf: "None",
      ccfVenue: "COLM",
      cas: "3区",
      citation: "42",
    });
    const record = parseRankRecord(merged);
    equal(record.ccf, "None");
    equal(record.ccfVenue, "COLM");
    equal(record.cas, "3区");
    equal(record.citation, "42");
  });

  it("keeps the extra field clean when there is nothing to write", () => {
    equal(mergeExtra("Citation Key: x", {}), "Citation Key: x");
  });

  it("merges partial updates", () => {
    const record = mergeRecord(
      { ccf: "A", ccfVenue: "TPAMI" },
      { cas: "1区", ccf: undefined },
    );
    equal(record.ccf, "A");
    equal(record.cas, "1区");
  });
});

describe("legacy note migration", () => {
  it("reads the JSON blob out of the old note HTML", () => {
    const html =
      '<div><b>CCF Info &amp; Citations</b></div><div><br /></div><div><pre>{\n  "ccfInfo": "CCF-A TPAMI",\n  "citationNumber": "128"\n}</pre></div>';
    const parsed = parseLegacyNoteContent(html);
    equal(parsed?.ccfInfo, "CCF-A TPAMI");
    equal(parsed?.citationNumber, "128");
  });

  it("ignores unrelated notes", () => {
    equal(parseLegacyNoteContent("<div>just a note</div>"), undefined);
  });

  it("converts the old label into a record", () => {
    equal(recordFromLegacyCcfInfo("CCF-A TPAMI", "128").ccf, "A");
    equal(recordFromLegacyCcfInfo("CCF-A TPAMI", "128").ccfVenue, "TPAMI");
    equal(recordFromLegacyCcfInfo("CCF-None COLM").ccf, "None");
    equal(recordFromLegacyCcfInfo("CCF-None COLM").ccfVenue, "COLM");
    equal(recordFromLegacyCcfInfo("Not Found").ccf, undefined);
    equal(
      recordFromLegacyCcfInfo("CCF-B ICSE", "Not Found").citation,
      undefined,
    );
  });
});

describe("summary rendering", () => {
  const options = {
    noCcf: "无分区",
    preprint: "arXiv预印本",
    notApplicable: "不适用",
    noCas: "无中科院分区",
    ccfPrefix: true,
    separator: " ",
    typeLabels: {
      journal: "期刊",
      conference: "会议",
      preprint: "预印本",
      other: "其它",
    },
  };

  it("renders the default CCF + CAS + venue line", () => {
    const text = renderSummary(
      {
        ccf: "A",
        ccfVenue: "TPAMI",
        cas: "1区",
        casVenue:
          "IEEE TRANSACTIONS ON PATTERN ANALYSIS AND MACHINE INTELLIGENCE",
        venueType: "journal",
      },
      DEFAULT_TEMPLATE,
      options,
    );
    equal(text, "中科院1区 CCF-A TPAMI");
  });

  it("falls back to the placeholders", () => {
    equal(
      renderSummary(
        { ccf: "None", ccfVenue: "COLM", venueType: "conference" },
        DEFAULT_TEMPLATE,
        options,
      ),
      "无分区 COLM",
    );
    equal(
      renderSummary(
        { ccf: "None", ccfVenue: "arXiv", venueType: "preprint" },
        DEFAULT_TEMPLATE,
        options,
        { isPreprint: true },
      ),
      "arXiv预印本 arXiv",
    );
    equal(
      renderSummary(
        { ccf: "NotApplicable", venueType: "other" },
        DEFAULT_TEMPLATE,
        options,
        { notApplicable: true },
      ),
      "不适用",
    );
    equal(renderSummary({}, DEFAULT_TEMPLATE, options), "");
    equal(renderSummary(undefined, DEFAULT_TEMPLATE, options), "");
  });

  it("honours a custom template", () => {
    const text = renderSummary(
      { ccf: "A", ccfVenue: "TPAMI", cas: "1区", venueType: "journal" },
      "{ccf} | {cas} | {venue} ({typeLabel}, {year})",
      options,
      { year: "2024" },
    );
    equal(text, "CCF-A | 中科院1区 | TPAMI (期刊, 2024)");
  });

  it("can render the CCF rank without the prefix", () => {
    equal(
      renderSummary(
        { ccf: "B", ccfVenue: "ICSE", cas: "2区", venueType: "conference" },
        "{ccf} {cas} {venue}",
        { ...options, ccfPrefix: false },
      ),
      "B 中科院2区 ICSE",
    );
  });

  it("expands block placeholders with the separator", () => {
    equal(
      applyTemplate("{ccf}", { ccf: "CCF-A TPAMI" } as never, " · "),
      "CCF-A · TPAMI",
    );
  });

  it("validates templates", () => {
    equal(validateTemplate("{ccf} {cas}").valid, true);
    equal(validateTemplate("{nope}").valid, false);
    equal(validateTemplate("no placeholder").valid, false);
    equal(validateTemplate("{ccf} {nope}").unknown[0], "nope");
  });
});
