// One-off generator: writes src/data/ccfCatalog.ts from the extracted JSON.
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const data = JSON.parse(
  fs.readFileSync(path.join(root, "tools/out/ccf-data.json"), "utf8"),
);

const ccfRankList = data.ccfRankList;
const notableVenues = data.notableVenues;
const keys = Object.keys(ccfRankList);

const rankLines = [];
const abbrLines = [];
const fullLines = [];
const tailLines = [];

/**
 * Derive a display abbreviation from a full venue name when the catalog has
 * none (48 journals): "Parallel Computing" -> "PC", "IEEE Transactions on
 * Cybernetics" -> "TC".
 */
const ACRONYM_STOP = new Set([
  "of",
  "and",
  "the",
  "on",
  "for",
  "an",
  "in",
  "&",
]);
function deriveAbbr(full, key) {
  const words = String(full)
    .replace(/[^A-Za-z0-9\s&:-]/g, " ")
    .split(/[\s:&]+/)
    .filter(Boolean);
  const letters = words
    .filter((word) => !ACRONYM_STOP.has(word.toLowerCase()))
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  if (letters.length >= 2 && letters.length <= 10) return letters;
  const tail = key.split("/").filter(Boolean).pop() ?? "";
  return tail.toUpperCase();
}

for (const key of keys) {
  const info = ccfRankList[key];
  const abbr =
    info.abbr && info.abbr.trim()
      ? info.abbr.trim()
      : deriveAbbr(info.full, key);
  rankLines.push(
    `  ${JSON.stringify(key)}: { rank: ${JSON.stringify(info.rank)}, abbr: ${JSON.stringify(abbr)}, full: ${JSON.stringify(info.full)}, url: ${JSON.stringify(info.url)}, dblp: ${JSON.stringify(info.dblp)} },`,
  );

  const abbrs = [];
  if (abbr.length >= 2) abbrs.push(abbr);
  // "ACM Trans. X" style CCF abbreviations sometimes carry a prefix suffix;
  // the bare part after the first space is also worth indexing.
  const abbrTail = abbr.split(/\s+/).slice(-1)[0];
  if (abbrTail && abbrTail !== abbr && abbrTail.length >= 3) {
    abbrs.push(abbrTail);
  }
  abbrLines.push(
    `  ${JSON.stringify(key)}: [${[...new Set(abbrs)].map((a) => JSON.stringify(a)).join(", ")}],`,
  );

  fullLines.push(`  ${JSON.stringify(key)}: [${JSON.stringify(info.full)}],`);

  const tail = key.split("/").filter(Boolean).pop();
  const tails = [];
  if (tail && tail.length >= 4 && tail.length <= 12 && tail !== "corr") {
    tails.push(tail);
  }
  tailLines.push(
    `  ${JSON.stringify(key)}: [${tails.map((t) => JSON.stringify(t)).join(", ")}],`,
  );
}

const notableLines = notableVenues
  .map(
    (venue) =>
      `  { abbr: ${JSON.stringify(venue.abbr)}, full: ${JSON.stringify(venue.full)}, paths: [${venue.paths
        .map((p) => JSON.stringify(p))
        .join(", ")}], aliases: [${venue.aliases
        .map((a) => JSON.stringify(a))
        .join(", ")}] },`,
  )
  .join("\n");

const template = fs.readFileSync(
  path.join(root, "tools/ccfCatalog.template.ts"),
  "utf8",
);

const output = template
  .replace("__CCF_RANK_LIST__", `{\n${rankLines.join("\n")}\n}`)
  .replace("__CCF_ABBRS__", `{\n${abbrLines.join("\n")}\n}`)
  .replace("__CCF_FULL_NAMES__", `{\n${fullLines.join("\n")}\n}`)
  .replace("__CCF_KEY_TAIL__", `{\n${tailLines.join("\n")}\n}`)
  .replace("__NOTABLE_VENUES__", `[\n${notableLines}\n]`);

const outPath = path.join(root, "src/data/ccfCatalog.ts");
fs.writeFileSync(outPath, output);
console.log("wrote", outPath, output.split("\n").length, "lines");
