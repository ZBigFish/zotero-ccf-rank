/**
 * The one-line venue summary shown in the extra column and in the item pane.
 *
 * The layout is driven by the `summaryTemplate` preference, e.g.
 * `"{cas} {ccf} {venue}"` renders `中科院1区 CCF-A TPAMI`.
 */

import {
  TopJournal,
  decodeTopJournal,
  isTopMainJournal,
  nameKey,
} from "../data/topJournals";
import type { RankRecord } from "./record";

export interface TemplateContext {
  /** "CCF-A" / "A" / "无分区" / "arXiv预印本". */
  ccf: string;
  /** "中科院1区" / "无中科院分区". */
  cas: string;
  /** Journal / conference label, e.g. "TPAMI" or "IEEE TPAMI". */
  venue: string;
  /**
   * CNS membership: "Nature" / "Science" / "Cell" for the main journals and
   * "Nature子刊 NC" for the sub-journals.
   */
  top: string;
  /** Raw CCF rank letter, empty when unknown. */
  ccfAbbr: string;
  /** Raw CCF venue abbreviation, empty when unknown. */
  venueAbbr: string;
  /** Raw CAS zone, e.g. "1区" (empty when unknown). */
  casAbbr: string;
  /** "journal" | "conference" | "preprint" | "other". */
  type: string;
  /** Localized label of the type, e.g. "期刊". */
  typeLabel: string;
  /** Publication year, when known. */
  year: string;
  /** ISO date of the last update. */
  updated: string;
  /** Citation count, when known. */
  citation: string;
}

export const TEMPLATE_PLACEHOLDERS = [
  "cas",
  "ccf",
  "top",
  "venue",
  "ccfAbbr",
  "venueAbbr",
  "casAbbr",
  "type",
  "typeLabel",
  "year",
  "updated",
  "citation",
] as const;

export const DEFAULT_TEMPLATE = "{cas} {ccf} {top} {venue}";

export interface RenderOptions {
  /** Text used when no CCF rank is known. */
  noCcf: string;
  /** Text used for arXiv / CoRR preprints. */
  preprint: string;
  /** Text used when the CCF rank does not apply (book, thesis, ...). */
  notApplicable: string;
  /** Text used when the CAS zone is unknown. */
  noCas: string;
  /** Print "CCF-A" (true) or "A" (false). */
  ccfPrefix: boolean;
  /** Separator used between the blocks of a block placeholder. */
  separator: string;
  /** Localized labels for the venue types. */
  typeLabels: Record<string, string>;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
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

export interface VenueTypeInfo {
  type: string;
  isPreprint: boolean;
}

/**
 * Whether a venue string is just the CNS journal again.
 *
 * The CCF venue of a Nature paper is often the journal name itself, which would
 * print next to the CNS label as "Nature子刊 NC Nature Communications".
 */
function sameVenueText(venue: string, journal: TopJournal): boolean {
  const candidate = nameKey(venue);
  if (!candidate) return true;
  return (
    candidate === nameKey(journal.abbr) ||
    candidate === nameKey(journal.name) ||
    (journal.aliases ?? []).some((alias) => candidate === nameKey(alias))
  );
}

/**
 * Render the summary line for a record.
 *
 * Returns an empty string when there is nothing to show, so the column stays
 * blank for items that were never identified.
 */
export function renderSummary(
  record: RankRecord | undefined,
  template: string,
  options: Partial<RenderOptions> = {},
  extra: {
    year?: string;
    venueKind?: string;
    isPreprint?: boolean;
    /** Force "not applicable" (books, theses, ...). */
    notApplicable?: boolean;
  } = {},
): string {
  if (!record) return "";
  const opts: RenderOptions = { ...DEFAULT_RENDER_OPTIONS, ...options };
  if (!record.ccf && !record.cas && !record.citation && !record.ccfVenue) {
    return "";
  }

  const isPreprint =
    extra.isPreprint === true ||
    record.venueType === "preprint" ||
    /^arxiv$|^corr$/i.test(record.ccfVenue ?? "");

  const ccfAbbr = record.ccf && record.ccf !== "None" ? record.ccf : "";
  const ccfVenue = record.ccfVenue ?? "";

  let ccfText: string;
  if (extra.notApplicable) {
    ccfText = opts.notApplicable;
  } else if (isPreprint) {
    ccfText = opts.preprint;
  } else if (ccfAbbr) {
    ccfText = opts.ccfPrefix ? `CCF-${ccfAbbr}` : ccfAbbr;
  } else {
    ccfText = opts.noCcf;
  }

  const casAbbr = record.cas ?? "";
  const type = record.venueType ?? (isPreprint ? "preprint" : "other");
  const typeLabel = opts.typeLabels[type] ?? "";

  // CNS family membership. The `无分区` placeholder is wrong for these: a Nature
  // paper has no CCF rank because CCF does not rank it, not because it is
  // unranked, so `{ccf}` is suppressed and `{top}` carries the information.
  const topJournal = decodeTopJournal(record.topJournal);
  const topText = topJournal
    ? isTopMainJournal(topJournal)
      ? topJournal.abbr
      : `${topJournal.familyLabel}子刊 ${topJournal.abbr}`
    : "";

  // Conferences, preprints and books never have a 中科院分区, so a "no CAS zone"
  // placeholder next to them would only be noise. In that case `{cas}` is
  // rendered as empty and the surrounding separators are cleaned up, so
  // "不适用 无分区 COLM" becomes the readable "无分区 COLM".
  const casApplicable =
    record.venueType === "journal" ||
    record.venueType === undefined ||
    record.venueType === "";
  const casZone = casAbbr
    ? `中科院${casAbbr}`
    : casApplicable
      ? opts.noCas
      : "";

  // A CNS journal is authoritative on its own, so the 中科院 zone is redundant
  // next to it and the whole line reads as just the journal:
  //
  //   {cas} {ccf} {top} {venue}  ->  "Nature"  /  "Nature子刊 NC"
  //
  // Only the zone is dropped; the rest of the template (a year, the citation
  // count, a separator the user added) still renders.
  const casText = topJournal ? "" : casZone;

  // `无分区` is wrong for a CNS journal — CCF does not rank it, which is not the
  // same as it being unranked — so the placeholder is dropped entirely rather
  // than printed next to the family label.
  const ccfDisplay = topJournal && ccfText === opts.noCcf ? "" : ccfText;

  // `{top}` already carries the journal's abbreviation, so a `{venue}` holding
  // exactly the same text is dropped rather than printed twice
  // ("Nature子刊 NC Nature Communications" → "Nature子刊 NC").
  const venueRaw = isPreprint && ccfVenue === "" ? "arXiv" : ccfVenue;
  const venueDisplay =
    topJournal && venueRaw && sameVenueText(venueRaw, topJournal)
      ? ""
      : venueRaw;

  const context: TemplateContext = {
    ccf: ccfDisplay,
    cas: casText,
    top: topText,
    venue: venueDisplay,
    ccfAbbr,
    venueAbbr: ccfVenue,
    casAbbr,
    type,
    typeLabel,
    year: extra.year ?? "",
    updated: record.updated ?? "",
    citation: record.citation ?? "",
  };

  const rendered = applyTemplate(
    // A placeholder that resolves to nothing is dropped together with the
    // separator that follows it, so `{ccf} · {cas}` does not end in a dangling
    // separator when the CAS part does not apply.
    template || DEFAULT_TEMPLATE,
    context,
    opts.separator,
    { omitEmpty: ["cas", "ccf", "top", "venue"] },
  );
  return cleanup(rendered, opts.separator);
}

/** Replace `{placeholder}` tokens; unknown tokens are left untouched. */
export function applyTemplate(
  template: string,
  context: TemplateContext,
  separator: string,
  options: { omitEmpty?: string[] } = {},
): string {
  const bag = context as unknown as Record<string, string>;
  let pattern = String(template ?? "");
  for (const key of options.omitEmpty ?? []) {
    if ((bag[key] ?? "").trim()) continue;
    pattern = pattern.replace(new RegExp(`\\{${key}\\}`, "g"), "");
  }
  const rendered = pattern.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(bag, key)) return match;
    let value = bag[key] ?? "";
    if (key === "ccf" || key === "cas") {
      // Block placeholders expand with the configured separator.
      value = value.split(" ").filter(Boolean).join(separator);
    }
    return value;
  });
  // Remove the separator that is left behind next to a dropped placeholder
  // ("CCF-A | " -> "CCF-A", "| CCF-A" -> "CCF-A").
  return rendered.replace(/^[\s·|•/\\-]+/, "").replace(/[\s·|•/\\-]+$/, "");
}

/**
 * Tidy up the render: collapse whitespace, drop separators left dangling at the
 * ends, and empty bracket pairs such as "()" or "[]".
 */
function cleanup(text: string, _separator: string): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[·|•/\\-]\s*)+/, "")
    .replace(/(?:\s*[·|•/\\-])+$/, "")
    .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Validate a template and report unknown placeholders. */
export function validateTemplate(template: string): {
  valid: boolean;
  placeholders: string[];
  unknown: string[];
} {
  const found = [...String(template ?? "").matchAll(/\{(\w+)\}/g)].map(
    (match) => match[1],
  );
  const unknown = found.filter(
    (name) => !(TEMPLATE_PLACEHOLDERS as readonly string[]).includes(name),
  );
  return {
    valid: found.length > 0 && unknown.length === 0,
    placeholders: found,
    unknown,
  };
}
