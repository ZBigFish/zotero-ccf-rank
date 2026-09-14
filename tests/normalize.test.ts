import { equal, ok, deepEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acronymOf,
  compactVenueName,
  levenshtein,
  normalizeIssn,
  normalizeJournalKey,
  normalizeVenueName,
  normalizeVenueTokens,
  similarity,
} from "../src/modules/venue/normalize";

describe("venue name normalization", () => {
  it("folds case, punctuation and diacritics", () => {
    equal(
      normalizeVenueName(
        "IEEE Transactions on Pattern Analysis & Machine Intelligence",
      ),
      normalizeVenueName(
        "ieee transactions on pattern analysis and machine intelligence",
      ),
    );
  });

  it("drops years, editions and locations", () => {
    // The acronym in parentheses would be dropped together with the year, so
    // it is not part of the baseline; every other spelling must match it.
    const expected = normalizeVenueName(
      "IEEE/CVF Conference on Computer Vision and Pattern Recognition",
    );
    const variants = [
      "2024 IEEE/CVF Conference on Computer Vision and Pattern Recognition",
      "Proceedings of the 2024 IEEE/CVF Conference on Computer Vision and Pattern Recognition",
      "The 2024 IEEE/CVF Conference on Computer Vision and Pattern Recognition, Seattle, USA",
      "IEEE/CVF Conference on Computer Vision and Pattern Recognition, 2024",
    ];
    for (const variant of variants) {
      equal(normalizeVenueName(variant), expected, variant);
    }
  });

  it("normalizes written and numeric ordinals", () => {
    equal(
      normalizeVenueName(
        "28th Conference on Neural Information Processing Systems",
      ),
      normalizeVenueName("Conference on Neural Information Processing Systems"),
    );
    equal(
      normalizeVenueName(
        "The 14th USENIX Symposium on Operating Systems Design and Implementation",
      ),
      normalizeVenueName(
        "USENIX Symposium on Operating Systems Design and Implementation",
      ),
    );
  });

  it("keeps the words that carry identity", () => {
    const tokens = normalizeVenueTokens(
      "Proceedings of the 2025 Conference on Language Modeling (COLM)",
    );
    ok(tokens.includes("language"));
    ok(tokens.includes("modeling"));
    ok(tokens.includes("colm"));
    ok(!tokens.includes("proceedings"));
    ok(!tokens.includes("2025"));
  });

  it("treats different word orders as equal through the compact key", () => {
    equal(
      compactVenueName("Symposium on Operating Systems Principles"),
      compactVenueName("Operating Systems Principles, Symposium on"),
    );
  });

  it("builds a lowercase acronym that ignores stop words", () => {
    equal(acronymOf("The Web Conference"), "wc");
    equal(
      acronymOf("Conference on Neural Information Processing Systems"),
      "cnips",
    );
  });

  it("strips locations only after the venue name", () => {
    equal(
      normalizeVenueName(
        "International Conference on Robotics and Automation, London, UK",
      ),
      normalizeVenueName("International Conference on Robotics and Automation"),
    );
    // "London" is part of the name here, and it is the first token.
    ok(normalizeVenueName("London Symposium on Modelling").includes("london"));
  });

  it("normalizes ISSNs", () => {
    equal(normalizeIssn("0162-8828"), "01628828");
    equal(normalizeIssn("01628828"), "01628828");
    equal(normalizeIssn("n/a"), "");
  });

  it("computes distances and similarities", () => {
    equal(levenshtein("kitten", "sitting"), 3);
    equal(similarity("abc", "abc"), 1);
    ok(similarity("abc", "abd") > 0.6);
  });

  it("keeps the journal key word order (unlike the venue key)", () => {
    // The journal key preserves order, so a genuinely reversed name differs ...
    ok(
      normalizeJournalKey("Machine Intelligence Pattern Analysis") !==
        normalizeJournalKey(
          "IEEE Transactions on Pattern Analysis and Machine Intelligence",
        ),
    );
    // ... while the venue key sorts the tokens, so order does not matter.
    equal(
      normalizeVenueName(
        "Machine Intelligence, IEEE Transactions on Pattern Analysis and",
      ),
      normalizeVenueName(
        "IEEE Transactions on Pattern Analysis and Machine Intelligence",
      ),
    );
  });
});
