/**
 * A tiny promise queue that guarantees a minimum spacing between calls and
 * limits how many run at the same time. Used to stay polite towards LetPub.
 */

export interface ThrottleOptions {
  /** Minimum delay between two request starts, in milliseconds. */
  minInterval?: number;
  /** Maximum number of in-flight requests. */
  concurrency?: number;
}

export class Throttle {
  private minInterval: number;

  private readonly concurrency: number;

  private active = 0;

  private lastStart = 0;

  private readonly waiting: Array<() => void> = [];

  constructor(options: ThrottleOptions = {}) {
    this.minInterval = Math.max(0, options.minInterval ?? 0);
    this.concurrency = Math.max(1, options.concurrency ?? 1);
  }

  /** Update the spacing at runtime (the preference may change). */
  setMinInterval(value: number): void {
    this.minInterval = Math.max(0, value);
  }

  get queueLength(): number {
    return this.waiting.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      const attempt = () => {
        if (this.active >= this.concurrency) {
          this.waiting.push(attempt);
          return;
        }
        const wait = Math.max(
          0,
          this.minInterval - (Date.now() - this.lastStart),
        );
        if (wait > 0) {
          setTimeout(attempt, wait);
          return;
        }
        this.active++;
        this.lastStart = Date.now();
        resolve();
      };
      attempt();
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiting.shift();
    if (next) setTimeout(next, 0);
  }
}

/** Sleep helper. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run `worker` over `items` with limited concurrency. */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.max(1, Math.min(concurrency, items.length)))
    .fill(0)
    .map(async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    });
  await Promise.all(runners);
  return results;
}
