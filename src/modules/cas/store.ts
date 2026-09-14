/**
 * Local store for 中科院分区 (CAS journal partition) data.
 *
 * The data is harvested from LetPub and cached on disk, so a lookup is
 * normally instant and offline. A cached journal is refreshed after a
 * configurable number of days; when a refresh finds a different value the
 * stored record is updated and the items that reference it are re-rendered.
 */

import {
  normalizeIssn,
  normalizeJournalKey,
  similarity,
} from "../venue/normalize";
import { readJson, writeJson } from "../../utils/files";
import {
  CAS_CACHE_VERSION,
  CAS_SOURCE,
  CasCacheFile,
  CasJournalEntry,
  emptyCache,
  normalizeZone,
} from "./types";

export type { CasCacheFile, CasJournalEntry };
export { CAS_CACHE_VERSION, CAS_SOURCE, emptyCache, normalizeZone };

export interface CasLookupOptions {
  /** Refresh a record older than this many days (0 disables automatic refresh). */
  ttlDays?: number;
  /** Accept fuzzy name matches above this similarity (0..1). */
  fuzzyThreshold?: number;
}

export class CasStore {
  private cache: CasCacheFile = emptyCache();

  private dirty = false;

  /** Called when a refresh changed a record (used to re-render rows). */
  public onEntryUpdated?: (entry: CasJournalEntry) => void;

  constructor(private readonly filePath: string) {}

  get path(): string {
    return this.filePath;
  }

  get size(): number {
    return Object.keys(this.cache.journals).length;
  }

  get updatedAt(): number {
    return this.cache.updatedAt;
  }

  async load(): Promise<void> {
    const loaded = await readJson<CasCacheFile>(this.filePath);
    if (loaded && loaded.version === CAS_CACHE_VERSION && loaded.journals) {
      this.cache = loaded;
    } else {
      this.cache = emptyCache();
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    this.cache.updatedAt = Date.now();
    await writeJson(this.filePath, this.cache);
    this.dirty = false;
  }

  /** All cached entries (read-only usage). */
  entries(): CasJournalEntry[] {
    return Object.values(this.cache.journals);
  }

  /** Clear every cached journal. */
  async clear(): Promise<number> {
    const count = this.size;
    this.cache = emptyCache();
    this.dirty = true;
    await this.save();
    return count;
  }

  private keyFor(entry: { issn?: string; name: string }): string {
    const issn = normalizeIssn(entry.issn ?? "");
    if (issn) return `issn:${issn}`;
    return `name:${normalizeJournalKey(entry.name)}`;
  }

  private isFresh(entry: CasJournalEntry, ttlDays: number): boolean {
    if (!ttlDays || ttlDays <= 0) return true;
    return Date.now() - entry.fetchedAt < ttlDays * 24 * 60 * 60 * 1000;
  }

  /**
   * Look up a journal locally.
   *
   * @returns `{ entry, fresh }` when found; `undefined` when the journal is not
   *   cached at all. `fresh === false` means the local value was found but
   *   should be refreshed from the network.
   */
  lookup(
    name: string,
    issn: string | undefined,
    options: CasLookupOptions = {},
  ): { entry: CasJournalEntry; fresh: boolean } | undefined {
    const ttlDays = options.ttlDays ?? 0;
    const fuzzyThreshold = options.fuzzyThreshold ?? 0.9;

    const normalizedIssn = normalizeIssn(issn ?? "");
    if (normalizedIssn) {
      const byIssn = this.cache.journals[`issn:${normalizedIssn}`];
      if (byIssn)
        return { entry: byIssn, fresh: this.isFresh(byIssn, ttlDays) };
    }

    const key = normalizeJournalKey(name);
    if (!key) return undefined;

    const directKey = this.cache.nameIndex[key];
    if (directKey && this.cache.journals[directKey]) {
      const entry = this.cache.journals[directKey];
      return { entry, fresh: this.isFresh(entry, ttlDays) };
    }

    // Fuzzy pass over the cached names: Zotero often stores the ISO
    // abbreviation ("IEEE T PATTERN ANAL") while LetPub stores the full title.
    let best: CasJournalEntry | undefined;
    let bestScore = 0;
    for (const [cachedName, cacheKey] of Object.entries(this.cache.nameIndex)) {
      if (Math.abs(cachedName.length - key.length) > 25) continue;
      const score = similarity(cachedName, key);
      if (score < fuzzyThreshold || score <= bestScore) continue;
      const entry = this.cache.journals[cacheKey];
      if (!entry) continue;
      best = entry;
      bestScore = score;
    }
    if (best) return { entry: best, fresh: this.isFresh(best, ttlDays) };

    return undefined;
  }

  /** Store (or update) a record. Returns true when something changed. */
  put(entry: CasJournalEntry): boolean {
    if (!entry || !entry.name || !entry.zone) return false;
    const key = this.keyFor(entry);
    const existing = this.cache.journals[key];
    const changed =
      !existing ||
      existing.zone !== entry.zone ||
      existing.name !== entry.name ||
      existing.abbr !== entry.abbr ||
      existing.category !== entry.category ||
      existing.top !== entry.top ||
      existing.impactFactor !== entry.impactFactor;

    this.cache.journals[key] = { ...entry };
    this.cache.nameIndex[normalizeJournalKey(entry.name)] = key;
    if (entry.abbr) {
      this.cache.nameIndex[normalizeJournalKey(entry.abbr)] = key;
    }
    if (entry.issn) {
      const issn = normalizeIssn(entry.issn);
      if (issn) this.cache.journals[`issn:${issn}`] = this.cache.journals[key];
    }
    this.dirty = true;
    if (changed) this.onEntryUpdated?.({ ...entry });
    return changed;
  }

  /** Entries that are candidates for a background refresh. */
  stale(ttlDays: number, limit = Infinity): CasJournalEntry[] {
    if (!ttlDays || ttlDays <= 0) return [];
    const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
    const seen = new Set<string>();
    const result: CasJournalEntry[] = [];
    for (const entry of Object.values(this.cache.journals)) {
      const identity = `${entry.issn ?? ""}|${entry.name}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      if (entry.fetchedAt > cutoff) continue;
      if (entry.origin === "alias") continue;
      result.push(entry);
      if (result.length >= limit) break;
    }
    return result.sort((a, b) => a.fetchedAt - b.fetchedAt);
  }

  /** Serialize for export. */
  toJSON(): CasCacheFile {
    return JSON.parse(JSON.stringify(this.cache)) as CasCacheFile;
  }

  /**
   * Import an externally produced dataset.
   *
   * Accepted shapes:
   *  - `{ journals: { <issn|name>: entry } }` (this plugin's export)
   *  - `{ "<issn|name>": { zone|分区..., name|journal... } }`
   *  - `[ { issn, name, zone|分区, category, ... } ]`
   *  - a CSV/TSV text blob with a header row containing ISSN/name/zone columns
   */
  async importData(
    payload: string,
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;
    const text = payload.trim();
    if (!text) return { imported, skipped };

    if (text.startsWith("{") || text.startsWith("[")) {
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (_error) {
        return { imported, skipped: 1 };
      }
      const list: any[] = Array.isArray(parsed)
        ? parsed
        : parsed.journals && typeof parsed.journals === "object"
          ? Object.values(parsed.journals)
          : Object.entries(parsed).map(([key, value]) =>
              typeof value === "object" && value !== null
                ? { key, ...(value as object) }
                : { key, zone: String(value) },
            );
      for (const item of list) {
        const entry = normalizeImportedEntry(item);
        if (!entry) {
          skipped++;
          continue;
        }
        this.put(entry);
        imported++;
      }
      await this.save();
      return { imported, skipped };
    }

    // Delimited text
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return { imported, skipped };
    const delimiter = lines[0].includes("\t")
      ? "\t"
      : lines[0].includes(",")
        ? ","
        : lines[0].includes(";")
          ? ";"
          : null;
    if (!delimiter) return { imported, skipped };
    const header = lines[0]
      .split(delimiter)
      .map((cell) => cell.trim().toLowerCase());
    const indexOf = (...names: string[]) =>
      header.findIndex((cell) =>
        names.some((name) => cell === name || cell.includes(name)),
      );
    const issnIdx = indexOf("issn");
    const nameIdx = indexOf("journal", "name", "期刊", "刊名");
    const zoneIdx = indexOf("zone", "分区", "quartile");
    const abbrIdx = indexOf("abbr", "简称");
    const categoryIdx = indexOf("category", "大类", "学科");
    if (zoneIdx === -1 || (nameIdx === -1 && issnIdx === -1)) {
      return { imported, skipped: lines.length - 1 };
    }
    for (const line of lines.slice(1)) {
      const cells = line.split(delimiter);
      const entry = normalizeImportedEntry({
        issn: issnIdx >= 0 ? cells[issnIdx] : undefined,
        name: nameIdx >= 0 ? cells[nameIdx] : undefined,
        zone: cells[zoneIdx],
        abbr: abbrIdx >= 0 ? cells[abbrIdx] : undefined,
        category: categoryIdx >= 0 ? cells[categoryIdx] : undefined,
      });
      if (!entry) {
        skipped++;
        continue;
      }
      this.put(entry);
      imported++;
    }
    await this.save();
    return { imported, skipped };
  }
}

function normalizeImportedEntry(raw: any): CasJournalEntry | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const name =
    pickString(
      raw.name,
      raw.journal,
      raw.journalName,
      raw.title,
      raw["期刊"],
      raw["期刊名称"],
    ) ?? "";
  const issn = pickString(raw.issn, raw.ISSN);
  const zone = normalizeZone(
    pickString(
      raw.zone,
      raw.quartile,
      raw["分区"],
      raw["中科院分区"],
      raw["大类分区"],
    ),
  );
  if (!zone) return undefined;
  if (!name && !issn) return undefined;
  return {
    issn,
    name: name || (issn as string),
    abbr: pickString(raw.abbr, raw.abbreviation, raw.shortName, raw["简称"]),
    zone,
    category: pickString(raw.category, raw.major, raw["大类"], raw["学科"]),
    subCategory: pickString(raw.subCategory, raw.minor, raw["小类"]),
    top: raw.top === true || raw.top === "true" || raw["Top"] === true,
    impactFactor: pickString(raw.impactFactor, raw.if, raw["影响因子"]),
    reviewDifficulty: pickString(raw.reviewDifficulty, raw["难度"]),
    reviewCycle: pickString(raw.reviewCycle, raw["审稿周期"]),
    sourceUrl: pickString(raw.sourceUrl, raw.url),
    fetchedAt: typeof raw.fetchedAt === "number" ? raw.fetchedAt : Date.now(),
    origin: "import",
  };
}

function pickString(...values: any[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}
