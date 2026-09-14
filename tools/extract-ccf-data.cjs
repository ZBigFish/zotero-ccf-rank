// One-off migration script: extract `ccfRankList` / `notableVenues` from the
// legacy src/modules/getPaperInfo.ts into a dedicated data module.
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const legacy = fs.readFileSync(
  path.join(root, "src/modules/getPaperInfo.ts"),
  "utf8",
);

const start = legacy.indexOf("const ccfRankList");
const end = legacy.indexOf("// Curated venues are intentionally separate");
if (start < 0 || end < 0) throw new Error("cannot locate ccfRankList");

const objectStart = legacy.indexOf("{", legacy.indexOf("=", start));
// find matching brace
let depth = 0;
let objectEnd = -1;
for (let i = objectStart; i < legacy.length; i++) {
  const c = legacy[i];
  if (c === "{") depth++;
  else if (c === "}") {
    depth--;
    if (depth === 0) {
      objectEnd = i;
      break;
    }
  }
}
if (objectEnd < 0) throw new Error("cannot find end of ccfRankList");
const listLiteral = legacy.slice(objectStart, objectEnd + 1);

const ccfRankList = eval("(" + listLiteral + ")");

// notable venues
const nvStart = legacy.indexOf("export const notableVenues");
const nvArrayStart = legacy.indexOf("[", legacy.indexOf("=", nvStart));
depth = 0;
let nvEnd = -1;
for (let i = nvArrayStart; i < legacy.length; i++) {
  const c = legacy[i];
  if (c === "[") depth++;
  else if (c === "]") {
    depth--;
    if (depth === 0) {
      nvEnd = i;
      break;
    }
  }
}
const notableVenues = eval("(" + legacy.slice(nvArrayStart, nvEnd + 1) + ")");

const keys = Object.keys(ccfRankList);
const stats = { A: 0, B: 0, C: 0 };
for (const k of keys) stats[ccfRankList[k].rank]++;

const out = { ccfRankList, notableVenues };
fs.mkdirSync(path.join(root, "tools/out"), { recursive: true });
fs.writeFileSync(
  path.join(root, "tools/out/ccf-data.json"),
  JSON.stringify(out, null, 2),
);

console.log("entries:", keys.length, stats);
console.log("notable:", notableVenues.length);
console.log("sample:", JSON.stringify(ccfRankList[keys[0]]));
