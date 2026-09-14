/**
 * File helpers built on the `IOUtils` / `PathUtils` globals available inside
 * Zotero 7+.
 *
 * Writes go through a temporary file plus a rename, so a crash in the middle of
 * a write cannot corrupt the cache.
 */

export function getGlobal<T = any>(name: string): T | undefined {
  try {
    const viaToolkit = (globalThis as any).ztoolkit?.getGlobal?.(name);
    if (viaToolkit) return viaToolkit as T;
  } catch (_error) {
    // ignore and fall through to the sandbox global
  }
  return (globalThis as any)[name] as T | undefined;
}

function ioUtils(): any {
  const io = getGlobal<any>("IOUtils");
  if (!io) throw new Error("IOUtils is unavailable in this Zotero version");
  return io;
}

function pathUtils(): any {
  const paths = getGlobal<any>("PathUtils");
  if (!paths)
    throw new Error("PathUtils is unavailable in this Zotero version");
  return paths;
}

/** Join path segments with the platform separator. */
export function joinPath(...segments: string[]): string {
  const paths = pathUtils();
  if (typeof paths.join === "function") return paths.join(...segments);
  return segments.filter(Boolean).join("/");
}

/** Zotero data directory (e.g. `C:\Users\me\Zotero`). */
export function dataDirectory(): string {
  const zotero = getGlobal<any>("Zotero");
  const dir = zotero?.DataDirectory?.dir;
  if (typeof dir === "string" && dir) return dir;
  const profile = pathUtils().profileDir;
  return typeof profile === "string" && profile ? profile : ".";
}

/** Directory owned by this plugin, used for caches and exports. */
export function pluginDirectory(sub = "cache"): string {
  return joinPath(dataDirectory(), "ccf-rank", sub);
}

export async function ensureDirectory(path: string): Promise<void> {
  await ioUtils().makeDirectory(path, {
    ignoreExisting: true,
    createAncestors: true,
  });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    return await ioUtils().exists(path);
  } catch (_error) {
    return false;
  }
}

export async function readTextFile(path: string): Promise<string | undefined> {
  try {
    return await ioUtils().readUTF8(path);
  } catch (_error) {
    return undefined;
  }
}

export async function writeTextFile(
  path: string,
  contents: string,
): Promise<void> {
  const io = ioUtils();
  const parent = pathUtils().parent(path);
  if (parent) await ensureDirectory(parent);
  const tmp = `${path}.tmp`;
  await io.writeUTF8(tmp, contents);
  await io.move(tmp, path, { noOverwrite: false });
}

export async function removeFile(path: string): Promise<void> {
  try {
    await ioUtils().remove(path, { ignoreAbsent: true });
  } catch (_error) {
    // ignore
  }
}

/** Read and JSON.parse a file, returning undefined when missing/corrupt. */
export async function readJson<T>(path: string): Promise<T | undefined> {
  const text = await readTextFile(path);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    return undefined;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeTextFile(path, JSON.stringify(value, null, 2));
}
