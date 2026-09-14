import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import { renderSummary, type RenderOptions } from "../src/modules/summary";

const OPTIONS: RenderOptions = {
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

const DEFAULT = "{cas} {ccf} {venue}";

/**
 * `{cas}` only means something for journals. For conferences, preprints and
 * books it has to vanish from the rendered line instead of printing
 * "无中科院分区" (which was the first thing users saw in the column).
 */
describe("summary: the CAS part only appears where it applies", () => {
  it("keeps the zone for a journal", () => {
    equal(
      renderSummary(
        { ccf: "A", ccfVenue: "TPAMI", cas: "1区", venueType: "journal" },
        DEFAULT,
        OPTIONS,
      ),
      "中科院1区 CCF-A TPAMI",
    );
  });

  it("says so when a journal has no zone yet", () => {
    equal(
      renderSummary(
        { ccf: "A", ccfVenue: "TPAMI", venueType: "journal" },
        DEFAULT,
        OPTIONS,
      ),
      "无中科院分区 CCF-A TPAMI",
    );
  });

  it("drops the placeholder for a conference", () => {
    equal(
      renderSummary(
        { ccf: "A", ccfVenue: "NeurIPS", venueType: "conference" },
        DEFAULT,
        OPTIONS,
      ),
      "CCF-A NeurIPS",
    );
  });

  it("drops the placeholder for a preprint", () => {
    equal(
      renderSummary(
        { ccf: "None", ccfVenue: "arXiv", venueType: "preprint" },
        DEFAULT,
        OPTIONS,
        { isPreprint: true },
      ),
      "arXiv预印本 arXiv",
    );
  });

  it("drops the placeholder for a book", () => {
    equal(
      renderSummary(
        { ccf: "NotApplicable", venueType: "other" },
        DEFAULT,
        OPTIONS,
        { notApplicable: true },
      ),
      "不适用",
    );
  });

  it("removes the separator that followed the dropped placeholder", () => {
    // "{ccf} · {cas}" has nothing left after the dropped placeholder, so the
    // separator goes away with it.
    equal(
      renderSummary(
        { ccf: "A", ccfVenue: "NeurIPS", venueType: "conference" },
        "{ccf} · {cas}",
        OPTIONS,
      ),
      "CCF-A",
    );
    // This template has no {venue}, so the venue is not expected here.
    equal(
      renderSummary(
        { ccf: "A", ccfVenue: "NeurIPS", venueType: "conference" },
        "{cas} | {ccf} ({year})",
        OPTIONS,
        { year: "2024" },
      ),
      "CCF-A (2024)",
    );
  });

  it("cleans up an empty bracket pair", () => {
    equal(
      renderSummary(
        { ccf: "A", ccfVenue: "NeurIPS", venueType: "conference" },
        "{ccf} {venue} ({cas})",
        OPTIONS,
      ),
      "CCF-A NeurIPS",
    );
  });

  it("keeps the CAS part in place when the user asks for it explicitly", () => {
    // A record without a venue type is treated as journal-like, which is the
    // conservative choice: the placeholder still shows up.
    equal(
      renderSummary(
        { ccf: "None", ccfVenue: "COLM" },
        "{cas} {ccf} {venue}",
        OPTIONS,
      ),
      "无中科院分区 无分区 COLM",
    );
  });

  it("does not leave a dangling separator behind", () => {
    // The separator that used to sit next to the dropped placeholder goes away
    // with it; what remains must not start or end with punctuation.
    const rendered = renderSummary(
      { ccf: "A", ccfVenue: "NeurIPS", venueType: "conference" },
      "{cas} - {ccf}",
      OPTIONS,
    );
    ok(!rendered.startsWith("-"), rendered);
    ok(!rendered.endsWith("-"), rendered);
    equal(rendered, "CCF-A");
  });

  it("keeps the venue when both placeholders are present", () => {
    equal(
      renderSummary(
        { ccf: "A", ccfVenue: "NeurIPS", venueType: "conference" },
        "{cas} {ccf} {venue} ({year})",
        OPTIONS,
        { year: "2024" },
      ),
      "CCF-A NeurIPS (2024)",
    );
  });
});
