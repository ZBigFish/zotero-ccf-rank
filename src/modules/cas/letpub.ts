/**
 * LetPub HTTP client.
 *
 * The parsing lives in `./parse` so it can be unit tested; this module only
 * handles the request, the throttling and the retries.
 *
 * Please keep the request interval preference at a polite value: LetPub is a
 * free service.
 */

import type { CasJournalEntry } from "./types";
import {
  buildSearchUrl,
  hitToEntry,
  parseSearchResults,
  pickBestHit,
  type LetPubHit,
} from "./parse";
import { Throttle } from "../../utils/throttle";

export { buildSearchUrl, parseSearchResults, pickBestHit, hitToEntry };
export type { LetPubHit };

export interface CasLookupResult {
  status: "ok" | "not-found" | "http-error" | "parse-error" | "skipped";
  hits: LetPubHit[];
  best?: CasJournalEntry;
  httpStatus?: number;
  message?: string;
}

const REQUEST_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

export interface CasClientOptions {
  /** Minimum spacing between requests, in milliseconds. */
  requestInterval?: number;
  /** Total attempts per journal. */
  attempts?: number;
  /** Log sink. */
  log?: (message: string, ...args: unknown[]) => void;
}

export class CasClient {
  private readonly throttle: Throttle;

  private readonly attempts: number;

  private readonly log: (message: string, ...args: unknown[]) => void;

  constructor(options: CasClientOptions = {}) {
    this.throttle = new Throttle({
      minInterval: options.requestInterval ?? 2000,
      concurrency: 1,
    });
    this.attempts = Math.max(1, options.attempts ?? 2);
    this.log = options.log ?? (() => undefined);
  }

  setRequestInterval(ms: number): void {
    this.throttle.setMinInterval(ms);
  }

  get pending(): number {
    return this.throttle.queueLength;
  }

  /** Look up one journal. Never throws: failures come back as a status. */
  async lookup(query: {
    name?: string;
    issn?: string;
  }): Promise<CasLookupResult> {
    if (!query.name && !query.issn) {
      return { status: "skipped", hits: [], message: "no journal name" };
    }

    const url = buildSearchUrl(query);
    let lastStatus = 0;
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        const html = await this.throttle.run(() => this.fetch(url));
        const hits = parseSearchResults(html);
        if (hits.length === 0) {
          return { status: "not-found", hits: [], message: "no result rows" };
        }
        const { hit, ambiguous } = pickBestHit(hits, query);
        if (!hit) {
          return {
            status: "not-found",
            hits,
            message: ambiguous.length
              ? `ambiguous: ${ambiguous.map((item) => item.name).join(" | ")}`
              : "no matching row",
          };
        }
        const entry = hitToEntry(hit);
        if (!entry) {
          return {
            status: "parse-error",
            hits,
            message:
              "matched row has no CAS zone (probably not an SCI journal)",
          };
        }
        return { status: "ok", hits, best: entry };
      } catch (error) {
        const status = Number((error as { status?: number })?.status ?? 0);
        lastStatus = status;
        const retryable = !status || status >= 500 || status === 429;
        this.log(
          `LetPub request failed (attempt ${attempt}/${this.attempts}, status ${status || "n/a"})`,
          error,
        );
        if (!retryable || attempt === this.attempts) break;
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }
    return {
      status: lastStatus ? "http-error" : "parse-error",
      hits: [],
      httpStatus: lastStatus || undefined,
      message: lastStatus ? `HTTP ${lastStatus}` : "request failed",
    };
  }

  private async fetch(url: string): Promise<string> {
    const zotero = (globalThis as any).Zotero;
    if (!zotero?.HTTP?.request) {
      throw new Error("Zotero.HTTP is unavailable");
    }
    const xhr = await zotero.HTTP.request("GET", url, {
      headers: REQUEST_HEADERS,
      responseType: "text",
      timeout: 20000,
      successCodes: false,
    });
    const status = xhr?.status ?? 0;
    if (status < 200 || status >= 300) {
      const error = new Error(`HTTP ${status}`) as Error & { status?: number };
      error.status = status;
      throw error;
    }
    const text = xhr?.responseText ?? xhr?.response ?? "";
    return typeof text === "string" ? text : String(text ?? "");
  }
}
