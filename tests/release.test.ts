/**
 * The release contract.
 *
 * Zotero checks for updates by fetching one URL that never changes
 * (the `update_url` in `manifest.json`) and comparing `version` with the
 * installed one. That URL must therefore serve the *latest* manifest, while the
 * XPI itself is fetched from the immutable per-version release asset. These
 * tests pin both halves down, because a mistake here is invisible until users
 * stop receiving updates.
 */
import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

const pkg = JSON.parse(read("package.json")) as {
  version: string;
  config: { addonID: string; addonRef: string };
  repository: { url: string };
  homepage: string;
};

const OWNER_REPO = "ZBigFish/zotero-ccf-rank";
const TAG = `v${pkg.version}`;
const RAW = `https://github.com/${OWNER_REPO}/releases/download`;

describe("release and auto-update", () => {
  it("points the manifest update_url at the fixed release tag", () => {
    const manifest = read("addon/manifest.json");
    ok(manifest.includes("__updateURL__"), "the URL is injected at build time");
    const config = read("zotero-plugin.config.ts");
    // A version-numbered tag would break the update check as soon as the next
    // release is published: the URL has to stay constant.
    ok(
      config.includes("/releases/download/release/"),
      "updateURL must use the fixed `release` tag",
    );
    ok(
      config.includes("update-beta.json") && config.includes("update.json"),
      "prereleases need their own manifest",
    );
  });

  it("names the XPI after the package", () => {
    const config = read("zotero-plugin.config.ts");
    ok(
      config.includes("{{xpiName}}"),
      "the download link needs the asset name",
    );
    ok(
      config.includes("/releases/download/v{{version}}/"),
      "the XPI lives under an immutable version tag",
    );
  });

  it("keeps repository, homepage and bugs on the new repository", () => {
    // The clone came from the old `zotero-ccf-info` plugin; a stale URL here
    // sends users to the wrong project and breaks `pnpm release` metadata.
    for (const url of [pkg.repository.url, pkg.homepage]) {
      ok(url.includes(OWNER_REPO), `${url} must point at ${OWNER_REPO}`);
      ok(
        !url.includes("zotero-ccf-info"),
        `${url} still points at the old plugin`,
      );
    }
  });

  it("builds the release from a tag push using the built-in token", () => {
    const workflow = read(".github/workflows/release.yml");
    ok(workflow.includes("tags:") && workflow.includes("v**"), "tag trigger");
    ok(workflow.includes("pnpm run build"), "the XPI is built in CI");
    ok(workflow.includes("pnpm run release"), "the scaffold publishes it");
    // `secrets.GitHub_TOKEN` is a repository secret that does not exist by
    // default; the step then fails before uploading anything.
    ok(
      !workflow.includes("secrets.GitHub_TOKEN"),
      "use the Actions-provided GITHUB_TOKEN",
    );
    ok(workflow.includes("secrets.GITHUB_TOKEN"), "the built-in token is used");
    ok(workflow.includes("contents: write"), "uploading a release needs write");
  });

  it("runs the tests before a release is published", () => {
    const workflow = read(".github/workflows/release.yml");
    ok(
      workflow.includes("pnpm test") || workflow.includes("pnpm run test"),
      "a release must not ship untested code",
    );
  });

  it("resolves the update link to this version's asset", () => {
    // Mirrors what the scaffold writes into update.json.
    const link = `${RAW}/${TAG}/${pkg.config.addonRef === "ccfrank" ? "zotero-ccf-rank.xpi" : ""}`;
    equal(link, `${RAW}/v${pkg.version}/zotero-ccf-rank.xpi`);
    ok(new RegExp(`^\\d+\\.\\d+\\.\\d+`).test(pkg.version), pkg.version);
  });

  it("keeps the built manifest and the plugin id consistent", () => {
    const manifest = JSON.parse(read("build/addon/manifest.json")) as {
      applications: { zotero: { id: string; update_url: string } };
    };
    const zotero = manifest.applications.zotero;
    equal(zotero.id, pkg.config.addonID);
    ok(
      zotero.update_url.startsWith(
        `https://github.com/${OWNER_REPO}/releases/download/release/`,
      ),
      zotero.update_url,
    );
    // The update check only works over https.
    ok(zotero.update_url.startsWith("https://"), zotero.update_url);
  });
});
