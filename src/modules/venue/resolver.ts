import {
  CcfRank,
  ccfAbbrs,
  ccfFullNames,
  ccfKeyTail,
  ccfRankList,
  notableVenues,
} from "../../data/ccfCatalog";
import {
  acronymOf,
  compactVenueName,
  levenshtein,
  normalizeIssn,
  normalizeVenueName,
  normalizeVenueTokensRaw,
  similarity,
} from "./normalize";

export type VenueKind = "ccf" | "notable" | "unknown";

export interface VenueAlias {
  /** Name to match against Zotero metadata. */
  match: string;
  /** Optional CCF rank; when present the alias fully defines a ranked venue. */
  ccf?: CcfRank;
  /** Optional abbreviation to display. */
  abbr?: string;
  /** Optional full name. */
  full?: string;
  /** Optional CAS zone to force, e.g. "1区". */
  cas?: string;
}

export interface VenueMatch {
  kind: VenueKind;
  /** CCF rank, when the matched venue is ranked. */
  ccf?: CcfRank;
  /** Display abbreviation, e.g. "TPAMI", "COLM". */
  abbr?: string;
  /** Full venue name. */
  full?: string;
  /** DBLP path identifying the venue, e.g. "/journals/pami". */
  path?: string;
  /** 0..1 - how sure we are about the match. */
  confidence: number;
  /** Which rule produced the match (useful for the log and the debug view). */
  strategy: string;
  /** CAS zone, currently only set by user aliases. */
  cas?: string;
}

interface CatalogCandidate {
  match: VenueMatch;
  /** Names the candidate responds to, already normalized. */
  names: string[];
  /**
   * The same names in raw form. The normalized keys deliberately drop generic
   * words, which makes different venues collide ("IEEE Transactions on
   * Multimedia" and "ACM Multimedia" both become "multimedia"), so the tie
   * between colliding candidates is broken by comparing the raw names.
   */
  rawNames: string[];
  /** Initials of the abbreviation of the candidate, e.g. "TPAMI" -> "tpami". */
  abbrInitials: string;
}

interface ResolverIndex {
  candidates: CatalogCandidate[];
  /** normalized name -> candidate indexes */
  byName: Map<string, number[]>;
  /** compact name -> candidate indexes */
  byCompact: Map<string, number[]>;
  /** uppercase abbreviation -> candidate indexes */
  byAbbr: Map<string, number[]>;
  /** token count + first letters -> candidate indexes (fuzzy pre-filter) */
  byBucket: Map<string, number[]>;
}

const INDEX_CACHE = new Map<string, ResolverIndex>();

export function getUserAliases(raw: string | undefined): VenueAlias[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is VenueAlias =>
          !!item && typeof item === "object" && typeof item.match === "string",
      )
      .map((item) => ({
        match: item.match,
        ccf:
          item.ccf === "A" || item.ccf === "B" || item.ccf === "C"
            ? item.ccf
            : undefined,
        abbr: typeof item.abbr === "string" ? item.abbr : undefined,
        full: typeof item.full === "string" ? item.full : undefined,
        cas: typeof item.cas === "string" ? item.cas : undefined,
      }));
  } catch (_error) {
    return [];
  }
}

function bucketKey(normalizedName: string): string {
  const tokens = normalizedName.split(" ").filter(Boolean);
  if (tokens.length === 0) return "";
  return `${tokens.length}:${tokens
    .map((token) => token[0])
    .join("")
    .slice(0, 2)}`;
}

function addToMap(map: Map<string, number[]>, key: string, index: number) {
  if (!key) return;
  const list = map.get(key);
  if (list) {
    if (!list.includes(index)) list.push(index);
  } else {
    map.set(key, [index]);
  }
}

let builtInIndex: ResolverIndex | undefined;

function buildIndexInternal(userAliases: VenueAlias[]): ResolverIndex {
  const index: ResolverIndex = {
    candidates: [],
    byName: new Map(),
    byCompact: new Map(),
    byAbbr: new Map(),
    byBucket: new Map(),
  };

  const addCandidate = (
    match: VenueMatch,
    names: string[],
    abbrs: string[],
  ) => {
    const id = index.candidates.length;
    const normalizedNames: string[] = [];
    const rawNames: string[] = [];
    for (const name of names) {
      const normalized = normalizeVenueName(name);
      if (!normalized) continue;
      normalizedNames.push(normalized);
      rawNames.push(String(name));
      addToMap(index.byName, normalized, id);
      addToMap(index.byCompact, compactVenueName(name), id);
      addToMap(index.byBucket, bucketKey(normalized), id);
    }

    let abbreviation = "";
    for (const abbr of abbrs) {
      const key = String(abbr ?? "")
        .trim()
        .toUpperCase();
      if (key.length < 2 || key.length > 24) continue;
      if (!abbreviation || key.length > abbreviation.length) abbreviation = key;
      addToMap(index.byAbbr, key, id);
      const normalized = normalizeVenueName(abbr);
      if (normalized) {
        normalizedNames.push(normalized);
        rawNames.push(String(abbr));
        addToMap(index.byName, normalized, id);
        addToMap(index.byCompact, compactVenueName(abbr), id);
        addToMap(index.byBucket, bucketKey(normalized), id);
      }
    }
    index.candidates.push({
      match,
      names: normalizedNames,
      rawNames,
      abbrInitials: abbreviation.toLowerCase(),
    });
  };

  for (const path of Object.keys(ccfRankList)) {
    const info = ccfRankList[path];
    addCandidate(
      {
        kind: "ccf",
        ccf: info.rank,
        abbr: info.abbr,
        full: info.full,
        path,
        confidence: 0,
        strategy: "catalog",
      },
      [info.full, ...(ccfFullNames[path] ?? [])],
      [info.abbr, ...(ccfAbbrs[path] ?? []), ...(ccfKeyTail[path] ?? [])],
    );
  }

  for (const venue of notableVenues) {
    addCandidate(
      {
        kind: "notable",
        abbr: venue.abbr,
        full: venue.full,
        path: venue.paths[0],
        confidence: 0,
        strategy: "notable",
      },
      [venue.full, ...venue.aliases],
      [venue.abbr],
    );
  }

  for (const alias of userAliases) {
    if (!alias || typeof alias.match !== "string" || !alias.match.trim()) {
      continue;
    }
    addCandidate(
      {
        kind: alias.ccf ? "ccf" : "unknown",
        ccf: alias.ccf,
        abbr: alias.abbr?.trim() || undefined,
        full: alias.full?.trim() || undefined,
        confidence: 0.99,
        strategy: "alias",
        cas: alias.cas?.trim() || undefined,
      },
      [alias.match, alias.full ?? ""],
      [alias.match],
    );
  }

  return index;
}

function getIndex(userAliases: VenueAlias[]): ResolverIndex {
  if (userAliases.length === 0) {
    builtInIndex ??= buildIndexInternal([]);
    return builtInIndex;
  }
  const key = JSON.stringify(userAliases);
  let index = INDEX_CACHE.get(key);
  if (!index) {
    index = buildIndexInternal(userAliases);
    INDEX_CACHE.set(key, index);
  }
  return index;
}

function rankWeight(match: VenueMatch): number {
  if (match.kind === "ccf") {
    if (match.ccf === "A") return 3;
    if (match.ccf === "B") return 2;
    return 1.5;
  }
  if (match.kind === "notable") return 1;
  return 0.8;
}

function candidateScore(match: VenueMatch): number {
  return rankWeight(match) + match.confidence;
}

/**
 * How much of the query the candidate's raw name actually accounts for (0..1).
 *
 * The normalized keys are lossy by design, so this uses the token sets of the
 * raw names. "IEEE Transactions on Multimedia" scores 0.71 against the journal
 * "IEEE Transactions on Multimedia" but only 0.25 against the conference "ACM
 * Multimedia", which is what separates them.
 */
function rawMatchQuality(query: string, candidate: CatalogCandidate): number {
  const queryTokens = new Set(normalizeVenueTokensRaw(query));
  if (queryTokens.size === 0) return 0;
  let best = 0;
  for (const rawName of candidate.rawNames) {
    const nameTokens = normalizeVenueTokensRaw(rawName);
    if (nameTokens.length === 0) continue;
    let shared = 0;
    for (const token of new Set(nameTokens)) {
      if (queryTokens.has(token)) shared++;
    }
    const union = new Set([...queryTokens, ...nameTokens]).size;
    if (union === 0) continue;
    best = Math.max(best, shared / union);
  }
  return best;
}

/**
 * Best candidate among the indexes of a map lookup.
 *
 * Candidates can share a normalized key, so they are ranked by how well their
 * raw name matches the query first and only then by CCF rank. Picking by rank
 * alone used to turn "IEEE Transactions on Software Engineering" into the ICSE
 * conference merely because ICSE is ranked higher than TSE.
 */
function bestOf(
  index: ResolverIndex,
  ids: number[] | undefined,
  confidence: number,
  strategy: string,
  query = "",
  kindHint?: "conference" | "journal" | "preprint" | "other",
): VenueMatch | undefined {
  if (!ids || ids.length === 0) return undefined;
  const scored = ids.map((id) => {
    const candidate = index.candidates[id];
    return {
      candidate,
      quality: query ? rawMatchQuality(query, candidate) : 0,
      kind: kindBonus(candidate.match, kindHint),
    };
  });
  scored.sort(
    (a, b) =>
      b.kind - a.kind ||
      b.quality - a.quality ||
      rankWeight(b.candidate.match) - rankWeight(a.candidate.match),
  );
  const best = scored[0].candidate.match;
  const quality = scored[0].quality;
  return {
    ...best,
    // A weak raw overlap means the normalized key was the only reason this
    // candidate was reached, so the confidence is capped.
    confidence: Math.max(
      best.confidence,
      query && quality < 0.5 ? Math.min(confidence, 0.9) : confidence,
    ),
    strategy:
      best.strategy === "catalog" || best.strategy === "notable"
        ? strategy
        : best.strategy,
  };
}

/** Small preference for the venue kind the item looks like. */
function kindBonus(
  match: VenueMatch,
  kindHint?: "conference" | "journal" | "preprint" | "other",
): number {
  if (!kindHint || !match.path) return 0;
  const isJournal = match.path.startsWith("/journals");
  const isConference = match.path.startsWith("/conf");
  if (kindHint === "journal") return isJournal ? 1 : 0;
  if (kindHint === "conference") return isConference ? 1 : 0;
  return 0;
}

/**
 * Match one venue string against the catalog.
 *
 * The order of the rules matters: strong, unambiguous signals (an exact name,
 * an explicit acronym) are tried before the fuzzy ones, and a string that
 * carries an acronym we cannot place is *not* force-matched to a similar name.
 *
 * @param name raw venue string taken from Zotero metadata
 * @param userAliases aliases configured in the preferences
 */
export function matchVenueName(
  name: string,
  userAliases: VenueAlias[] = [],
  kindHint?: "conference" | "journal" | "preprint" | "other",
): VenueMatch | undefined {
  const raw = String(name ?? "").trim();
  if (!raw) return undefined;
  const index = getIndex(userAliases);
  const normalized = normalizeVenueName(raw);

  // 0. the whole string is an abbreviation ("SIGCOMM", "CVPR", "TPAMI").
  //    Checked first: normalization drops acronym-shaped words that are also
  //    generic words ("sigcomm" is a noise word).
  const rawTokens = raw.split(/[^\p{L}\p{N}+&/.-]+/u).filter(Boolean);
  if (rawTokens.length === 1 && rawTokens[0].length >= 3) {
    const hit = bestOf(
      index,
      index.byAbbr.get(rawTokens[0].toUpperCase()),
      0.95,
      "abbr",
      raw,
      kindHint,
    );
    if (hit) return hit;
  }

  if (!normalized) return undefined;

  // 1. exact normalized match
  const exact = bestOf(
    index,
    index.byName.get(normalized),
    0.97,
    "exact",
    raw,
    kindHint,
  );
  if (exact) {
    return { ...exact, confidence: exact.strategy === "alias" ? 0.99 : 0.97 };
  }

  const tokens = normalized.split(" ").filter(Boolean);

  // 2. an explicit acronym inside the string, e.g. the "(CVPR)" of
  //    "Proceedings of the 2024 IEEE/CVF Conference on Computer Vision and
  //    Pattern Recognition (CVPR)".
  const acronyms = extractAcronymTokens(raw);
  for (const acronym of acronyms) {
    const hit = bestOf(
      index,
      index.byAbbr.get(acronym),
      0.9,
      "abbr-token",
      raw,
      kindHint,
    );
    if (hit) return hit;
  }
  if (acronyms.length > 0) {
    // The string carries an acronym that we cannot place; do not fall back to
    // weaker heuristics, they usually produce a wrong venue.
    return undefined;
  }

  // 3. abbreviation initials, e.g. "IEEE Trans. Pattern Anal. Mach. Intell."
  //    -> the catalog holds "TPAMI", whose initials "tpami" are a subsequence
  //    of the normalized input tokens ("pattern anal mach intell").
  const initialsHit = matchByInitials(index, raw);
  if (initialsHit) return initialsHit;

  // 4. compact match: ignores word order and separators
  const compact = compactVenueName(raw);
  if (compact.length >= 4) {
    const compactHit = bestOf(
      index,
      index.byCompact.get(compact),
      0.95,
      "compact",
      raw,
      kindHint,
    );
    if (compactHit) return compactHit;
  }

  // 5. metadata contains a full venue name plus decorations
  const padded = ` ${normalized} `;
  let contained: VenueMatch | undefined;
  let containedCoverage = 0;
  for (let id = 0; id < index.candidates.length; id++) {
    for (const candidateName of index.candidates[id].names) {
      if (candidateName.length < 10) continue;
      if (candidateName.split(" ").length < 2) continue;
      if (candidateName === normalized) continue;
      if (!padded.includes(` ${candidateName} `)) continue;
      const coverage = tokenCoverage(candidateName, normalized);
      if (coverage < 0.7) continue;
      const match = index.candidates[id].match;
      if (
        !contained ||
        candidateScore(match) > candidateScore(contained) ||
        (candidateScore(match) === candidateScore(contained) &&
          coverage > containedCoverage)
      ) {
        contained = match;
        containedCoverage = coverage;
      }
    }
  }
  if (contained) {
    return {
      ...contained,
      confidence: Math.max(contained.confidence, 0.93),
      strategy: contained.strategy === "alias" ? "alias" : "contained",
    };
  }

  // 6. fuzzy match inside the same token-count bucket
  const pool = index.byBucket.get(bucketKey(normalized)) ?? [];
  let fuzzy: VenueMatch | undefined;
  let fuzzyScore = 0;
  let fuzzyDistance = Number.MAX_SAFE_INTEGER;
  let fuzzyPrefix = -1;
  for (const id of pool) {
    for (const candidateName of index.candidates[id].names) {
      if (candidateName === normalized) continue;
      if (Math.abs(candidateName.length - normalized.length) > 10) continue;
      const score = similarity(candidateName, normalized);
      if (score < 0.8) continue;
      const distance = levenshtein(candidateName, normalized);
      const match = index.candidates[id].match;
      const prefix = sharedTokenPrefix(candidateName, normalized);
      const better =
        score > fuzzyScore + 0.001 ||
        (Math.abs(score - fuzzyScore) <= 0.001 && prefix > fuzzyPrefix) ||
        (Math.abs(score - fuzzyScore) <= 0.001 &&
          prefix === fuzzyPrefix &&
          distance < fuzzyDistance) ||
        (Math.abs(score - fuzzyScore) <= 0.001 &&
          prefix === fuzzyPrefix &&
          distance === fuzzyDistance &&
          (!fuzzy || rankWeight(match) > rankWeight(fuzzy)));
      if (better) {
        fuzzy = match;
        fuzzyScore = score;
        fuzzyDistance = distance;
        fuzzyPrefix = prefix;
      }
    }
  }
  if (fuzzy) {
    return {
      ...fuzzy,
      confidence: fuzzyScore,
      strategy: fuzzy.strategy === "alias" ? "alias" : "fuzzy",
    };
  }

  // 7. the initials of the whole name as a last resort
  if (tokens.length >= 3) {
    const acronym = acronymOf(raw).toUpperCase();
    if (acronym.length >= 3) {
      const hit = bestOf(
        index,
        index.byAbbr.get(acronym),
        0.8,
        "abbr-acronym",
        raw,
        kindHint,
      );
      if (hit) return hit;
    }
  }

  return undefined;
}

/**
 * Match an abbreviation that is written out as initials:
 * "IEEE Trans. Pattern Anal. Mach. Intell." -> tokens
 * ["pattern", "anal", "mach", "intell"] -> initials "pami" ⊂ "tpami".
 */
function matchByInitials(
  index: ResolverIndex,
  name: string,
): VenueMatch | undefined {
  // Token order matters here, so the ordered token list is used, and generic
  // words are kept because they contribute letters to the abbreviation
  // ("IEEE Trans. Pattern Anal. Mach. Intell." -> "ITPAMI" contains "TPAMI").
  const tokens = normalizeVenueTokensRaw(name);
  if (tokens.length < 2) return undefined;
  const initials = tokens.map((token) => token[0]).join("");
  if (initials.length < 3) return undefined;

  let best: VenueMatch | undefined;
  let bestScore = 0;
  for (const candidate of index.candidates) {
    const abbr = candidate.abbrInitials.replace(/[^a-z0-9]/g, "");
    if (abbr.length < 3 || abbr.length > 12) continue;
    if (abbr.length > initials.length) continue;
    // The abbreviation must cover a decent share of the initials, otherwise a
    // short acronym would match half of the catalog.
    if (abbr.length / initials.length < 0.5) continue;
    if (!isSubsequence(abbr, initials)) continue;
    // Prefer the abbreviation that is longest relative to the input, and a
    // ranked venue over an unranked one.
    const score =
      abbr.length / initials.length + rankWeight(candidate.match) / 100;
    if (score > bestScore) {
      bestScore = score;
      best = candidate.match;
    }
  }
  if (!best) return undefined;
  return { ...best, confidence: 0.86, strategy: "abbr-initials" };
}

/** Is `needle` a subsequence of `haystack`? */
function isSubsequence(needle: string, haystack: string): boolean {
  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) cursor++;
    if (cursor === needle.length) return true;
  }
  return cursor === needle.length;
}

/**
 * Upper-case acronyms that appear in a venue string, longest first, skipping
 * the words that are part of the venue name itself.
 */
function extractAcronymTokens(raw: string): string[] {
  const words = raw.match(/[A-Za-z][A-Za-z0-9/+&-]{1,15}/g) ?? [];
  const ignored = new Set([
    "IEEE",
    "ACM",
    "THE",
    "AND",
    "PROCEEDINGS",
    "CONFERENCE",
    "INTERNATIONAL",
    "ANNUAL",
    "WORKSHOP",
    "SYMPOSIUM",
    "JOURNAL",
    "TRANSACTIONS",
  ]);
  const tokens: string[] = [];
  for (const word of words) {
    const key = word.replace(/[^A-Za-z0-9/+&-]/g, "");
    if (key.length < 3 || key.length > 14) continue;
    // Only fully upper-case words are treated as acronyms.
    if (key !== key.toUpperCase()) continue;
    if (ignored.has(key)) continue;
    if (!tokens.includes(key)) tokens.push(key);
  }
  return tokens.sort((a, b) => b.length - a.length);
}

/** Number of leading tokens shared by two normalized names. */
function sharedTokenPrefix(a: string, b: string): number {
  const left = a.split(" ").filter(Boolean);
  const right = b.split(" ").filter(Boolean);
  let count = 0;
  while (
    count < left.length &&
    count < right.length &&
    left[count] === right[count]
  ) {
    count++;
  }
  return count;
}

/** How much of `whole` the `part` tokens cover (0..1). */
function tokenCoverage(part: string, whole: string): number {
  const partTokens = part.split(" ").filter(Boolean).length;
  const wholeTokens = whole.split(" ").filter(Boolean).length;
  if (!wholeTokens) return 0;
  return partTokens / wholeTokens;
}

/**
 * Match a venue from several candidate strings already extracted from an item.
 * A ranked match always beats an unranked one, and the first confident exact
 * match short-circuits the search.
 */
export function resolveVenueFromCandidates(
  candidates: string[],
  userAliases: VenueAlias[] = [],
  kindHint?: "conference" | "journal" | "preprint" | "other",
): VenueMatch | undefined {
  let best: VenueMatch | undefined;
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = String(candidate ?? "").trim();
    if (!trimmed) continue;
    const key = normalizeVenueName(trimmed) || trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const match = matchVenueName(trimmed, userAliases, kindHint);
    if (!match) continue;
    if (!best || candidateScore(match) > candidateScore(best)) {
      best = match;
    }
    if (
      best.kind === "ccf" &&
      best.confidence >= 0.97 &&
      best.strategy === "exact"
    ) {
      break;
    }
  }
  return best;
}

/**
 * Look up a CCF entry by ISSN. The bundled catalog has no ISSN column, so this
 * only answers for user aliases that provide one.
 */
export function matchVenueByIssn(
  issn: string,
  userAliases: VenueAlias[] = [],
): VenueMatch | undefined {
  const normalized = normalizeIssn(issn);
  if (!normalized) return undefined;
  for (const alias of userAliases) {
    if (normalizeIssn(alias.match) === normalized) {
      return {
        kind: alias.ccf ? "ccf" : "unknown",
        ccf: alias.ccf,
        abbr: alias.abbr,
        full: alias.full,
        confidence: 0.99,
        strategy: "alias-issn",
        cas: alias.cas,
      };
    }
  }
  return undefined;
}

/** Format the display label of a match, e.g. "CCF-A TPAMI". */
export function formatCcfLabel(match: VenueMatch, withPrefix = true): string {
  const level = match.ccf ? (withPrefix ? `CCF-${match.ccf}` : match.ccf) : "";
  const name = match.abbr || match.full || "";
  return [level, name].filter(Boolean).join(" ").trim();
}
