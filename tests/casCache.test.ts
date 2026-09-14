import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import * as fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { join } from "node:path";

import { IdentifyManager } from "../src/modules/manager";
import type { CasJournalEntry } from "../src/modules/cas/types";

/**
 * The cache-warming job.
 *
 * It walks the whole library through `allItems()`, so it is also the path that
 * used to fail silently when the listing was done with a method Zotero's
 * libraries do not have.
 */

interface StubItem {
  id: number;
  libraryID: number;
  itemType: string;
  fields: Record<string, string>;
  getField(field: string): string;
  isRegularItem(): boolean;
  isNote(): boolean;
  isAttachment(): boolean;
  getNotes(): number[];
}

function makeItem(
  id: number,
  fields: Record<string, string>,
  itemType = "journalArticle",
): StubItem {
  return {
    id,
    libraryID: 1,
    itemType,
    fields,
    getField(field) {
      return this.fields[field] ?? "";
    },
    isRegularItem: () => true,
    isNote: () => false,
    isAttachment: () => false,
    getNotes: () => [],
  };
}

/**
 * A minimal `IOUtils` / `PathUtils` implementation backed by the real file
 * system, so the cache store exercises its production code path.
 */
function installFileGlobals(root: string) {
  (globalThis as any).PathUtils = {
    join: (...parts: string[]) => nodePath.join(...parts),
    parent: (value: string) => nodePath.dirname(value),
    profileDir: root,
  };
  (globalThis as any).IOUtils = {
    async makeDirectory(dir: string) {
      fs.mkdirSync(dir, { recursive: true });
    },
    async exists(target: string) {
      return fs.existsSync(target);
    },
    async readUTF8(target: string) {
      return fs.readFileSync(target, "utf8");
    },
    async writeUTF8(target: string, contents: string) {
      fs.mkdirSync(nodePath.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents, "utf8");
      return contents.length;
    },
    async move(source: string, destination: string) {
      fs.renameSync(source, destination);
    },
    async remove(target: string) {
      fs.rmSync(target, { force: true });
    },
  };
}

function installStub(items: StubItem[]) {
  const lookups: Array<{ name?: string; issn?: string }> = [];
  const entries = new Map<string, CasJournalEntry>();
  const dataDir = mkdtempSync(join(tmpdir(), "ccfrank-test-"));
  installFileGlobals(dataDir);

  (globalThis as any).Zotero = {
    Libraries: {
      userLibraryID: 1,
      getAll: () => [{ libraryID: 1, libraryType: "user" }],
      get: (id: number) =>
        id === 1 ? { libraryID: 1, libraryType: "user" } : false,
    },
    Items: {
      get: (id: number) => items.find((item) => item.id === id),
      getAll: async (libraryID: number) =>
        items.filter((item) => item.libraryID === libraryID),
    },
    Prefs: { get: () => undefined, set: () => undefined },
    Promise: { delay: (ms: number) => new Promise((r) => setTimeout(r, ms)) },
    getMainWindows: () => [],
  };
  (globalThis as any).ztoolkit = {
    log: () => undefined,
    getGlobal: (name: string) => (globalThis as any).Zotero[name],
    ProgressWindow: class {
      createLine() {
        return this;
      }

      show() {
        return this;
      }

      changeLine() {
        return this;
      }

      startCloseTimer() {
        return this;
      }
    },
  };
  (globalThis as any).addon = {
    data: {
      locale: {
        current: {
          formatMessagesSync: (entries2: Array<{ id: string }>) =>
            entries2.map((entry) => ({ value: entry.id })),
        },
      },
    },
  };

  return { lookups, entries, dataDir };
}

/** Remove the scratch data directory a test created. */
function cleanup(dataDir: string): void {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch (_error) {
    // best effort
  }
}

describe("CAS cache maintenance", () => {
  it("warms the cache for every distinct journal in the library", async () => {
    const items = [
      makeItem(1, { publicationTitle: "Journal A", ISSN: "1111-1111" }),
      makeItem(2, { publicationTitle: "Journal A", ISSN: "1111-1111" }),
      makeItem(3, { publicationTitle: "Journal B", ISSN: "2222-2222" }),
      makeItem(4, { publicationTitle: "", ISSN: "" }),
    ];
    const { dataDir } = installStub(items);
    const manager = new IdentifyManager();
    try {
      await manager.init();

      const lookups: string[] = [];
      const store = manager.casStore;
      ok(store, "the journal cache must load");
      // Replace the network client with a stub that always answers.
      (manager as unknown as { cas: unknown }).cas = {
        async lookup(query: { name?: string; issn?: string }) {
          lookups.push(query.name ?? "");
          return {
            status: "ok",
            hits: [],
            best: {
              issn: query.issn,
              name: query.name ?? "",
              zone: "2区",
              fetchedAt: Date.now(),
              origin: "letpub",
            } satisfies CasJournalEntry,
          };
        },
      };

      const filled = await manager.warmCasCache();
      equal(lookups.length, 2, "one look-up per distinct journal");
      equal(filled, 2, "both journals are cached");
      equal(store.size, 2);
    } finally {
      cleanup(dataDir);
    }
  });

  it("skips journals that are already cached and fresh", async () => {
    const items = [
      makeItem(1, { publicationTitle: "Journal A", ISSN: "1111-1111" }),
    ];
    const { dataDir } = installStub(items);
    const manager = new IdentifyManager();
    try {
      await manager.init();
      const store = manager.casStore;
      ok(store);
      store.put({
        issn: "1111-1111",
        name: "Journal A",
        zone: "1区",
        fetchedAt: Date.now(),
        origin: "letpub",
      });

      const lookups: string[] = [];
      (manager as unknown as { cas: unknown }).cas = {
        async lookup(query: { name?: string }) {
          lookups.push(query.name ?? "");
          return { status: "not-found", hits: [] };
        },
      };

      const filled = await manager.warmCasCache();
      equal(lookups.length, 0, "a fresh entry is not re-fetched");
      equal(filled, 0);
    } finally {
      cleanup(dataDir);
    }
  });
});
