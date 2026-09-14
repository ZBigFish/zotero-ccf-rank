# Publishing checklist

Everything in the repository is ready. What is left needs your GitHub account,
because it cannot be done from this machine (`gh` is not installed and there is
no stored GitHub credential).

## 1. Create the repository and push

The clone still points at the **old** plugin repository
(`TimeTrapzz/zotero-ccf-info.git`). This is a different plugin, so give it its
own repository — the name already matches what `package.json` and the update URL
expect:

<https://github.com/ZBigFish/zotero-ccf-rank>

```bash
# a new remote for the new project; the old `origin` is left untouched
git remote add ccfrank https://github.com/ZBigFish/zotero-ccf-rank.git
git push ccfrank main
```

> Do **not** push this to `zotero-ccf-info`: that repository belongs to the
> previous plugin, has its own release/tag history and its own users.

## 2. Turn on the pieces the plugin needs

In the new repository:

1. **Settings → Actions → General → Workflow permissions**: select
   _Read and write permissions_. The release job uploads assets, and the default
   read-only token would fail with a permission error.
2. Nothing else. `GITHUB_TOKEN` is provided by Actions; no repository secret is
   needed. (The previous workflow read `secrets.GitHub_TOKEN`, which does not
   exist — that is fixed and covered by `tests/release.test.ts`.)

## 3. Tag the first release

```bash
git tag v1.0.0
git push ccfrank v1.0.0
```

Pushing the tag starts `.github/workflows/release.yml`, which:

1. installs dependencies,
2. runs `pnpm test` (164 tests),
3. builds `build/zotero-ccf-rank.xpi`,
4. publishes a GitHub release for `v1.0.0` with the XPI attached,
5. refreshes the fixed `release` tag, which carries `update.json` and
   `update-beta.json`.

That last step is what makes Zotero auto-update work, so **check it after the
first run**:

```bash
curl -sL https://github.com/ZBigFish/zotero-ccf-rank/releases/download/release/update.json
```

It must contain `"version": "1.0.0"` and an `update_link` pointing at the
`v1.0.0` asset. If the `release` tag is missing, the release job did not finish —
read its log.

## 4. Verify the update path once

This is the only part of the release that has not been observed end to end,
because it needs a published release:

1. install `v1.0.0` from the release page,
2. bump something small and publish `v1.0.1` (`pnpm version patch` then
   `git push ccfrank main --follow-tags`),
3. in Zotero: **Tools → Add-ons → ⚙ → Check for Updates**.

If the update shows up, auto-update works from then on. If not, the two things
to check are the `release` tag (step 3) and that the URL in the installed
`manifest.json` matches it.

## 5. Getting listed where users actually look

Nothing below can be submitted from this machine. Two destinations matter, and
their current state is worth checking before you spend time on a form:

| Destination                     | Repository                                         | Notes                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zotero 中文社区插件合集         | <https://github.com/Zotero-Chinese/zotero-plugins> | The project README currently marks it **暂缓更新 / maintenance suspended**, so a new entry may sit unreviewed. Worth a look before investing effort.                               |
| Zotero Add-on Market (插件商店) | <https://github.com/syt2/zotero-addons>            | The market reads a generated catalog; the crawler behind it is <https://github.com/syt2/zotero-addons-scraper>. Check that repository for the current way a plugin gets picked up. |

I could not load either repository from this machine (GitHub fetches failed
here), so **verify the current submission process there instead of trusting the
table above**.

### A listing entry you can paste

Most catalogs of this kind take roughly this shape — adapt the field names to
whatever the destination asks for:

```json
{
  "name": "Zotero CCF Rank",
  "nameZh": "Zotero CCF 分区助手",
  "repo": "ZBigFish/zotero-ccf-rank",
  "release": "https://github.com/ZBigFish/zotero-ccf-rank/releases/latest/download/zotero-ccf-rank.xpi",
  "description": "Identify the CCF rank and the 中科院分区 of a paper, and show a one-line summary in a column.",
  "descriptionZh": "自动识别论文的 CCF 分区与中科院分区，在列表里显示一行汇总；Nature/Science/Cell 及其大子刊有独立的 CNS 顶刊属性。",
  "tags": ["ccf", "中科院分区", "分区", "期刊", "计算机"],
  "author": "TimeTrapzz",
  "homepage": "https://github.com/ZBigFish/zotero-ccf-rank",
  "license": "AGPL-3.0-or-later",
  "minZotero": "7.0"
}
```

### If no submission channel is open

A plugin商店 entry is usually how Chinese users find a plugin, but the fallback
that works today is a short post with a screenshot of the column and the direct
release link — 知乎, Bilibili, 小红书 and the Zotero 中文社区 forum all reach the
same audience, and every one of them accepts a self-post with no gatekeeper.
