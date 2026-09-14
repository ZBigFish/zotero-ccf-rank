import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import { collectVenueCandidates } from "../src/modules/venue/itemFields";
import { resolveVenueFromCandidates } from "../src/modules/venue/resolver";
import { mergeExtra, parseRankRecord } from "../src/modules/record";
import { renderSummary } from "../src/modules/summary";

/**
 * End-to-end check of the offline half of the pipeline:
 *
 *   Zotero item fields -> catalog match -> record -> summary line
 *
 * (The online half — DBLP and LetPub — is covered by `cas.test.ts` for the
 * parsing side and by the live probe for the request side.)
 */

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
    other: "其它",
  },
};

interface Fixture {
  itemType: string;
  fields: Record<string, string>;
  /** Expected venue abbreviation, or undefined when nothing should match. */
  expectAbbr?: string;
  /** Expected CCF rank, or undefined for unranked/unknown venues. */
  expectRank?: string;
  /** Expected summary when no CAS data is present. */
  expectSummary: string;
}

function item(fixture: Fixture) {
  return {
    itemType: fixture.itemType,
    getField: (field: string) => fixture.fields[field] ?? "",
  };
}

const FIXTURES: Fixture[] = [
  {
    itemType: "journalArticle",
    fields: {
      publicationTitle:
        "IEEE Transactions on Pattern Analysis and Machine Intelligence",
      ISSN: "0162-8828",
    },
    expectAbbr: "TPAMI",
    expectRank: "A",
    expectSummary: "无中科院分区 CCF-A TPAMI",
  },
  {
    itemType: "journalArticle",
    fields: { publicationTitle: "IEEE Trans. Pattern Anal. Mach. Intell." },
    expectAbbr: "TPAMI",
    expectRank: "A",
    expectSummary: "无中科院分区 CCF-A TPAMI",
  },
  {
    itemType: "conferencePaper",
    fields: {
      proceedingsTitle:
        "Proceedings of the 2024 IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)",
      conferenceName:
        "IEEE/CVF Conference on Computer Vision and Pattern Recognition",
    },
    expectAbbr: "CVPR",
    expectRank: "A",
    expectSummary: "CCF-A CVPR",
  },
  {
    itemType: "conferencePaper",
    fields: {
      conferenceName:
        "The 28th Annual Conference on Neural Information Processing Systems",
    },
    expectAbbr: "NeurIPS",
    expectRank: "A",
    expectSummary: "CCF-A NeurIPS",
  },
  {
    itemType: "conferencePaper",
    fields: {
      conferenceName:
        "27th ACM Symposium on Operating Systems Principles, Shanghai, China",
    },
    expectAbbr: "SOSP",
    expectRank: "A",
    expectSummary: "CCF-A SOSP",
  },
  {
    itemType: "journalArticle",
    fields: { publicationTitle: "ACM Computing Surveys" },
    expectAbbr: "CSUR",
    expectSummary: "无中科院分区 无分区 CSUR",
  },
  {
    itemType: "journalArticle",
    fields: { publicationTitle: "Journal of Totally Unrelated Studies" },
    expectSummary: "无分区",
  },
  {
    itemType: "conferencePaper",
    fields: { conferenceName: "Conference on Language Modeling" },
    expectAbbr: "COLM",
    expectSummary: "无分区 COLM",
  },
];

describe("identification pipeline (offline)", () => {
  for (const fixture of FIXTURES) {
    const label = `${fixture.itemType}: ${
      fixture.fields.publicationTitle ||
      fixture.fields.proceedingsTitle ||
      fixture.fields.conferenceName
    }`;

    it(`matches ${label}`, () => {
      const candidates = collectVenueCandidates(item(fixture));
      const match = resolveVenueFromCandidates(candidates.values);

      if (fixture.expectAbbr) {
        equal(match?.abbr, fixture.expectAbbr, "venue abbreviation");
        equal(match?.ccf, fixture.expectRank, "CCF rank");
      } else {
        equal(match, undefined, "no match expected");
      }

      // Build the record the way `identifyItem` does when DBLP is unavailable.
      const record = {
        ccf: match ? (match.ccf ?? "None") : "None",
        ccfVenue: match ? match.abbr || match.full || "" : "",
        venueType: match?.path?.startsWith("/journals")
          ? "journal"
          : "conference",
      };
      const summary = renderSummary(record, "{cas} {ccf} {venue}", OPTIONS);
      equal(summary, fixture.expectSummary, "summary line");

      // The record must survive a round-trip through the Extra field.
      const extra = mergeExtra("", record);
      const parsed = parseRankRecord(extra);
      equal(parsed.ccf, record.ccf);
      if (record.ccfVenue) {
        equal(parsed.ccfVenue, record.ccfVenue);
      } else {
        equal(parsed.ccfVenue, undefined);
        ok(
          !extra.includes("CCF-VENUE"),
          "an unknown venue writes no CCF-VENUE line",
        );
      }
    });
  }

  it("reports arXiv preprints separately", () => {
    const candidates = collectVenueCandidates({
      itemType: "preprint",
      getField: (field: string) =>
        field === "repository"
          ? "arXiv"
          : field === "publicationTitle"
            ? "arXiv"
            : "",
    });
    equal(candidates.flags.isPreprint, true);
    const summary = renderSummary(
      { ccf: "None", ccfVenue: "arXiv", venueType: "preprint" },
      "{cas} {ccf} {venue}",
      OPTIONS,
      { isPreprint: true },
    );
    equal(summary, "arXiv预印本 arXiv");
  });

  it("keeps a CAS zone when it is already known", () => {
    const summary = renderSummary(
      {
        ccf: "A",
        ccfVenue: "TPAMI",
        cas: "1区",
        casVenue:
          "IEEE TRANSACTIONS ON PATTERN ANALYSIS AND MACHINE INTELLIGENCE",
        venueType: "journal",
      },
      "{cas} {ccf} {venue}",
      OPTIONS,
    );
    equal(summary, "中科院1区 CCF-A TPAMI");
  });

  it("marks books and theses as not applicable", () => {
    const candidates = collectVenueCandidates({
      itemType: "book",
      getField: () => "",
    });
    equal(candidates.kindHint, "other");
    equal(candidates.values.length, 0);
    const summary = renderSummary(
      { ccf: "NotApplicable", venueType: "other" },
      "{cas} {ccf} {venue}",
      OPTIONS,
      { notApplicable: true },
    );
    equal(summary, "不适用");
  });

  it("resolves a venue through a user alias", () => {
    const aliases = JSON.parse(
      JSON.stringify([
        {
          match: "Journal of Fancy Studies",
          abbr: "JFS",
          ccf: "C",
          cas: "3区",
        },
      ]),
    );
    const candidates = collectVenueCandidates({
      itemType: "journalArticle",
      getField: (field: string) =>
        field === "publicationTitle" ? "Journal of Fancy Studies" : "",
    });
    const match = resolveVenueFromCandidates(candidates.values, aliases);
    equal(match?.abbr, "JFS");
    equal(match?.ccf, "C");
    equal(match?.cas, "3区");
    const summary = renderSummary(
      { ccf: "C", ccfVenue: "JFS", cas: "3区", venueType: "journal" },
      "{cas} {ccf} {venue}",
      OPTIONS,
    );
    equal(summary, "中科院3区 CCF-C JFS");
  });
});
