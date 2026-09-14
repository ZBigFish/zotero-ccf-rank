/**
 * Venue name normalization.
 *
 * Zotero metadata for the same conference is wildly inconsistent: the year,
 * the edition ("28th", "Twenty-Eighth"), the location, "Proceedings of the",
 * "Workshops", "(Posters)", full names vs. abbreviations, and so on. Everything
 * in this module turns such a string into a stable comparison key.
 */

/** Roman numerals are only converted in the ordinal position (e.g. "XIVth"). */
const ROMAN =
  /^(?=[ivxlcdm]+$)m*(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  "twenty-first": 21,
  "twenty-second": 22,
  "twenty-third": 23,
  "twenty-fourth": 24,
  "twenty-fifth": 25,
  "twenty-sixth": 26,
  "twenty-seventh": 27,
  "twenty-eighth": 28,
  "twenty-ninth": 29,
  thirtieth: 30,
};

/** Words that carry no venue identity and can be dropped when comparing. */
const NOISE_WORDS = new Set([
  "proceedings",
  "proceeding",
  "proc",
  "annual",
  "international",
  "intl",
  "acm",
  "ieee",
  "acm/ieee",
  "ieee/acm",
  "sigplan",
  "sigcomm",
  "sigsoft",
  "sigmod",
  "sigkdd",
  "sigir",
  "siggraph",
  "the",
  "of",
  "on",
  "for",
  "and",
  "in",
  "at",
  "to",
  "a",
  "an",
  "workshop",
  "workshops",
  "conference",
  "conf",
  "symposium",
  "symposia",
  "journal",
  "transactions",
  "trans",
  "letters",
  "vol",
  "volume",
  "no",
  "issue",
  "part",
  "poster",
  "posters",
  "demo",
  "demos",
  "companion",
  "extended",
  "abstracts",
  "abstract",
  "late",
  "breaking",
  "results",
]);

/**
 * Location markers. Everything from these words on is dropped, because Zotero
 * entries frequently end with "... (Sydney, Australia)" or "... held in Rome".
 */
const LOCATION_MARKERS = new Set([
  "held",
  "usa",
  "us",
  "uk",
  "china",
  "japan",
  "korea",
  "germany",
  "france",
  "italy",
  "spain",
  "canada",
  "australia",
  "austria",
  "switzerland",
  "netherlands",
  "belgium",
  "sweden",
  "norway",
  "denmark",
  "finland",
  "portugal",
  "greece",
  "ireland",
  "poland",
  "czech",
  "hungary",
  "turkey",
  "israel",
  "india",
  "singapore",
  "brazil",
  "mexico",
  "russia",
  "egypt",
  "beijing",
  "shanghai",
  "shenzhen",
  "hangzhou",
  "nanjing",
  "wuhan",
  "chengdu",
  "xi",
  "hong",
  "kong",
  "macau",
  "taipei",
  "tokyo",
  "osaka",
  "kyoto",
  "seoul",
  "busan",
  "singapore",
  "sydney",
  "melbourne",
  "brisbane",
  "auckland",
  "wellington",
  "vancouver",
  "toronto",
  "montreal",
  "ottawa",
  "calgary",
  "boston",
  "seattle",
  "portland",
  "denver",
  "chicago",
  "austin",
  "dallas",
  "atlanta",
  "orlando",
  "miami",
  "phoenix",
  "sandiego",
  "losangeles",
  "sanfrancisco",
  "newyork",
  "washington",
  "baltimore",
  "philadelphia",
  "pittsburgh",
  "honolulu",
  "london",
  "oxford",
  "cambridge",
  "edinburgh",
  "glasgow",
  "manchester",
  "birmingham",
  "paris",
  "lyon",
  "nice",
  "berlin",
  "munich",
  "hamburg",
  "frankfurt",
  "vienna",
  "zurich",
  "geneva",
  "amsterdam",
  "rotterdam",
  "brussels",
  "copenhagen",
  "stockholm",
  "oslo",
  "helsinki",
  "prague",
  "budapest",
  "warsaw",
  "lisbon",
  "porto",
  "madrid",
  "barcelona",
  "rome",
  "milan",
  "venice",
  "florence",
  "athens",
  "istanbul",
  "dubai",
  "doha",
  "riyadh",
  "cairo",
  "mumbai",
  "delhi",
  "bangalore",
  "hyderabad",
  "sao",
  "paulo",
  "rio",
  "janerio",
  "buenos",
  "aires",
  "santiago",
  "lima",
  "bogota",
]);

/** Convert "1st" / "first" / "XIVth" to a plain number token. */
function normalizeOrdinals(value: string): string {
  let result = value;
  // "Twenty-Eighth" -> "twenty eighth", "Twenty First" -> "twenty first"
  for (const [word, num] of Object.entries(ORDINAL_WORDS)) {
    if (num <= 20) continue;
    const [tens, unit] = word.split("-");
    result = result.replace(
      new RegExp(`\\b${tens}[-\\s]${unit}\\b`, "g"),
      String(num),
    );
  }
  // "first" .. "twentieth"
  for (const [word, num] of Object.entries(ORDINAL_WORDS)) {
    if (num > 20) continue;
    result = result.replace(new RegExp(`\\b${word}\\b`, "g"), String(num));
  }
  // "1st" / "2nd" / "3rd" / "4th"
  result = result.replace(/\b(\d{1,3})(?:st|nd|rd|th)\b/g, "$1");
  // "XIVth"
  result = result.replace(/\b([ivxlcdm]{1,7})th\b/g, (match, roman: string) => {
    const parsed = romanToNumber(roman);
    return parsed ? String(parsed) : match;
  });
  return result;
}

function romanToNumber(roman: string): number | undefined {
  if (!ROMAN.test(roman)) return undefined;
  const values: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  let total = 0;
  const upper = roman.toLowerCase();
  for (let i = 0; i < upper.length; i++) {
    const current = values[upper[i]];
    const next = values[upper[i + 1]];
    total += next && current < next ? -current : current;
  }
  return total > 0 && total <= 60 ? total : undefined;
}

/** Remove diacritics and unify punctuation so "&" == "and". */
export function foldVenueString(value: string): string {
  let result = String(value ?? "");
  result = result.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  result = result.toLowerCase();
  result = result.replace(/\\[a-z]+/g, " ");
  result = result.replace(/&amp;/g, " & ");
  result = result.replace(/&(?:nbsp|#160);/g, " ");
  result = result.replace(/[’'`´]/g, "'");
  result = result.replace(/[“”„]/g, '"');
  result = result.replace(/[‐-‒–—―−]/g, "-");
  result = result.replace(/&/g, " and ");
  result = result.replace(/\bet al\.?\b/g, " ");
  result = result.replace(/[()[\]{}<>]/g, " ");
  return result;
}

/**
 * Token-level clean-up: drop years, editions, volume numbers, locations and
 * generic words.
 */
export interface TokenizeOptions {
  /** Keep generic words ("proceedings", "of", "transactions", ...). */
  keepNoise?: boolean;
  /** Keep standalone numbers (years are always removed). */
  keepNumbers?: boolean;
}

export function normalizeVenueTokens(value: string): string[] {
  return tokenizeVenue(value, {});
}

/**
 * Ordered tokens including the generic words.
 *
 * Needed for abbreviation matching: "IEEE Trans. Pattern Anal. Mach. Intell."
 * only yields "TPAMI" when "Trans" is still there.
 */
export function normalizeVenueTokensRaw(value: string): string[] {
  return tokenizeVenue(value, { keepNoise: true, keepNumbers: true });
}

function tokenizeVenue(value: string, options: TokenizeOptions): string[] {
  let result = foldVenueString(value);
  result = result.replace(
    /\b(?:19|20)\d{2}\s*[-/]\s*(?:\d{2}|(?:19|20)\d{2})\b/g,
    " ",
  );
  result = result.replace(/\b(?:19|20)\d{2}\b/g, " ");
  result = result.replace(/\bvol(?:ume)?\.?\s*\d+\b/g, " ");
  result = result.replace(/\bno\.?\s*\d+\b/g, " ");
  result = result.replace(/\bissue\s*\d+\b/g, " ");
  result = result.replace(/\bpart\s*[ivx\d]+\b/g, " ");
  result = normalizeOrdinals(result);
  result = result.replace(/[^a-z0-9]+/g, " ");

  const tokens = result.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      // Residual ordinal/volume numbers; optional, and always dropped for the
      // strict comparison key.
      if (options.keepNumbers) kept.push(token);
      continue;
    }
    if (!options.keepNoise && NOISE_WORDS.has(token)) continue;
    if (token.length === 1 && !/\d/.test(token)) continue;
    kept.push(token);
  }

  // Cut the tail at the first location marker (after at least two tokens).
  const cutIndex = kept.findIndex(
    (token, index) => index >= 2 && LOCATION_MARKERS.has(token),
  );
  return cutIndex === -1 ? kept : kept.slice(0, cutIndex);
}

/**
 * Stable comparison key: tokens sorted so word order does not matter.
 *
 * Some CCF venues consist entirely of words the normalizer treats as noise
 * ("Journal of the ACM", "Proceedings of the IEEE", "ACM SIGMOD Conference").
 * For those the filtered token list is empty, which would make the entry
 * unmatchable, so the raw tokens are used instead. The index and the query both
 * go through this function, so the keys stay consistent.
 */
export function normalizeVenueName(value: string): string {
  const tokens = normalizeVenueTokens(value);
  if (tokens.length > 0) return tokens.slice().sort().join(" ");
  return normalizeVenueTokensRaw(value).slice().sort().join(" ");
}

/** Compact comparison key without spaces. */
export function compactVenueName(value: string): string {
  const tokens = normalizeVenueTokens(value);
  if (tokens.length > 0) return tokens.join("");
  return normalizeVenueTokensRaw(value).join("");
}

/** Uppercase letters of a title, e.g. "The Web Conference" -> "TWC". */
export function acronymOf(value: string): string {
  const words = foldVenueString(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word &&
        word !== "of" &&
        word !== "and" &&
        word !== "the" &&
        word !== "on" &&
        word !== "for" &&
        word !== "in" &&
        word !== "at",
    );
  return words.map((word) => word[0]).join("");
}

/** Levenshtein distance with an early exit. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = new Array(b.length + 1);
  let current = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length];
}

/** Similarity in [0, 1] based on the Levenshtein distance. */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const longest = Math.max(a.length, b.length);
  if (!longest) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/** Normalize an ISSN (with or without dash) for comparison. */
export function normalizeIssn(value: string): string {
  const cleaned = String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "");
  return cleaned.length === 8 ? cleaned : "";
}

/** Normalize a DOI-free journal name for cache keys (keeps order). */
export function normalizeJournalKey(value: string): string {
  return normalizeVenueTokens(value).join(" ");
}
