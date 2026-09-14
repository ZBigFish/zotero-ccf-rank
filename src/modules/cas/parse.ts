/**
 * Parsing of the LetPub search result page.
 *
 * Only the public search page is used: a single request per journal name
 * returns the ISSN, the journal title, the impact factor and the current CAS
 * zone (中科院分区).
 *
 * Column layout of the result table (as of 2026):
 *   0 ISSN | 1 name (+ abbr) | 2 rating | 3 IF/h-index/CiteScore |
 *   4 CAS zone | 5 categories | 6 index type | 7 OA | 8 difficulty |
 *   9 review cycle | >10 articles/views
 *
 * The layout has changed between LetPub releases and some cells have been
 * merged, so every field is read through a detector instead of a hard column
 * index: the zone column is found by pattern (a cell that *is* "1区".."4区"),
 * and the remaining fields are resolved relative to it.
 *
 * This module has no runtime dependency so it can be unit tested in plain Node.
 */

import {
  normalizeIssn,
  normalizeJournalKey,
  similarity,
} from "../venue/normalize";
import type { CasJournalEntry } from "./types";
import { normalizeZone } from "./types";
import { parseLinks, parseTableRows, stripTags, toGrid } from "./html";

export const LETPUB_BASE = "https://www.letpub.com.cn/index.php";

export interface LetPubHit {
  journalId?: string;
  issn?: string;
  /** Full title as shown by LetPub (usually upper case). */
  name: string;
  /** ISO style abbreviation, when the page provides one. */
  abbr?: string;
  impactFactor?: string;
  /** CAS zone, normalized to "1区" .. "4区". */
  zone?: string;
  /** Major category, e.g. "计算机科学". */
  category?: string;
  /** Minor categories, e.g. "计算机：人工智能". */
  subCategory?: string;
  /** Review difficulty, e.g. "较难". */
  reviewDifficulty?: string;
  /** Review cycle, e.g. "约7.9个月". */
  reviewCycle?: string;
  /** SCI index type, e.g. "SCIE". */
  indexType?: string;
  sourceUrl: string;
}

const MAJOR_CATEGORIES = new Set([
  "医学",
  "生物学",
  "农林科学",
  "环境科学与生态学",
  "化学",
  "工程技术",
  "数学",
  "物理与天体物理",
  "地球科学",
  "材料科学",
  "计算机科学",
  "经济学",
  "社会学",
  "管理学",
  "心理学",
  "教育学",
  "哲学",
  "历史学",
  "文学",
  "艺术学",
  "综合性期刊",
  "社会科学",
  "人文科学",
  "自然科学",
]);

const DIFFICULTY_WORDS = new Set([
  "很容易",
  "容易",
  "较易",
  "中等",
  "较难",
  "很难",
  "困难",
]);

const INDEX_WORDS = /^(?:SCI|SCIE|SSCI|ESCI|AHCI|Scopus)\b/i;

/** ISSN "01628828" -> "0162-8828"; anything else is returned untouched. */
export function normalizeIssnInput(value: string): string {
  const clean = String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "");
  if (clean.length !== 8) return String(value ?? "").trim();
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

/** Build the LetPub search URL for a journal name and/or ISSN. */
export function buildSearchUrl(query: {
  name?: string;
  issn?: string;
}): string {
  const params = ["page=journalapp", "view=search"];
  if (query.issn) {
    params.push(
      `searchissn=${encodeURIComponent(normalizeIssnInput(query.issn))}`,
    );
  }
  if (query.name) {
    params.push(`searchname=${encodeURIComponent(query.name)}`);
  }
  if (!query.name && !query.issn) {
    params.push("searchname=");
  }
  return `${LETPUB_BASE}?${params.join("&")}`;
}

function pickImpactFactor(cell: string): string | undefined {
  const match = /IF\s*[:：]\s*([0-9]+(?:\.[0-9]+)?)/i.exec(cell);
  return match ? match[1] : undefined;
}

/**
 * Score a cell as the CAS zone column.
 *
 * A zone cell contains nothing but the zone, which is what keeps metric cells
 * such as "IF: 20.4 h-index: 326 CiteScore: 41.10" from matching (the "Q1" in
 * a CiteScore would otherwise look like a quartile).
 */
function zoneCandidateScore(cell: string): number {
  const text = String(cell ?? "").trim();
  if (!text || text.length > 24) return 0;
  if (/IF\s*[:：]|h-index|CiteScore|ISSN|SCI/i.test(text)) return 0;
  if (/^[1-4]\s*区/.test(text)) return 3;
  if (/^[一二三四]\s*区/.test(text)) return 3;
  if (/^Q[1-4]$/i.test(text)) return 2;
  if (/^[1-4]$/.test(text)) return 1;
  return 0;
}

/** Locate the zone column: the preferred index first, then by pattern. */
function findZoneIndex(cells: string[], preferred: number): number {
  if (
    cells[preferred] !== undefined &&
    zoneCandidateScore(cells[preferred]) > 0
  ) {
    return preferred;
  }
  let bestIndex = -1;
  let bestScore = 0;
  for (let i = 0; i < cells.length; i++) {
    const score = zoneCandidateScore(cells[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** Parse every journal row of a LetPub search result page. */
export function parseSearchResults(html: string): LetPubHit[] {
  const hits: LetPubHit[] = [];
  const rows = parseTableRows(html);
  const grid = toGrid(rows);
  const rawRows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  for (let index = 0; index < grid.length; index++) {
    const rawRow = rawRows[index] ?? "";
    const links = parseLinks(rawRow);
    const journalLink = links.find((link) => /journalid=\d+/.test(link.href));
    if (!journalLink) continue;
    const name = journalLink.text.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const journalId = /journalid=(\d+)/.exec(journalLink.href)?.[1];

    // Unclosed tags are common on the real page, so the raw cells are only used
    // where the markup matters: the ISSN sits in its own cell, and the
    // abbreviation and the categories need their own element.
    const rawCells = (rawRow.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(
      (cell) => cell.replace(/^<td\b[^>]*>/i, ""),
    );
    const cells = grid[index].map((cell) => stripTags(cell));
    if (cells.length < 4) continue;

    const issnText = stripTags(rawCells[0] ?? cells[0] ?? "").trim();
    const issn = /^[0-9]{4}-?[0-9X]{4}$/i.test(issnText) ? issnText : undefined;

    // The abbreviation lives in a grey <font> right after the journal link.
    const abbrMatch =
      /<font[^>]*color\s*=\s*["']?grey["']?[^>]*>([\s\S]*?)<\/font>/i.exec(
        rawRow,
      );
    const abbr = abbrMatch
      ? stripTags(abbrMatch[1]).replace(/\s+/g, " ").trim() || undefined
      : undefined;

    const zoneIndex = findZoneIndex(cells, 4);
    const zone =
      zoneIndex >= 0 ? normalizeZone(cells[zoneIndex] ?? "") : undefined;

    let impactFactor: string | undefined;
    for (const cell of cells) {
      const found = pickImpactFactor(cell);
      if (found) {
        impactFactor = found;
        break;
      }
    }

    let category: string | undefined;
    let subCategory: string | undefined;
    const categoryRawIndex = rawCells.findIndex((cell) =>
      /大类[:：]|小类[:：]/.test(cell),
    );
    const categoryIndex =
      categoryRawIndex >= 0
        ? categoryRawIndex
        : zoneIndex >= 0
          ? zoneIndex + 1
          : -1;
    if (categoryIndex >= 0) {
      const source = rawCells[categoryIndex] ?? cells[categoryIndex] ?? "";
      const majorMatch = /大类[:：]\s*([^<\s]+)/.exec(source);
      const minorMatch = /小类[:：]\s*([^<]+)/.exec(source);
      category = majorMatch ? majorMatch[1].trim() : undefined;
      subCategory = minorMatch ? stripTags(minorMatch[1]).trim() : undefined;
      if (!category) {
        const plain = stripTags(source).trim();
        if (plain && MAJOR_CATEGORIES.has(plain)) category = plain;
      }
    }

    // Fields after the zone column, found by content.
    let indexType: string | undefined;
    let reviewDifficulty: string | undefined;
    let reviewCycle: string | undefined;
    if (zoneIndex >= 0) {
      const after = cells.slice(zoneIndex + 1);
      indexType = after
        .find((cell) => INDEX_WORDS.test(cell.trim()))
        ?.trim()
        .replace(/\s+/g, " ");
      reviewDifficulty = after
        .find((cell) => DIFFICULTY_WORDS.has(cell.trim()))
        ?.trim();
      reviewCycle = after.find((cell) => /个月|月$/.test(cell.trim()))?.trim();
    }

    hits.push({
      journalId,
      issn,
      name,
      abbr,
      impactFactor,
      zone,
      category,
      subCategory,
      indexType,
      reviewDifficulty,
      reviewCycle,
      sourceUrl: absoluteUrl(journalLink.href),
    });
  }

  return hits;
}

function absoluteUrl(href: string): string {
  if (/^https?:/i.test(href)) return href;
  const normalized = href.replace(/^\.\//, "").replace(/^\//, "");
  return `https://www.letpub.com.cn/${normalized}`;
}

/**
 * Pick the hit that corresponds to the requested journal.
 * Returns the best hit plus the hits that were equally plausible.
 */
export function pickBestHit(
  hits: LetPubHit[],
  query: { name?: string; issn?: string },
): { hit?: LetPubHit; ambiguous: LetPubHit[] } {
  if (hits.length === 0) return { ambiguous: [] };

  const wantedIssn = normalizeIssn(query.issn ?? "");
  if (wantedIssn) {
    const exact = hits.find(
      (hit) => normalizeIssn(hit.issn ?? "") === wantedIssn,
    );
    if (exact) return { hit: exact, ambiguous: [] };
  }

  const wanted = normalizeJournalKey(query.name ?? "");
  if (!wanted) return { ambiguous: hits };

  const scored = hits.map((hit) => {
    let score = 0;
    for (const candidate of [hit.name, hit.abbr ?? ""]) {
      const key = normalizeJournalKey(candidate);
      if (!key) continue;
      if (key === wanted) {
        score = Math.max(score, 1);
        continue;
      }
      if (key.startsWith(wanted) || wanted.startsWith(key)) {
        score = Math.max(score, 0.9);
        continue;
      }
      score = Math.max(score, similarity(key, wanted));
    }
    return { hit, score };
  });

  let best: LetPubHit | undefined;
  let bestScore = 0;
  for (const entry of scored) {
    if (entry.score > bestScore) {
      bestScore = entry.score;
      best = entry.hit;
    }
  }

  if (!best || bestScore < 0.55) {
    const withZone = hits.filter((hit) => hit.zone);
    if (withZone.length === 1) return { hit: withZone[0], ambiguous: [] };
    return { ambiguous: hits };
  }

  const ambiguous = scored
    .filter((entry) => entry.score >= bestScore - 0.02 && entry.hit !== best)
    .map((entry) => entry.hit);
  return { hit: best, ambiguous };
}

/** Convert a LetPub hit into the cached entry format. */
export function hitToEntry(hit: LetPubHit): CasJournalEntry | undefined {
  if (!hit.zone) return undefined;
  return {
    issn: hit.issn,
    name: hit.name,
    abbr: hit.abbr,
    zone: hit.zone,
    category: hit.category,
    subCategory: hit.subCategory,
    impactFactor: hit.impactFactor,
    reviewDifficulty: hit.reviewDifficulty,
    reviewCycle: hit.reviewCycle,
    sourceUrl: hit.sourceUrl,
    fetchedAt: Date.now(),
    origin: "letpub",
  };
}
