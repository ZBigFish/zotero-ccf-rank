/**
 * CNS (Cell / Nature / Science) flagship detection.
 *
 * The point of the attribute is that "无分区" is wrong for these journals: CCF
 * does not rank them, which is not the same as them being unranked. The negative
 * cases matter as much as the positive ones — if "Scientific Reports" or
 * "Science of the Total Environment" were labelled authoritative, the attribute
 * would be worthless.
 */
import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TOP_JOURNALS,
  decodeTopJournal,
  encodeTopJournal,
  isTopMainJournal,
  normalizeIssnKey,
  topJournalByIssn,
  topJournalByName,
} from "../src/data/topJournals";
import { DEFAULT_TEMPLATE, renderSummary } from "../src/modules/summary";

const OPTIONS = {
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
    other: "",
  },
};

function render(record: Parameters<typeof renderSummary>[0]) {
  return renderSummary(record, DEFAULT_TEMPLATE, OPTIONS, {
    year: "2024",
    isPreprint: record?.venueType === "preprint",
    notApplicable: record?.ccf === "NotApplicable",
  });
}

describe("CNS flagship catalog", () => {
  it("recognizes the three main journals", () => {
    for (const name of ["Nature", "Science", "Cell"]) {
      const journal = topJournalByName(name);
      ok(journal, `${name} must be known`);
      equal(journal.kind, "main");
      ok(isTopMainJournal(journal));
      equal(journal.abbr, name);
    }
  });

  it("recognizes the major sub-journals with their abbreviation", () => {
    const expected: Array<[string, string, string]> = [
      ["Nature Communications", "NC", "nature"],
      ["Nature Machine Intelligence", "NMI", "nature"],
      ["Nature Neuroscience", "NN", "nature"],
      ["Science Advances", "SciAdv", "science"],
      ["Science Robotics", "SciRobot", "science"],
      ["Cell Reports", "CellRep", "cell"],
      ["Molecular Cell", "MolCell", "cell"],
      ["Trends in Cognitive Sciences", "TiCS", "cell"],
    ];
    for (const [name, abbr, family] of expected) {
      const journal = topJournalByName(name);
      ok(journal, `${name} must be known`);
      equal(journal.abbr, abbr);
      equal(journal.family, family);
      equal(journal.kind, "sub");
    }
  });

  it("rejects the pay-to-publish long tail", () => {
    // These are the journals that must NOT be called authoritative: listing them
    // would make the attribute meaningless.
    for (const name of [
      "Scientific Reports",
      "PLOS ONE",
      "Nature Precedings",
      "Science of the Total Environment",
      "Nature Communications Biology",
      "Cell Death & Disease",
      "",
    ]) {
      equal(topJournalByName(name), undefined, `${name} must not match`);
    }
  });

  it("recognizes by ISSN, so a renamed journal still matches", () => {
    equal(topJournalByIssn("2041-1723")?.abbr, "NC");
    equal(topJournalByIssn("20411723")?.abbr, "NC");
    equal(topJournalByIssn("0036-8075")?.abbr, "Science");
    equal(topJournalByIssn("0092-8674")?.abbr, "Cell");
    // A partial or foreign number is not a match.
    equal(topJournalByIssn("2041"), undefined);
    equal(topJournalByIssn("1234-5678"), undefined);
    equal(normalizeIssnKey("2041-1723"), "20411723");
  });

  it("round-trips the Extra line", () => {
    const journal = topJournalByName("Nature Communications");
    ok(journal);
    const encoded = encodeTopJournal(journal);
    equal(encoded, "nature:sub:NC:Nature Communications");
    const decoded = decodeTopJournal(encoded);
    equal(decoded?.abbr, "NC");
    equal(decoded?.familyLabel, "Nature");
    // A hand-edited line still decodes enough to render.
    equal(decodeTopJournal("science:sub:SciAdv")?.abbr, "SciAdv");
    equal(decodeTopJournal(""), undefined);
    equal(decodeTopJournal("garbage"), undefined);
  });

  it("has no duplicate abbreviations or ISSNs", () => {
    const abbrs = new Set<string>();
    const issns = new Set<string>();
    for (const journal of TOP_JOURNALS) {
      const key = `${journal.family}:${journal.abbr}`;
      ok(!abbrs.has(key), `duplicate abbreviation ${key}`);
      abbrs.add(key);
      for (const issn of journal.issn ?? []) {
        const normalized = normalizeIssnKey(issn);
        equal(
          normalized.length,
          8,
          `${journal.name}: ISSN ${issn} is malformed`,
        );
        ok(!issns.has(normalized), `duplicate ISSN ${issn}`);
        issns.add(normalized);
      }
    }
    ok(abbrs.size >= 40, `expected a broad catalog, got ${abbrs.size}`);
  });

  it("lists an ISSN for every journal", () => {
    // Without an ISSN the detection relies on the name alone, which breaks for
    // renamed or abbreviated records.
    for (const journal of TOP_JOURNALS) {
      ok(
        (journal.issn ?? []).length > 0,
        `${journal.name} needs at least one ISSN`,
      );
    }
  });
});

describe("CNS journals in the summary", () => {
  it("shows only the journal, without the 中科院 zone", () => {
    const text = render({
      ccf: "None",
      cas: "1区",
      ccfVenue: "Nature Communications",
      venueType: "journal",
      topJournal: "nature:sub:NC:Nature Communications",
    });
    equal(text, "Nature子刊 NC");
    ok(!text.includes("中科院"), "the zone is redundant next to a CNS journal");
    ok(!text.includes("无分区"), "the misleading placeholder must be gone");
  });

  it("asks for the main journal as a bare name", () => {
    const cases: Array<[string, string]> = [
      ["nature:main:Nature:Nature", "Nature"],
      ["science:main:Science:Science", "Science"],
      ["cell:main:Cell:Cell", "Cell"],
    ];
    for (const [encoded, expected] of cases) {
      const abbr = encoded.split(":")[2];
      equal(
        render({
          ccf: "None",
          cas: "1区",
          ccfVenue: abbr,
          venueType: "journal",
          topJournal: encoded,
        }),
        expected,
      );
    }
  });

  it("keeps the rest of the template around the journal", () => {
    // Only the zone disappears — a year or citation the user added still shows.
    const text = renderSummary(
      {
        ccf: "None",
        cas: "1区",
        ccfVenue: "Nature Communications",
        venueType: "journal",
        topJournal: "nature:sub:NC:Nature Communications",
        citation: "128",
      },
      "{cas} {top} {year} ({citation})",
      OPTIONS,
      { year: "2024" },
    );
    equal(text, "Nature子刊 NC 2024 (128)");
  });

  it("leaves ordinary journals exactly as before", () => {
    equal(
      render({
        ccf: "A",
        ccfVenue: "TPAMI",
        cas: "1区",
        venueType: "journal",
      }),
      "中科院1区 CCF-A TPAMI",
    );
    equal(
      render({ ccf: "None", ccfVenue: "COLM", venueType: "conference" }),
      "无分区 COLM",
    );
  });

  it("is empty for items without a CNS journal", () => {
    equal(
      render({ ccf: "B", ccfVenue: "ICSE", venueType: "conference" }),
      "CCF-B ICSE",
    );
  });
});
