/**
 * DBLP lookup.
 *
 * The plugin asks a small public worker that proxies DBLP search, because
 * dblp.org itself rate-limits and blocks plain API clients. Two shapes are
 * supported:
 *
 *  - `GET  <endpoint>?query=<normalized title>`  -> `{ query, urls: [{url,title}] }`
 *  - `POST <endpoint>` `{ queries: [...] }`      -> `[{ urls: [...] }, ...]`
 *
 * When the worker is unreachable the caller falls back to the item metadata,
 * which is often enough (see the venue resolver).
 */

import { normalizeVenueTokens } from "../venue/normalize";
import { ccfRankList, notableVenues } from "../../data/ccfCatalog";

export const DEFAULT_DBLP_ENDPOINT = "https://dblp.timetrap.workers.dev/";

export interface DblpHit {
  /** DBLP record path, e.g. "conf/nips/VaswaniSPUJGKP17". */
  path: string;
  /** DBLP venue path, e.g. "/conf/nips". */
  venuePath: string;
  title: string;
  /** Raw URL returned by the API. */
  url: string;
}

export interface DblpResult {
  status: "ok" | "not-found" | "http-error" | "network-error" | "parse-error";
  hits: DblpHit[];
  httpStatus?: number;
  message?: string;
}

/** Strip punctuation and spaces the same way the worker does. */
export function normalizeTitle(title: string): string {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[.,^\s]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[-:：*]/g, "");
}

/** Loose title comparison used to accept a DBLP hit. */
export function titlesMatch(a: string, b: string): boolean {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length > 20 && right.length > 20) {
    const prefix = Math.min(40, left.length, right.length);
    if (left.slice(0, prefix) === right.slice(0, prefix)) return true;
  }
  return false;
}

export function venuePathOf(path: string): string {
  const clean = String(path ?? "").replace(/^\/+/, "");
  const lastSlash = clean.lastIndexOf("/");
  if (lastSlash === -1) return "";
  return `/${clean.slice(0, lastSlash)}`;
}

/** Does this path belong to an arXiv/CoRR preprint record? */
export function isPreprintPath(venuePath: string): boolean {
  return (
    /^\/(?:journals\/)?corr$/i.test(venuePath) ||
    /^\/journals\/corr$/i.test(venuePath)
  );
}

export interface DblpClientOptions {
  /** Endpoint base URL; trailing slash tolerated. */
  endpoint?: string;
  /** Attempts per request. */
  attempts?: number;
  /** Log sink. */
  log?: (message: string, ...args: unknown[]) => void;
}

export class DblpClient {
  private endpoint: string;

  private readonly attempts: number;

  private readonly log: (message: string, ...args: unknown[]) => void;

  constructor(options: DblpClientOptions = {}) {
    this.endpoint = normalizeEndpoint(
      options.endpoint ?? DEFAULT_DBLP_ENDPOINT,
    );
    this.attempts = Math.max(1, options.attempts ?? 2);
    this.log = options.log ?? (() => undefined);
  }

  setEndpoint(endpoint: string): void {
    this.endpoint = normalizeEndpoint(endpoint);
  }

  get endpointUrl(): string {
    return this.endpoint;
  }

  async lookup(title: string): Promise<DblpResult> {
    const normalized = normalizeTitle(title);
    if (!normalized) {
      return { status: "not-found", hits: [], message: "empty title" };
    }
    const url = `${this.endpoint}?query=${encodeURIComponent(normalized)}`;
    const response = await this.requestWithRetry(() => this.get(url));
    if (!response.ok) return response.result;

    try {
      const payload = JSON.parse(response.text);
      const urls = Array.isArray(payload?.urls) ? payload.urls : [];
      const hits = toHits(urls);
      if (hits.length === 0) {
        return {
          status: "not-found",
          hits: [],
          message: "no urls in response",
        };
      }
      return { status: "ok", hits };
    } catch (error) {
      return {
        status: "parse-error",
        hits: [],
        message: String((error as Error)?.message ?? error),
      };
    }
  }

  /** Batch lookup; falls back to sequential single queries when needed. */
  async lookupBatch(titles: string[]): Promise<DblpResult[]> {
    if (titles.length === 0) return [];
    const body = JSON.stringify({
      queries: titles.map((title) => normalizeTitle(title)),
    });
    const response = await this.requestWithRetry(() => this.post(body));
    if (response.ok) {
      try {
        const payload = JSON.parse(response.text);
        if (Array.isArray(payload)) {
          return titles.map((_, index) => {
            const entry = payload[index];
            const urls = Array.isArray(entry?.urls) ? entry.urls : [];
            const hits = toHits(urls);
            return hits.length
              ? ({ status: "ok", hits } as DblpResult)
              : ({ status: "not-found", hits: [] } as DblpResult);
          });
        }
      } catch (error) {
        this.log(
          "batch response was not JSON, falling back to single queries",
          error,
        );
      }
    } else {
      this.log(
        `batch lookup failed (${response.result.status}${response.result.httpStatus ? ` ${response.result.httpStatus}` : ""}), falling back to single queries`,
      );
    }

    const results: DblpResult[] = [];
    for (const title of titles) {
      results.push(await this.lookup(title));
    }
    return results;
  }

  private async requestWithRetry(
    send: () => Promise<
      { ok: true; text: string } | { ok: false; result: DblpResult }
    >,
  ): Promise<{ ok: true; text: string } | { ok: false; result: DblpResult }> {
    let last: { ok: false; result: DblpResult } | undefined;
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      const outcome = await send();
      if (outcome.ok) return outcome;
      last = outcome;
      const status = outcome.result.httpStatus ?? 0;
      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || attempt === this.attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
    return (
      last ?? {
        ok: false,
        result: { status: "network-error", hits: [] },
      }
    );
  }

  private async get(
    url: string,
  ): Promise<{ ok: true; text: string } | { ok: false; result: DblpResult }> {
    return this.send("GET", url);
  }

  private async post(
    body: string,
  ): Promise<{ ok: true; text: string } | { ok: false; result: DblpResult }> {
    return this.send("POST", this.endpoint, body);
  }

  private async send(
    method: string,
    url: string,
    body?: string,
  ): Promise<{ ok: true; text: string } | { ok: false; result: DblpResult }> {
    const zotero = (globalThis as any).Zotero;
    if (!zotero?.HTTP?.request) {
      return {
        ok: false,
        result: {
          status: "network-error",
          hits: [],
          message: "Zotero.HTTP unavailable",
        },
      };
    }
    try {
      const xhr = await zotero.HTTP.request(method, url, {
        body,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        responseType: "text",
        timeout: 20000,
        successCodes: false,
      });
      const status = xhr?.status ?? 0;
      if (status < 200 || status >= 300) {
        return {
          ok: false,
          result: {
            status: "http-error",
            hits: [],
            httpStatus: status,
            message: `HTTP ${status}`,
          },
        };
      }
      const text = xhr?.responseText ?? xhr?.response ?? "";
      return {
        ok: true,
        text: typeof text === "string" ? text : String(text ?? ""),
      };
    } catch (error) {
      const status = Number((error as { status?: number })?.status ?? 0);
      this.log("DBLP request failed", error);
      return {
        ok: false,
        result: {
          status: status ? "http-error" : "network-error",
          hits: [],
          httpStatus: status || undefined,
          message: String((error as Error)?.message ?? error),
        },
      };
    }
  }
}

function toHits(urls: any[]): DblpHit[] {
  const hits: DblpHit[] = [];
  for (const entry of urls) {
    if (!entry || typeof entry.url !== "string") continue;
    const path = entry.url.replace(/^\/+/, "");
    const venuePath = venuePathOf(path);
    hits.push({
      path,
      venuePath,
      title: typeof entry.title === "string" ? entry.title : "",
      url: entry.url,
    });
  }
  return hits;
}

/** Choose the hit that matches the requested title best. */
export function pickHit(hits: DblpHit[], title: string): DblpHit | undefined {
  if (hits.length === 0) return undefined;
  const exact = hits.filter(
    (hit) => normalizeTitle(hit.title) === normalizeTitle(title),
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    // Prefer a record belonging to a known venue.
    const known = exact.find((hit) => isKnownVenuePath(hit.venuePath));
    return known ?? exact[0];
  }

  const tokenTarget = normalizeVenueTokens(title).join("");
  if (tokenTarget) {
    const fuzzy = hits.find((hit) => {
      const candidate = normalizeVenueTokens(hit.title).join("");
      if (!candidate) return false;
      return candidate === tokenTarget;
    });
    if (fuzzy) return fuzzy;
  }

  // A prefix/containment match happens with subtitles.
  const partial = hits.filter((hit) => titlesMatch(hit.title, title));
  if (partial.length) {
    const known = partial.find((hit) => isKnownVenuePath(hit.venuePath));
    return known ?? partial[0];
  }
  return undefined;
}

/** Whether a DBLP venue path is in the bundled CCF catalog or notable list. */
export function isKnownVenuePath(venuePath: string): boolean {
  if (ccfRankList[venuePath]) return true;
  return notableVenues.some((venue) => venue.paths.includes(venuePath));
}

function normalizeEndpoint(endpoint: string): string {
  const value = String(endpoint ?? "").trim() || DEFAULT_DBLP_ENDPOINT;
  return value.endsWith("/") ? value : `${value}/`;
}
