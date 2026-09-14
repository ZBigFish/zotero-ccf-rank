# Publishing checklist

Current state, verified on 2026-09-14:

| Thing                | Status                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| Repository           | <https://github.com/ZBigFish/zotero-ccf-rank> (public, squashed root commit) |
| Release              | `v1.0.0`, XPI attached, marked _Latest_                                      |
| Auto-update manifest | published under the fixed `release` tag                                      |
| Actions              | `GITHUB_TOKEN` with _Read and write_ (`default_workflow_permissions: write`) |
| Store entry          | PR <https://github.com/syt2/zotero-addons-scraper/pull/235>                  |

## Releasing a new version

```bash
git tag v1.0.1 && git push ccfrank v1.0.1
```

That is the whole procedure. `pnpm version patch` also works (it bumps
`package.json` and tags in one step — then `git push --follow-tags`).

Pushing a `v*` tag starts `.github/workflows/release.yml`, which runs the tests,
builds the XPI, clears the releases and tags left by an earlier run, publishes
`v<version>`, re-points the tag, and rewrites the release body from
`CHANGELOG.md`.

Add a `## [1.0.1]` section to `CHANGELOG.md` **before** tagging, or the notes fall
back to the `Unreleased` section.

### Why the workflow clears the tags first

`zotero-plugin release` creates both tags and fails with `422 already_exists` if a
release for the tag is already there. It manages two tags, and both have to be
cleared for a re-run to work:

- `v<version>` — carries the XPI,
- `release` — carries `update.json`, the **fixed** URL baked into the plugin.

Forgetting the second one leaves that manifest on an older commit, and then its
`update_hash` describes a different XPI than the one published: Zotero refuses the
update, silently. All three failure modes are pinned down by
`tests/release.test.ts`.

## Verify after every release

```bash
bash tools/verify-release.sh ZBigFish/zotero-ccf-rank
```

It walks the chain exactly as Zotero does — fixed manifest URL → `update.json` →
`update_link` → XPI → `update_hash` — and fails loudly on a mismatch.

> The scaffold writes the hash as **hex** (`sha512:<hex>`), while Mozilla's update
> schema examples show base64. Comparing against base64 makes a correct release
> look broken; that mistake cost an hour once. The script and this note exist
> because of it.

## Network: GitHub needs the local proxy

Direct connections to `github.com:443` time out on this machine; a proxy runs on
`127.0.0.1:7897` and GitHub works through it. Git is configured for it globally:

```bash
git config --global http.proxy http://127.0.0.1:7897   # already set
export HTTPS_PROXY=http://127.0.0.1:7897               # for gh and curl
```

The proxy has to be running for `git push`, `gh` and `tools/verify-release.sh`.

## One thing still to confirm by hand

The update path is verified as far as it can be without a second release: the
manifest resolves at the fixed URL and its hash matches the published XPI.

What is **not** yet observed is Zotero actually performing an update, which needs
a newer version to exist. To confirm it once:

1. install `v1.0.0` from the release page,
2. tag and push `v1.0.1`,
3. in Zotero: **Tools → Add-ons → ⚙ → Check for Updates**.

If the update appears, auto-update works for every future release.

## Store listings

| Destination                                                         | State                                                                                                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `syt2/zotero-addons-scraper` (feeds the Zotero Addons plugin store) | **PR opened**: [#235](https://github.com/syt2/zotero-addons-scraper/pull/235). Entries are one file `addons/{owner}@{repo}` holding optional tags. |
| `Zotero-Chinese/zotero-plugins`                                     | **Cannot be used**: its README states it no longer accepts plugin submissions and redirects to the scraper above.                                  |

The predecessor plugin is already listed in the scraper as
`TimeTrapzz@zotero-ccf-info`, so it keeps its own entry.

If the PR is not merged, the fallback is a short post with a screenshot and the
release link (知乎 / B站 / 小红书 / Zotero 中文社区论坛) — no gatekeeper, same
audience.
