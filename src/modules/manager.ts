/**
 * The identification manager.
 *
 * Responsibilities:
 *  - queue items and identify them one at a time (Zotero's UI stays usable)
 *  - write the result back into the item's Extra field
 *  - run the "scan the whole library" job with a progress window
 *  - keep the CAS cache fresh (the "update the partition table" button)
 *  - tell the UI to repaint the affected rows
 */

import {
  LEGACY_NOTE_TITLE,
  mergeExtra,
  RankRecord,
  RankRecord as RankRecordType,
} from "./record";
import { identifyItem, isRankable, readRecord } from "./identify";
import { DblpClient } from "./net/dblp";
import { CasClient } from "./cas/letpub";
import { CasJournalEntry, CasStore } from "./cas/store";
import { RuntimeOptions, readRuntimeOptions } from "../utils/prefs";
import { joinPath, pluginDirectory } from "../utils/files";
import { mapConcurrent } from "../utils/throttle";
import { getString } from "../utils/locale";

export interface ManagerCallbacks {
  /** A record was written for this item id. */
  onItemUpdated?: (itemID: number) => void;
  /** Progress for long running jobs, e.g. the settings page progress bar. */
  onProgress?: (report: ProgressReport) => void;
}

/** Short label for the job a progress report belongs to. */
export type ProgressPhase = "scan" | "identify" | "cas";

export interface ProgressReport {
  phase: ProgressPhase;
  done: number;
  total: number;
  /** 0-100, already clamped. */
  percent: number;
  /** True while the job is running, false for the final report. */
  active: boolean;
}

export interface ScanOptions {
  /** Restrict the scan to a library id. */
  libraryID?: number;
  /** Re-identify items that already have a rank tag. */
  force?: boolean;
  /** Also refresh the CAS cache for journals that are out of date. */
  refreshCas?: boolean;
}

export interface ScanSummary {
  total: number;
  scanned: number;
  updated: number;
  skipped: boolean;
  cancelled: boolean;
  errors: number;
  casRefreshed: number;
}

const STOP_FLAG = Symbol("cancelled");

export class IdentifyManager {
  private readonly dblp = new DblpClient();

  private readonly cas = new CasClient();

  private store?: CasStore;

  private storeReady?: Promise<CasStore>;

  private options: RuntimeOptions;

  private queue: number[] = [];

  private queued = new Set<number>();

  private running = false;

  private scanning = false;

  private cancelRequested = false;

  private lastProgress?: ProgressReport;

  private newItemTimers = new Map<number, number>();

  constructor(private readonly callbacks: ManagerCallbacks = {}) {
    this.options = readRuntimeOptions();
  }

  /** Re-read the preferences (called when the user changes something). */
  reloadOptions(): void {
    this.options = readRuntimeOptions();
    this.dblp.setEndpoint(this.options.dblpEndpoint);
    this.cas.setRequestInterval(this.options.casRequestInterval);
  }

  get runtimeOptions(): RuntimeOptions {
    return this.options;
  }

  get casStore(): CasStore | undefined {
    return this.store;
  }

  get isScanning(): boolean {
    return this.scanning;
  }

  /**
   * Where the current job stands, or undefined when nothing is running.
   *
   * The settings page shows this as a progress bar; keeping the last value after
   * a job ends lets the pane render the finished state instead of snapping back
   * to empty.
   */
  get progress(): ProgressReport | undefined {
    return this.lastProgress;
  }

  /**
   * Report progress to the registered callback and remember it for late readers.
   *
   * `active` is false for the final report of a job, and for the report that
   * carries a cancel request, so listeners can tell "still working" from "done".
   */
  private reportToListeners(
    phase: ProgressPhase,
    done: number,
    total: number,
    active = true,
  ): void {
    const safeTotal = Math.max(0, Math.floor(total) || 0);
    const safeDone = Math.max(0, Math.min(Math.floor(done) || 0, safeTotal));
    const percent = safeTotal ? Math.round((safeDone / safeTotal) * 100) : 0;
    const report: ProgressReport = {
      phase,
      done: safeDone,
      total: safeTotal,
      percent,
      active,
    };
    this.lastProgress = report;
    try {
      this.callbacks.onProgress?.(report);
    } catch (error) {
      ztoolkit.log("progress callback failed", error);
    }
  }

  /**
   * Load the CAS cache from disk. Safe to call multiple times.
   *
   * A failed load is not cached: the next call retries, so a transient problem
   * (a locked file, a read-only data directory) does not disable the plugin for
   * the rest of the session.
   */
  async init(): Promise<CasStore> {
    if (this.store) return this.store;
    if (!this.storeReady) {
      this.storeReady = (async () => {
        const store = new CasStore(
          joinPath(pluginDirectory("cache"), "cas-journals.json"),
        );
        await store.load();
        store.onEntryUpdated = (entry) =>
          void this.handleCasEntryUpdated(entry);
        this.store = store;
        return store;
      })().catch((error) => {
        this.storeReady = undefined;
        throw error;
      });
    }
    return this.storeReady;
  }

  // -------------------------------------------------------------------------
  // Single item / queued identification
  // -------------------------------------------------------------------------

  /** Identify the given items, queued and de-duplicated. */
  enqueue(items: Zotero.Item[]): void {
    for (const item of items) {
      if (!item?.id) continue;
      if (!isRankable(item as unknown as Parameters<typeof isRankable>[0])) {
        continue;
      }
      if (!this.queued.has(item.id)) {
        this.queued.add(item.id);
        this.queue.push(item.id);
      }
    }
    void this.drain();
  }

  /** Identify the given items immediately, awaiting the result. */
  async identifyNow(
    items: Zotero.Item[],
    options: { force?: boolean } = {},
  ): Promise<{ processed: number; updated: number }> {
    await this.init();
    let processed = 0;
    let updated = 0;
    const total = items.length;
    if (total) this.reportToListeners("identify", 0, total);
    for (const item of items) {
      if (!item || !item.id) continue;
      const result = await this.identifyOne(item, options);
      processed++;
      if (result) updated++;
      this.reportToListeners("identify", processed, total);
    }
    if (total) this.reportToListeners("identify", processed, total, false);
    return { processed, updated };
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    // Make sure the CAS cache is available: without it the pipeline would
    // silently skip the 中科院 half of the work.
    await this.init().catch((error) =>
      ztoolkit.log("could not load the journal cache", error),
    );
    try {
      while (this.queue.length) {
        const id = this.queue.shift() as number;
        this.queued.delete(id);
        const item = Zotero.Items.get(id);
        if (!item) continue;
        try {
          await this.identifyOne(item);
        } catch (error) {
          ztoolkit.log("identifyOne failed", error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Identify one item and persist the result.
   *
   * The item is processed when
   *  - the user forced it,
   *  - nothing is known yet, or
   *  - a journal still lacks its 中科院分区 (the CAS cache may have been empty
   *    the first time around).
   *
   * @returns true when the item was modified
   */
  private async identifyOne(
    item: Zotero.Item,
    options: { force?: boolean } = {},
  ): Promise<boolean> {
    if (!isRankable(item as unknown as Parameters<typeof isRankable>[0])) {
      return false;
    }

    const existing = readRecord(item as never);
    if (this.options.skipAlreadyIdentified && !options.force) {
      const complete =
        Boolean(existing.ccf) &&
        (Boolean(existing.cas) ||
          existing.venueType === "conference" ||
          existing.venueType === "preprint" ||
          existing.ccf === "NotApplicable");
      if (complete) return false;
    }

    const result = await identifyItem(item as never, {
      dblp: this.options.dblpEnabled ? this.dblp : undefined,
      cas: this.options.casEnabled ? this.cas : undefined,
      casStore: this.store,
      options: {
        dblpEnabled: this.options.dblpEnabled,
        casEnabled: this.options.casEnabled,

        casCacheTtlDays: this.options.casCacheTtlDays,
        aliasMapping: this.options.aliasMapping,
      },
      onCasUpdated: (entry, stale) => {
        void this.handleCasEntryUpdated(entry, stale);
      },
      log: (message, ...args) => ztoolkit.log(message, ...args),
    });

    if (!result.changed && !options.force) return false;

    const extra = (item.getField("extra") as string) ?? "";
    const merged = mergeExtra(extra, result.record);
    if (merged === extra) return false;
    item.setField("extra", merged);
    await item.saveTx();
    const itemID = item.id;
    await this.migrateLegacyNote(item);
    this.callbacks.onItemUpdated?.(itemID);
    return true;
  }

  /**
   * The previous plugin version kept its data in a child note titled
   * "CCF Info & Citations". Once the data lives in `Extra`, that note can be
   * removed — only when the user asked for it.
   */
  private async migrateLegacyNote(item: Zotero.Item): Promise<void> {
    if (!this.options.deleteLegacyNoteAfterMigration) return;
    try {
      for (const noteID of item.getNotes()) {
        const note = Zotero.Items.get(noteID);
        if (!note || note.getNoteTitle?.() !== LEGACY_NOTE_TITLE) continue;
        await note.eraseTx();
        ztoolkit.log("removed the legacy CCF note", noteID);
      }
    } catch (error) {
      ztoolkit.log("could not remove the legacy CCF note", error);
    }
  }

  /** Identify one item and return the record without saving (preview). */
  async preview(item: Zotero.Item): Promise<RankRecordType> {
    await this.init();
    const result = await identifyItem(item as never, {
      dblp: this.options.dblpEnabled ? this.dblp : undefined,
      cas: this.options.casEnabled ? this.cas : undefined,
      casStore: this.store,
      options: {
        dblpEnabled: this.options.dblpEnabled,
        casEnabled: this.options.casEnabled,

        casCacheTtlDays: this.options.casCacheTtlDays,
        aliasMapping: this.options.aliasMapping,
      },
      log: (message, ...args) => ztoolkit.log(message, ...args),
    });
    return result.record;
  }

  // -------------------------------------------------------------------------
  // New items
  // -------------------------------------------------------------------------

  /**
   * Called from the notifier when new items were added. Zotero often fires the
   * `add` event before the item is fully populated (metadata retrieval may
   * still be running), hence the configurable delay.
   */
  scheduleNewItems(ids: Array<string | number>): void {
    if (!this.options.enabled || !this.options.autoIdentifyNewItems) return;
    const delay = Math.max(0, this.options.newItemDelay);
    for (const raw of ids) {
      const id = Number(raw);
      if (!Number.isFinite(id)) continue;
      const existing = this.newItemTimers.get(id);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        this.newItemTimers.delete(id);
        const item = Zotero.Items.get(id);
        if (!item) return;
        this.enqueue([item]);
      }, delay) as unknown as number;
      this.newItemTimers.set(id, timer);
    }
  }

  clearTimers(): void {
    for (const timer of this.newItemTimers.values()) {
      clearTimeout(timer);
    }
    this.newItemTimers.clear();
  }

  // -------------------------------------------------------------------------
  // Full library scan
  // -------------------------------------------------------------------------

  cancelScan(): void {
    if (this.scanning) this.cancelRequested = true;
  }

  /**
   * Scan every library (or one library) and identify the items that still lack
   * information.
   */
  async scanLibrary(options: ScanOptions = {}): Promise<ScanSummary> {
    const summary: ScanSummary = {
      total: 0,
      scanned: 0,
      updated: 0,
      skipped: false,
      cancelled: false,
      errors: 0,
      casRefreshed: 0,
    };
    if (this.scanning) {
      summary.skipped = true;
      return summary;
    }
    await this.init();
    this.scanning = true;
    this.cancelRequested = false;

    try {
      const items = await this.collectItems(options.libraryID);
      summary.total = items.length;
      const title = getString("scan-progress-title");
      // No auto-close: the window is closed by the explicit timer at the end.
      const progress = new ztoolkit.ProgressWindow(title, {
        closeOnClick: false,
      });
      const line = progress
        .createLine({
          text: getString("scan-progress-line", {
            args: { done: 0, total: items.length },
          }),
          type: "default",
          progress: 0,
        })
        .show();

      let done = 0;
      for (const item of items) {
        if (this.cancelRequested) {
          summary.cancelled = true;
          break;
        }
        try {
          const updated = await this.identifyOne(item, {
            force: options.force,
          });
          if (updated) summary.updated++;
        } catch (error) {
          summary.errors++;
          ztoolkit.log("scan: item failed", item.id, error);
        }
        done++;
        summary.scanned = done;
        if (done % 3 === 0 || done === items.length) {
          const percent = items.length
            ? Math.round((done / items.length) * 100)
            : 100;
          line.changeLine({
            text: getString("scan-progress-line", {
              args: { done, total: items.length },
            }),
            progress: percent,
          });
          this.reportToListeners("scan", done, items.length);
        }
      }

      line.changeLine({
        text: summary.cancelled
          ? getString("scan-cancelled")
          : getString("scan-finished", {
              args: { updated: summary.updated, total: items.length },
            }),
        type: summary.cancelled ? "default" : "success",
        progress: 100,
      });
      progress.startCloseTimer(6000);
      this.reportToListeners("scan", done, items.length, false);

      if (options.refreshCas !== false) {
        summary.casRefreshed = await this.refreshCasCache();
      }
      return summary;
    } finally {
      this.scanning = false;
      this.cancelRequested = false;
    }
  }

  /**
   * Every paper-like item of the given libraries (or of all of them).
   *
   * `Zotero.Library` has no `getItems()`, so the listing goes through
   * `Zotero.Items.getAll()`, which is async and needs a library id.
   */
  /** @internal exposed so the listing logic can be tested directly. */
  async collectItems(libraryID?: number): Promise<Zotero.Item[]> {
    let libraries: Array<{ libraryID: number; libraryType?: string }>;
    if (libraryID !== undefined) {
      const library = Zotero.Libraries.get(libraryID) as unknown as
        { libraryID: number; libraryType?: string } | false;
      libraries = library ? [library] : [];
    } else {
      try {
        libraries = Zotero.Libraries.getAll() as unknown as Array<{
          libraryID: number;
          libraryType?: string;
        }>;
      } catch (error) {
        ztoolkit.log("scan: the library cache is not ready yet", error);
        return [];
      }
    }

    const items: Zotero.Item[] = [];
    for (const library of libraries) {
      // Feed libraries have no useful venue metadata.
      if (library.libraryType === "feed") continue;
      let list: unknown;
      try {
        list = await Zotero.Items.getAll(
          library.libraryID,
          false,
          false,
          false,
        );
      } catch (error) {
        ztoolkit.log("scan: cannot list library items", error);
        continue;
      }
      for (const entry of Array.from((list ?? []) as ArrayLike<unknown>)) {
        const item =
          typeof entry === "number"
            ? Zotero.Items.get(entry)
            : (entry as Zotero.Item);
        if (!item) continue;
        if (!isRankable(item as unknown as Parameters<typeof isRankable>[0])) {
          continue;
        }
        items.push(item);
      }
    }
    return items;
  }

  // -------------------------------------------------------------------------
  // CAS cache maintenance
  // -------------------------------------------------------------------------

  /** Update every cached journal whose record is older than the TTL. */
  async refreshCasCache(force = false): Promise<number> {
    const store = await this.init();
    const ttl = force ? 0 : this.options.casCacheTtlDays;
    const stale = force ? store.entries() : store.stale(ttl);
    const unique = dedupeEntries(stale);
    if (unique.length === 0) return 0;

    const window = new ztoolkit.ProgressWindow(getString("cas-refresh-title"), {
      closeOnClick: false,
    });
    const line = window
      .createLine({
        text: getString("cas-refresh-line", {
          args: { done: 0, total: unique.length },
        }),
        type: "default",
        progress: 0,
      })
      .show();

    let done = 0;
    let refreshed = 0;
    await mapConcurrent(unique, 1, async (entry) => {
      if (this.cancelRequested) return;
      try {
        const result = await this.cas.lookup({
          name: entry.name,
          issn: entry.issn,
        });
        if (result.status === "ok" && result.best) {
          const changed = store.put(result.best);
          if (changed) refreshed++;
        }
      } catch (error) {
        ztoolkit.log("CAS refresh failed", entry.name, error);
      }
      done++;
      const percent = Math.round((done / unique.length) * 100);
      line.changeLine({
        text: getString("cas-refresh-line", {
          args: { done, total: unique.length },
        }),
        progress: percent,
      });
      this.reportToListeners("cas", done, unique.length);
    });
    await store.save();
    line.changeLine({
      text: getString("cas-refresh-finished", { args: { count: refreshed } }),
      type: "success",
      progress: 100,
    });
    window.startCloseTimer(5000);
    this.reportToListeners("cas", unique.length, unique.length, false);
    return refreshed;
  }

  /**
   * Fill the cache for every journal referenced by the library, so a library
   * scan does not have to hit the network later.
   */
  async warmCasCache(): Promise<number> {
    const store = await this.init();
    const items = await this.allItems();
    const pending: Array<{ name: string; issn?: string }> = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!isRankable(item as unknown as Parameters<typeof isRankable>[0])) {
        continue;
      }
      let name = "";
      let issn = "";
      try {
        name = (item.getField("publicationTitle") as string) ?? "";
        issn = (item.getField("ISSN") as string) ?? "";
      } catch (_error) {
        continue;
      }
      if (!name) continue;
      const key = `${issn}|${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (store.lookup(name, issn, { ttlDays: this.options.casCacheTtlDays })) {
        continue;
      }
      pending.push({ name, issn });
    }
    if (pending.length === 0) return 0;

    const window = new ztoolkit.ProgressWindow(getString("cas-refresh-title"), {
      closeOnClick: false,
    });
    const line = window
      .createLine({
        text: getString("cas-refresh-line", {
          args: { done: 0, total: pending.length },
        }),
        type: "default",
        progress: 0,
      })
      .show();

    let done = 0;
    let filled = 0;
    await mapConcurrent(pending, 1, async (query) => {
      if (this.cancelRequested) return;
      try {
        const result = await this.cas.lookup(query);
        if (result.status === "ok" && result.best) {
          store.put(result.best);
          filled++;
        }
      } catch (error) {
        ztoolkit.log("CAS warm-up failed", query.name, error);
      }
      done++;
      line.changeLine({
        text: getString("cas-refresh-line", {
          args: { done, total: pending.length },
        }),
        progress: Math.round((done / pending.length) * 100),
      });
      this.reportToListeners("cas", done, pending.length);
    });
    await store.save();
    line.changeLine({
      text: getString("cas-refresh-finished", { args: { count: filled } }),
      type: "success",
      progress: 100,
    });
    window.startCloseTimer(5000);
    this.reportToListeners("cas", pending.length, pending.length, false);
    return filled;
  }

  /** Re-render every item that references the given journal. */
  private async handleCasEntryUpdated(
    entry: CasJournalEntry,
    stale?: RankRecord,
  ): Promise<void> {
    if (!entry.zone) return;
    for (const item of await this.allItems()) {
      let matches = false;
      try {
        const issn = (item.getField("ISSN") as string) ?? "";
        const title = (item.getField("publicationTitle") as string) ?? "";
        matches =
          Boolean(
            issn &&
            entry.issn &&
            normalizeIssn(issn) === normalizeIssn(entry.issn),
          ) ||
          Boolean(
            title &&
            entry.name &&
            title.toLowerCase() === entry.name.toLowerCase(),
          ) ||
          Boolean(
            stale?.casVenue &&
            title &&
            title.toLowerCase() === stale.casVenue.toLowerCase(),
          );
      } catch (_error) {
        continue;
      }
      if (!matches) continue;
      const extra = (item.getField("extra") as string) ?? "";
      if (!extra) continue;
      const record = readRecord(item as never);
      if (record.cas === entry.zone) continue;
      record.cas = entry.zone;
      record.casVenue = entry.name;
      const merged = mergeExtra(extra, record);
      if (merged === extra) continue;
      item.setField("extra", merged);
      const itemID = item.id;
      void item.saveTx().then(() => this.callbacks.onItemUpdated?.(itemID));
    }
  }

  /**
   * Every item of the user's libraries.
   *
   * `Zotero.Items.getAll()` is async in Zotero 7+ and requires a library id, so
   * the libraries are walked explicitly and every call is awaited. When a
   * listing fails the cache-free fallback is used instead, so a single hiccup
   * never hides the whole library.
   */
  async allItems(): Promise<Zotero.Item[]> {
    // `Zotero.Libraries.getAll()` throws while its cache is still empty, which
    // can happen if this runs very early.
    let libraries: Array<{ libraryID: number; libraryType?: string }>;
    try {
      libraries = Zotero.Libraries.getAll() as unknown as Array<{
        libraryID: number;
        libraryType?: string;
      }>;
    } catch (error) {
      ztoolkit.log("allItems: library cache is not ready yet", error);
      return await this.collectItems();
    }

    const items: Zotero.Item[] = [];
    for (const library of libraries) {
      try {
        if (library.libraryType === "feed") continue;
      } catch (_error) {
        // ignore and include the library
      }
      let list: unknown;
      try {
        list = await Zotero.Items.getAll(
          library.libraryID,
          false,
          false,
          false,
        );
      } catch (error) {
        ztoolkit.log(
          "allItems: cannot list a library, using the fallback",
          error,
        );
        return await this.collectItems();
      }
      for (const entry of Array.from((list ?? []) as ArrayLike<unknown>)) {
        const item =
          typeof entry === "number"
            ? Zotero.Items.get(entry)
            : (entry as Zotero.Item);
        if (item) items.push(item);
      }
    }
    return items;
  }
}

function dedupeEntries(entries: CasJournalEntry[]): CasJournalEntry[] {
  const seen = new Set<string>();
  const unique: CasJournalEntry[] = [];
  for (const entry of entries) {
    const identity = `${entry.issn ?? ""}|${entry.name}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    unique.push(entry);
  }
  return unique;
}

function normalizeIssn(value: string): string {
  return String(value ?? "")
    .replace(/[^0-9Xx]/g, "")
    .toUpperCase();
}
