/**
 * Generated from the CCF catalog maintained by this plugin.
 * Do not edit by hand: run `node tools/generate-ccf-catalog.cjs`.
 */

export type CcfRank = "A" | "B" | "C";

export interface CcfRankInfo {
  /** CCF rank. */
  rank: CcfRank;
  /** Abbreviation used by the CCF catalog, e.g. "TPAMI". */
  abbr: string;
  /** Full venue name used by the CCF catalog. */
  full: string;
  /** CCF catalog URL fragment; also the DBLP venue path. */
  url: string;
  /** DBLP venue prefix (informational). */
  dblp: string;
}

/** Venues commonly used in computer science that are *not* in the CCF catalog. */
export interface NotableVenueInfo {
  abbr: string;
  full: string;
  /** DBLP venue paths. */
  paths: string[];
  /** Names that may appear in Zotero metadata. */
  aliases: string[];
}

export const ccfRankList: Record<string, CcfRankInfo> = __CCF_RANK_LIST__;

/** Abbreviations indexed per DBLP venue path. */
export const ccfAbbrs: Record<string, string[]> = __CCF_ABBRS__;

/** Full names indexed per DBLP venue path. */
export const ccfFullNames: Record<string, string[]> = __CCF_FULL_NAMES__;

/** DBLP venue key tails ("/journals/pami" -> "pami"), weakest match source. */
export const ccfKeyTail: Record<string, string[]> = __CCF_KEY_TAIL__;

export const notableVenues: NotableVenueInfo[] = __NOTABLE_VENUES__;
