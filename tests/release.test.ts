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
import { execFileSync } from "node:child_process";
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
    // `zotero-plugin release` creates the tags *and* the releases, and fails
    // with `422 already_exists` when a release for a tag is already there. Three
    // attempts at this were wrong before it worked:
    //   - without any delete step, every re-run failed after the first success;
    //   - with the tag kept (`--cleanup-tag` missing), the scaffold failed with
    //     `Tag "v1.0.0" not found`;
    //   - with only `v<version>` cleared, the fixed `release` tag stayed on an
    //     older commit, so the manifest Zotero reads described a different XPI
    //     than the one published and its update_hash no longer matched.
    const workflow = read(".github/workflows/release.yml");
    const drop = workflow.indexOf("Drop the stale releases and tags");
    const create = workflow.indexOf("pnpm run release");
    ok(drop > 0, "a stale release must be dropped before creating a new one");
    ok(create > 0, "the scaffold still creates the release");
    ok(drop < create, "the delete step has to run before `pnpm run release`");

    const deleteStep = workflow.slice(drop, create);
    ok(
      deleteStep.includes('for tag in "$GITHUB_REF_NAME" release'),
      "both the version tag and the fixed `release` tag must be cleared",
    );
    ok(
      deleteStep.includes("--cleanup-tag"),
      "the tag has to go too, or the scaffold refuses to recreate it",
    );
    ok(
      deleteStep.includes("gh release view"),
      "clearing a tag that has no release yet must not fail the job",
    );
    ok(
      deleteStep.includes("git/refs/tags/$tag"),
      "the tag-only fallback needs the API, not `gh release delete`",
    );
    // The scaffold decides the tag target; make sure it ends up right.
    ok(
      workflow.includes("git/refs/tags/$GITHUB_REF_NAME"),
      "the version tag is re-pointed at the released commit afterwards",
    );
  });

  it("describes the release from the changelog", () => {
    const workflow = read(".github/workflows/release.yml");
    ok(
      workflow.includes("gh release edit") && workflow.includes("notes-file"),
      "the release body should come from CHANGELOG.md",
    );
    // An inline awk variant of this silently matched nothing on the first
    // release, so the body came out as a bare contributor list. The extraction
    // itself is exercised by the next test.
    ok(
      workflow.includes("tools/changelog-notes.sh"),
      "the notes come from the tested helper, not an inline one-liner",
    );
  });

  it("extracts release notes for a version, and falls back to Unreleased", () => {
    const script = join(root, "tools", "changelog-notes.sh");
    ok(existsSync(script), "tools/changelog-notes.sh must exist");

    // The script is POSIX shell; a bash is needed to run it. Git for Windows
    // ships one, and CI is Linux.
    const candidates = [
      "bash",
      "C:/Program Files/Git/bin/bash.exe",
      "C:/Program Files (x86)/Git/bin/bash.exe",
    ];
    let bash: string | undefined;
    for (const candidate of candidates) {
      try {
        execFileSync(candidate, ["--version"], { stdio: "ignore" });
        bash = candidate;
        break;
      } catch {
        // try the next one
      }
    }
    if (!bash) {
      ok(true, "no bash available, skipping the extraction check");
      return;
    }

    const run = (version: string) =>
      execFileSync(bash as string, [script, version], {
        cwd: root,
        encoding: "utf8",
      }).trim();

    const release = run(pkg.version);
    ok(release.length > 0, `no notes extracted for ${pkg.version}`);
    ok(/^### /m.test(release), "the section body should keep its sub-headings");

    // A version without its own entry still gets notes.
    const fallback = run("9.9.9-not-a-version");
    ok(fallback.length > 0, "the Unreleased fallback produced nothing");
    ok(
      !fallback.includes("9.9.9"),
      "the fallback must not leak the requested version",
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
