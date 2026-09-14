// Adds catalog entries that are part of the CCF catalog but were missing from
// this repository's copy. The canonical source is `tools/out/ccf-data.json`;
// `src/data/ccfCatalog.ts` is generated from it.
//
// Usage: node tools/add-ccf-entry.cjs
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const dataPath = path.join(root, "tools/out/ccf-data.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

/**
 * Venues confirmed against the CCF 2022 catalog
 * (https://www.ccf.org.cn/Academic_Evaluation/By_category/2022-12-02/780280.shtml)
 * that the local copy was missing.
 */
const additions = {
  // 计算机网络 - A 类期刊
  "/journals/cacm": {
    rank: "A",
    abbr: "CACM",
    full: "Communications of the ACM",
    url: "/journals/cacm",
    dblp: "/journals/cacm/cacm",
  },
};

let added = 0;
for (const [key, value] of Object.entries(additions)) {
  if (data.ccfRankList[key]) {
    console.log(`kept existing ${key}`);
    continue;
  }
  data.ccfRankList[key] = value;
  added++;
  console.log(`added ${key} (${value.rank} ${value.abbr})`);
}

const keys = Object.keys(data.ccfRankList);
const stats = { A: 0, B: 0, C: 0 };
for (const key of keys) stats[data.ccfRankList[key].rank]++;

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log(`entries: ${keys.length}`, stats, `added: ${added}`);
