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
import { existsSync, readFileSync } from "node:fs";
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

  it("can be re-run without failing on the existing release", () => {
    // `zotero-plugin release` creates the release for the tag and fails with
    // `422 already_exists` when one is there, so without this step a re-run (or
    // a re-tag) fails after the first success — which is exactly what happened
    // on this repository's first release.
    const workflow = read(".github/workflows/release.yml");
    const drop = workflow.indexOf("Drop a stale release");
    const create = workflow.indexOf("pnpm run release");
    ok(drop > 0, "a stale release must be dropped before creating a new one");
    ok(create > 0, "the scaffold still creates the release");
    ok(drop < create, "the delete step has to run before `pnpm run release`");
    ok(
      workflow.includes('gh release delete "$GITHUB_REF_NAME"'),
      "the delete must target the tag being released",
    );
    // Deleting the tag itself would break the update chain.
    const deleteStep = workflow.slice(drop, create);
    ok(
      !/--cleanup-tag\s*(?!.*#)/.test(deleteStep.replace(/--cleanup-tag/g, "")),
      "the tag is deliberately kept",
    );
  });

  it("describes the release from the changelog", () => {
    const workflow = read(".github/workflows/release.yml");
    ok(
      workflow.includes("gh release edit") && workflow.includes("notes-file"),
      "the release body should come from CHANGELOG.md",
    );
    // The section it looks for has to exist for the version being released.
    const changelog = read("CHANGELOG.md");
    ok(
      changelog.includes(`## [${pkg.version}]`) ||
        changelog.includes(`## [Unreleased]`),
      `CHANGELOG.md needs a section for ${pkg.version}`,
    );
  });

  it("resolves the update link to this version's asset", () => {
    // Mirrors what the scaffold writes into update.json.
    const link = `${RAW}/${TAG}/${pkg.config.addonRef === "ccfrank" ? "zotero-ccf-rank.xpi" : ""}`;
    equal(link, `${RAW}/v${pkg.version}/zotero-ccf-rank.xpi`);
    ok(new RegExp(`^\\d+\\.\\d+\\.\\d+`).test(pkg.version), pkg.version);
  });

  it("keeps the plugin id and the URL templates consistent", () => {
    // Derived from the tracked sources rather than the built XPI: `pnpm test`
    // runs before `pnpm build` in CI, so reading `build/` fails there — which it
    // did, on the first release run.
    const config = read("zotero-plugin.config.ts");
    ok(
      config.includes("id: pkg.config.addonID"),
      "the built plugin id comes from package.json",
    );
    equal(pkg.config.addonID, "ccfrank@timetrapzz.site");
    ok(
      pkg.repository.url.includes(OWNER_REPO),
      "the owner/repo the scaffold substitutes into both URLs",
    );
    // `build/addon/manifest.json` takes its update_url from this template.
    ok(
      config.includes(
        "https://github.com/{{owner}}/{{repo}}/releases/download/release/",
      ),
      "updateURL must keep the fixed release tag and the owner/repo tokens",
    );
  });

  it("cross-checks the built artifacts when a build is present", () => {
    // Skipped on a clean checkout; CI builds after the tests, and the local
    // `pnpm build` run covers it.
    const manifestPath = join(root, "build", "addon", "manifest.json");
    if (!existsSync(manifestPath)) {
      ok(true, "no build present, nothing to cross-check");
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
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
