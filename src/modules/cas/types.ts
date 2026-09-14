/**
 * Shared types of the 中科院分区 (CAS journal zone) data.
 *
 * Kept free of any runtime dependency so the parsers and the store can be unit
 * tested outside Zotero.
 */

export interface CasJournalEntry {
  /** ISSN without dash (8 chars), when known. */
  issn?: string;
  /** Journal name as reported by the source. */
  name: string;
  /** Short name / ISO abbreviation. */
  abbr?: string;
  /** CAS zone of the major category, e.g. "1区". */
  zone: string;
  /** Major category, e.g. "计算机科学". */
  category?: string;
  /** Minor categories, e.g. "计算机：人工智能". */
  subCategory?: string;
  /** 2025 CAS "top journal" flag. */
  top?: boolean;
  /** Impact factor, informational. */
  impactFactor?: string;
  /** Review difficulty reported by LetPub, informational. */
  reviewDifficulty?: string;
  /** Review cycle reported by LetPub, informational. */
  reviewCycle?: string;
  /** Source URL. */
  sourceUrl?: string;
  /** Epoch ms of the last successful fetch. */
  fetchedAt: number;
  /** How the record was obtained. */
  origin: "letpub" | "import" | "alias";
}

export interface CasCacheFile {
  version: number;
  source: string;
  /** Keyed by `issn:<issn>` when available, otherwise `name:<normalized>`. */
  journals: Record<string, CasJournalEntry>;
  /** normalized name -> cache key */
  nameIndex: Record<string, string>;
  updatedAt: number;
}

export const CAS_CACHE_VERSION = 1;

export const CAS_SOURCE = "letpub.com.cn";

export function emptyCache(): CasCacheFile {
  return {
    version: CAS_CACHE_VERSION,
    source: CAS_SOURCE,
    journals: {},
    nameIndex: {},
    updatedAt: 0,
  };
}

/**
 * Normalize a CAS zone value.
 *
 * Accepted inputs: `"1区"`, `"1 区"`, `"一区"`, `"Q1"`, `"1"`.
 * Returns `undefined` for anything that is not a 1..4 zone, so a JCR quartile
 * or a stray number never ends up in the record.
 */
export function normalizeZone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;

  const explicit = text.match(/(?:^|[^0-9])([1-4])\s*区/);
  if (explicit) return `${explicit[1]}区`;

  const chinese = text.match(/[一二三四]\s*区/);
  if (chinese) {
    const map: Record<string, string> = { 一: "1", 二: "2", 三: "3", 四: "4" };
    return `${map[chinese[0][0]]}区`;
  }

  const quartile = text.match(/\bQ([1-4])\b/i);
  if (quartile) return `${quartile[1]}区`;

  const bare = text.match(/^([1-4])$/);
  if (bare) return `${bare[1]}区`;

  return undefined;
}
