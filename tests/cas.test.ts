import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildSearchUrl,
  hitToEntry,
  parseSearchResults,
  pickBestHit,
} from "../src/modules/cas/parse";
import { normalizeZone } from "../src/modules/cas/types";
import { normalizeJournalKey } from "../src/modules/venue/normalize";

const fixture = readFileSync(
  join(__dirname, "..", "..", "tests", "fixtures", "letpub-search-pami.html"),
  "utf8",
);

function row(
  issn: string,
  journalId: number,
  name: string,
  abbr: string,
  metrics: string,
  zone: string,
  categories: string,
): string {
  const cell = (content: string) => `<td class="c">${content}</td>`;
  return (
    `<tr>` +
    cell(issn) +
    cell(
      `<a href="./index.php?journalid=${journalId}&page=journalapp&view=detail">${name}</a><br><font color="grey">${abbr}</font>`,
    ) +
    cell("4.0") +
    cell(metrics) +
    cell(zone) +
    cell(categories) +
    cell("SCIE") +
    cell("No") +
    cell("容易") +
    cell("约3.0个月") +
    cell("100") +
    cell("10") +
    `</tr>`
  );
}

describe("CAS zone normalization", () => {
  it("accepts the formats used by the data sources", () => {
    equal(normalizeZone("1区"), "1区");
    equal(normalizeZone("2 区"), "2区");
    equal(normalizeZone("一区"), "1区");
    equal(normalizeZone("三区"), "3区");
    equal(normalizeZone("Q4"), "4区");
    equal(normalizeZone("1"), "1区");
  });

  it("rejects values that are not a zone", () => {
    equal(normalizeZone(""), undefined);
    equal(normalizeZone("5区"), undefined);
    equal(normalizeZone("SCI"), undefined);
    equal(normalizeZone(undefined), undefined);
  });
});

describe("LetPub search URL", () => {
  it("encodes the journal name and dashes the ISSN", () => {
    const url = buildSearchUrl({ name: "IEEE Transactions on Computers" });
    ok(url.includes("searchname=IEEE%20Transactions%20on%20Computers"));
    ok(buildSearchUrl({ issn: "00189340" }).includes("searchissn=0018-9340"));
  });
});

describe("LetPub search result parsing", () => {
  it("parses a real page", () => {
    const hits = parseSearchResults(fixture);
    equal(hits.length, 1);
    const hit = hits[0];
    equal(hit.issn, "0162-8828");
    equal(hit.journalId, "3411");
    equal(
      hit.name,
      "IEEE TRANSACTIONS ON PATTERN ANALYSIS AND MACHINE INTELLIGENCE",
    );
    equal(hit.abbr, "IEEE T PATTERN ANAL");
    equal(hit.impactFactor, "20.4");
    equal(hit.zone, "1区");
    equal(hit.category, "计算机科学");
    equal(hit.subCategory, "计算机：人工智能");
    ok(hit.sourceUrl.includes("journalid=3411"));
  });

  it("matches the journal the caller asked for", () => {
    const hits = parseSearchResults(fixture);
    const { hit } = pickBestHit(hits, {
      name: "IEEE Transactions on Pattern Analysis and Machine Intelligence",
    });
    equal(hit?.zone, "1区");

    // The ISO abbreviation stored by Zotero must work as well.
    const byAbbr = pickBestHit(hits, { name: "IEEE T PATTERN ANAL" });
    equal(byAbbr.hit?.zone, "1区");

    const byIssn = pickBestHit(hits, {
      name: "something else",
      issn: "0162-8828",
    });
    equal(byIssn.hit?.issn, "0162-8828");
  });

  it("ignores rows of other journals when several are returned", () => {
    const html =
      "<table>" +
      row(
        "0018-9340",
        100,
        "IEEE TRANSACTIONS ON COMPUTERS",
        "IEEE T COMPUT",
        "IF: 3.6",
        "2区",
        "大类：计算机科学<br>小类：计算机：硬件",
      ) +
      row(
        "0162-8828",
        3411,
        "IEEE TRANSACTIONS ON PATTERN ANALYSIS AND MACHINE INTELLIGENCE",
        "IEEE T PATTERN ANAL",
        "IF: 20.4",
        "1区",
        "大类：计算机科学<br>小类：计算机：人工智能",
      ) +
      "</table>";
    const hits = parseSearchResults(html);
    equal(hits.length, 2);
    equal(hits[0].zone, "2区");
    equal(hits[1].zone, "1区");

    const byName = pickBestHit(hits, {
      name: "IEEE Transactions on Pattern Analysis and Machine Intelligence",
    });
    equal(byName.hit?.zone, "1区");
    const byIssn = pickBestHit(hits, {
      name: "IEEE Transactions on Computers",
      issn: "0018-9340",
    });
    equal(byIssn.hit?.zone, "2区");
  });

  it("collects the impact factor even when it follows other metrics", () => {
    const html =
      "<table>" +
      row(
        "1234-5678",
        7,
        "JOURNAL OF TESTING",
        "J TEST",
        "h-index: 10<br>CiteScore: 3.20<br>IF: 5.5",
        "3区",
        "大类：工程技术",
      ) +
      "</table>";
    const hits = parseSearchResults(html);
    equal(hits[0].impactFactor, "5.5");
  });

  it("returns nothing for a page without results", () => {
    equal(parseSearchResults("<html><body>no results</body></html>").length, 0);
  });

  it("converts a hit into a cache entry", () => {
    const hits = parseSearchResults(fixture);
    const entry = hitToEntry(hits[0]);
    ok(entry);
    equal(entry?.zone, "1区");
    equal(entry?.origin, "letpub");
    equal(
      normalizeJournalKey(entry?.name ?? ""),
      normalizeJournalKey(
        "IEEE Transactions on Pattern Analysis and Machine Intelligence",
      ),
    );
  });
});
