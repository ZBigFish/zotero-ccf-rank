/**
 * The per-item rank record.
 *
 * Everything the plugin knows about one item is kept in the item's `Extra`
 * field, one `Key: value` line per fact:
 *
 * ```
 * CCF-RANK: A
 * CCF-VENUE: TPAMI
 * CAS-ZONE: 1区
 * CAS-VENUE: IEEE Transactions on Pattern Analysis and Machine Intelligence
 * VENUE-TYPE: journal
 * RANK-SOURCE: dblp
 * RANK-UPDATED: 2026-09-12
 * ```
 *
 * Why Extra? It is a plain item field: it shows up in the item pane, it is
 * searchable ("CCF-RANK: A"), it can be exported, and it survives sync without
 * creating child notes for every paper.
 *
 * The legacy versions of this plugin stored a JSON blob in a child note titled
 * "CCF Info & Citations"; `parseLegacyNote` reads that format so existing
 * libraries keep working.
 */

export const EXTRA_KEYS = {
  ccf: "CCF-RANK",
  ccfVenue: "CCF-VENUE",
  cas: "CAS-ZONE",
  casVenue: "CAS-VENUE",
  venueType: "VENUE-TYPE",
  source: "RANK-SOURCE",
  updated: "RANK-UPDATED",
  citation: "CITATION-COUNT",
  topJournal: "TOP-JOURNAL",
} as const;

/** Keys owned by this plugin; everything else in Extra is left untouched. */
export const MANAGED_EXTRA_KEYS: string[] = Object.values(EXTRA_KEYS);

export interface RankRecord {
  /** CCF rank: "A" | "B" | "C", "None" when the venue is known but unranked. */
  ccf?: string;
  /** CCF venue abbreviation, e.g. "TPAMI". */
  ccfVenue?: string;
  /** CAS zone, e.g. "1区". */
  cas?: string;
  /** Journal name reported by the CAS source. */
  casVenue?: string;
  /** "journal" | "conference" | "preprint" | "other". */
  venueType?: string;
  /** Where the data came from, e.g. "dblp", "metadata", "manual". */
  source?: string;
  /** ISO date of the last successful update. */
  updated?: string;
  /** Citation count as a string ("42"), or a status such as "Not Found". */
  citation?: string;
  /**
   * CNS family membership, encoded as `family:kind:abbr:name`
   * (e.g. `nature:sub:NC:Nature Communications`).
   */
  topJournal?: string;
}

export function isoDate(now = Date.now()): string {
  const date = new Date(now);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Split an Extra field into lines, keeping unrelated lines intact.
 */
export function splitExtra(extra: string): string[] {
  return String(extra ?? "").split(/\r?\n/);
}

export function getExtraValue(extra: string, key: string): string | undefined {
  const prefix = `${key}:`;
  for (const line of splitExtra(extra)) {
    const trimmed = line.trim();
    if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    return trimmed.slice(prefix.length).trim() || undefined;
  }
  return undefined;
}

/**
 * Replace the managed lines of an Extra field, preserving everything else and
 * the original ordering of unmanaged lines.
 */
export function mergeExtra(extra: string, record: RankRecord): string {
  const lines = splitExtra(extra);
  const managed = new Set(MANAGED_EXTRA_KEYS.map((key) => key.toLowerCase()));
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    const colon = trimmed.indexOf(":");
    if (colon <= 0) return trimmed.length > 0;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    return !managed.has(key);
  });

  // Drop trailing empty lines, they will be re-added by the join.
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();

  const appended: string[] = [];
  const push = (key: string, value?: string) => {
    if (value === undefined || value === null) return;
    const trimmed = String(value).trim();
    if (!trimmed) return;
    appended.push(`${key}: ${trimmed}`);
  };

  push(EXTRA_KEYS.ccf, record.ccf);
  push(EXTRA_KEYS.ccfVenue, record.ccfVenue);
  push(EXTRA_KEYS.cas, record.cas);
  push(EXTRA_KEYS.casVenue, record.casVenue);
  push(EXTRA_KEYS.venueType, record.venueType);
  push(EXTRA_KEYS.source, record.source);
  push(EXTRA_KEYS.updated, record.updated);
  push(EXTRA_KEYS.citation, record.citation);
  push(EXTRA_KEYS.topJournal, record.topJournal);

  if (appended.length === 0) return kept.join("\n");
  if (kept.length === 0) return appended.join("\n");
  return `${kept.join("\n")}\n${appended.join("\n")}`;
}

export function parseRankRecord(extra: string): RankRecord {
  return {
    ccf: getExtraValue(extra, EXTRA_KEYS.ccf),
    ccfVenue: getExtraValue(extra, EXTRA_KEYS.ccfVenue),
    cas: getExtraValue(extra, EXTRA_KEYS.cas),
    casVenue: getExtraValue(extra, EXTRA_KEYS.casVenue),
    venueType: getExtraValue(extra, EXTRA_KEYS.venueType),
    source: getExtraValue(extra, EXTRA_KEYS.source),
    updated: getExtraValue(extra, EXTRA_KEYS.updated),
    citation: getExtraValue(extra, EXTRA_KEYS.citation),
    topJournal: getExtraValue(extra, EXTRA_KEYS.topJournal),
  };
}

/** True when the record has something worth showing. */
export function hasRankData(record: RankRecord | undefined): boolean {
  if (!record) return false;
  return Boolean(record.ccf || record.cas || record.citation);
}

/** Merge a partial update into an existing record. */
export function mergeRecord(
  base: RankRecord | undefined,
  update: Partial<RankRecord>,
): RankRecord {
  const result: RankRecord = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined || value === null || value === "") continue;
    (result as Record<string, string>)[key] = String(value);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Legacy child-note support ("CCF Info & Citations")
// ---------------------------------------------------------------------------

export const LEGACY_NOTE_TITLE = "CCF Info & Citations";

/**
 * The legacy plugin stored `<div><pre>{"ccfInfo": "...", "citationNumber":
 * "..."}</pre></div>`. Returns undefined when the note is not that format.
 */
export function parseLegacyNoteContent(
  html: string,
): { ccfInfo: string; citationNumber: string } | undefined {
  const text = String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== "object") return undefined;
    return {
      ccfInfo: typeof parsed.ccfInfo === "string" ? parsed.ccfInfo : "",
      citationNumber:
        typeof parsed.citationNumber === "string"
          ? parsed.citationNumber
          : typeof parsed.citationNumber === "number"
            ? String(parsed.citationNumber)
            : "",
    };
  } catch (_error) {
    return undefined;
  }
}

/**
 * Convert a legacy `CCF-A TPAMI` / `CCF-None COLM` / `Not Found` string into a
 * record.
 */
export function recordFromLegacyCcfInfo(
  ccfInfo: string,
  citationNumber?: string,
): RankRecord {
  const record: RankRecord = {};
  const value = String(ccfInfo ?? "").trim();
  const ranked = value.match(/^CCF-([ABC])\s*(.*)$/i);
  const unranked = value.match(/^CCF-None\s*(.*)$/i);
  if (ranked) {
    record.ccf = ranked[1].toUpperCase();
    record.ccfVenue = ranked[2].trim() || undefined;
  } else if (unranked) {
    record.ccf = "None";
    record.ccfVenue = unranked[1].trim() || undefined;
  }
  if (citationNumber && citationNumber.trim()) {
    const citation = citationNumber.trim();
    if (/^\d+$/.test(citation)) record.citation = citation;
  }
  if (record.ccf || record.citation) {
    record.source = "legacy-note";
  }
  return record;
}
