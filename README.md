# Zotero CCF Rank · Zotero CCF 分区助手

A Zotero plugin for computer-science literature. It identifies the **CCF rank**
and the **中科院分区 (CAS zone)** of a paper, writes the result into the item's
`Extra` field and shows a single-line summary in a dedicated column:

| Paper                         | Summary column          |
| ----------------------------- | ----------------------- |
| IEEE TPAMI                    | `中科院1区 CCF-A TPAMI` |
| NeurIPS                       | `CCF-A NeurIPS`         |
| an arXiv preprint             | `arXiv预印本`           |
| COLM (well known, not ranked) | `无分区 COLM`           |
| **Nature**                    | `Nature`                |
| **Nature Communications**     | `Nature子刊 NC`         |
| **Science Robotics**          | `Science子刊 SciRobot`  |

CCF does not rank Cell / Nature / Science, so those papers carry their own
**CNS flagship** attribute instead of a misleading `无分区` — see
[CNS flagship journals](#cns-flagship-journals-cell--nature--science).

Everything is optional and configurable from a real preference pane under
**Edit → Settings → CCF Rank** (中文：编辑 → 设置 → CCF 分区助手).

## Features

|                |                                                                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **自动识别**   | Newly added items are identified in the background; nothing to click.                                                                                                                                                               |
| **全库扫描**   | One button scans the whole library and fills in everything that is still missing, with progress and a cancel button.                                                                                                                |
| **CCF 分区**   | Matched through DBLP plus a bundled CCF catalog (678 venues), with an offline fallback that reads the item metadata directly.                                                                                                       |
| **中科院分区** | Harvested from LetPub, cached on disk, refreshed when it goes stale, and importable/exportable as JSON or CSV.                                                                                                                      |
| **分区汇总列** | One column with a format template you control (`{cas} {ccf} {top} {venue}`, …). `{cas}` disappears for conferences/preprints, so the line reads `CCF-A NeurIPS`. Optional separate CCF / CAS / citation columns.                    |
| **条目面板**   | The same summary shown as a row in the item pane.                                                                                                                                                                                   |
| **别名映射**   | When a venue cannot be recognized, add your own `name → abbr / full / CCF / CAS` mapping in the settings.                                                                                                                           |
| **CNS 顶刊**   | Cell / Nature / Science and their major sub-journals get a dedicated attribute, so a Nature paper reads `Nature子刊 NC` instead of `无分区`. The pay-to-publish long tail (Scientific Reports, PLOS ONE…) is deliberately excluded. |
| **可迁移**     | Existing `CCF Info & Citations` notes from the previous plugin version are read and migrated automatically.                                                                                                                         |

## Installation

1. Build (or download) `build/zotero-ccf-rank.xpi`.
2. In Zotero: **Tools → Add-ons → ⚙ → Install Add-on From File…** and pick the XPI.
3. Open **Edit → Settings → CCF Rank**.

> Zotero 9 no longer loads an XPI that is merely copied into the profile's
> `extensions` folder, so use the add-on dialog.

## How identification works

For every item the plugin combines two independent sources:

```
Zotero item ──┬─ metadata (publicationTitle / proceedingsTitle / conferenceName / ISSN / repository)
              ├─ DBLP lookup by title ──► CCF catalog  ──► CCF rank + venue
              └─ journal name/ISSN ─────► LetPub cache ──► 中科院分区
```

- **Venue matching is tolerant.** Names are normalized before comparison, so
  these all resolve to `CVPR`:

  ```
  CVPR
  IEEE/CVF Conference on Computer Vision and Pattern Recognition
  Proceedings of the 2024 IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)
  The 2024 IEEE/CVF Conference on Computer Vision and Pattern Recognition, Seattle, USA
  41st IEEE/CVF Conference on Computer Vision and Pattern Recognition
  ```

  Years, editions (`28th`, `Twenty-Eighth`), volume/issue numbers, locations and
  generic words (`Proceedings of the`, `International`, `Annual`, …) are removed;
  word order is ignored; abbreviations and their spelled-out initials are both
  accepted (`IEEE Trans. Pattern Anal. Mach. Intell.` → `TPAMI`).

- **A failure never blocks the other source.** If DBLP is down the item still
  gets the CAS zone, and vice versa.
- **arXiv / CoRR** records are reported as `arXiv预印本` and skip the CAS lookup.
- **Unknown venues** are reported as `无分区` (or `CCF-None COLM` for the curated
  well-known-but-unranked list); the venue name is kept when it is known.

### Where the data is stored

Results go into the item's `Extra` field, one key per line:

```
CCF-RANK: A
CCF-VENUE: TPAMI
VENUE-TYPE: journal
RANK-SOURCE: dblp
RANK-UPDATED: 2026-09-12
CAS-ZONE: 1区
CAS-VENUE: IEEE TRANSACTIONS ON PATTERN ANALYSIS AND MACHINE INTELLIGENCE
```

A CNS journal adds one more line, which is why the value stays searchable:

```
TOP-JOURNAL: nature:sub:NC:Nature Communications
```

That means the data is visible, searchable (`CCF-RANK: A` in Zotero's search
box), exportable and synced — no child notes are created, and the lines
belonging to other plugins are left untouched.

The journal cache lives in `<Zotero data directory>/ccf-rank/cache/cas-journals.json`.

## CNS flagship journals (Cell / Nature / Science)

CCF does not rank Cell, Nature or Science, so those papers used to render as
`中科院1区 无分区` — the second half being actively misleading. They now carry
their own attribute:

| Item                  | Summary line                            |
| --------------------- | --------------------------------------- |
| Nature Communications | `Nature子刊 NC`                         |
| Science Robotics      | `Science子刊 SciRobot`                  |
| Nature (main journal) | `Nature`                                |
| An ordinary journal   | unchanged, e.g. `中科院1区 CCF-A TPAMI` |

A CNS journal shows just the journal: the 中科院 zone is dropped because it adds
nothing next to a Nature paper, and `无分区` is dropped because CCF not ranking a
journal is not the same as it being unranked. Only those two placeholders go —
anything else in your template (a year, the citation count, a separator) still
prints.

- New `Extra` line `TOP-JOURNAL: family:kind:abbr:name`, e.g.
  `TOP-JOURNAL: nature:sub:NC:Nature Communications`.
- New template placeholder `{top}`; the default template is now
  `{cas} {ccf} {top} {venue}`. A template saved by an older version lacks it —
  click the `{top}` row in the settings page to insert it.
- When `{top}` is present, `无分区` is suppressed and a `{venue}` that merely
  repeats the abbreviation is dropped, so nothing is printed twice.
- Scope: the three main journals plus the major sub-journals a computer
  scientist would cite (Nature Communications is the lowest tier included).
  Scientific Reports, PLOS ONE and the rest of the long tail are deliberately
  **not** included — see `src/data/topJournals.ts`.
- Matching is by ISSN first, then by an exact normalized name, so
  "Nature" never swallows "Nature Precedings" and "Science" never swallows
  "Science of the Total Environment".
- Columns fall back to deriving the attribute from the metadata, so items
  identified before this change show it without a rescan.

## Preferences

| Section        | What you can change                                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 自动识别       | Enable the plugin, identify new items automatically, wait before querying a new item, skip already-identified items, and the scan buttons (scan / force re-identify / identify selection / cancel).                                                                                                                      |
| 分区汇总格式   | The template (`{cas}` `{ccf}` `{top}` `{venue}` `{venueAbbr}` `{ccfAbbr}` `{casAbbr}` `{type}` `{typeLabel}` `{year}` `{updated}` `{citation}`), the separator, `CCF-A` vs `A`, and the fallback texts (`无分区`, `arXiv预印本`, `无中科院分区`). Every placeholder is explained in the pane — click a row to insert it. |
| 列与条目面板   | Which columns exist, their titles, and whether the item pane row is shown.                                                                                                                                                                                                                                               |
| 数据来源与缓存 | DBLP endpoint, CAS lookups on/off, cache TTL, LetPub request interval, refresh / rebuild / prefetch / import / export / clear.                                                                                                                                                                                           |
| 自定义别名映射 | Your own name mappings.                                                                                                                                                                                                                                                                                                  |
| 写入与迁移     | Whether to delete the legacy note after migrating (the legacy note is always read).                                                                                                                                                                                                                                      |

## Development

```bash
corepack pnpm install
corepack pnpm run build        # type-check + build build/zotero-ccf-rank.xpi
corepack pnpm test             # unit tests (node:test)
corepack pnpm run lint         # prettier + eslint
corepack pnpm start            # zotero-plugin serve (live reload)
```

Layout:

```
src/data/ccfCatalog.ts        generated CCF catalog (678 venues)
src/data/topJournals.ts       CNS flagship catalog (Cell/Nature/Science + sub-journals)
src/modules/venue/            name normalization + catalog matching
src/modules/net/dblp.ts       DBLP client
src/modules/cas/              LetPub client, HTML parsing, on-disk cache
src/modules/record.ts         Extra-field record + legacy note migration
src/modules/identify.ts       one item -> one record
src/modules/manager.ts        queue, library scan, cache maintenance
src/modules/columns.ts        item tree columns (+ row-cache invalidation, see below)
src/modules/itemPane.ts       item pane row
src/modules/summary.ts        the summary template renderer
src/ui/preferencesPane.ts     preference pane registration + actions
src/ui/toolbar.ts             Tools-menu entries (scan, self-check, refresh column)
src/ui/selfCheck.ts           in-app diagnosis of the column pipeline
src/ui/prefs-pane.js          preference pane controller (classic script)
addon/                        manifest, prefs defaults, locales, pane markup
tools/                        data generators, tests helper scripts
```

### Zotero caches each row

Zotero builds every cell of a row once into `itemTree._rowCache[itemID]` and
serves it from there. A row read while the item still had no rank therefore keeps
rendering an empty cell however often it is invalidated, which is what "the
column stays empty after a scan" looked like. `refreshRow()` in
`src/modules/columns.ts` deletes that cache entry (`refreshAll()` resets the
whole cache) and `tests/refresh.test.ts` pins it down. **工具 → 刷新分区汇总列**
does the same on demand, and **工具 → 自检** reports which link of the chain is
broken.

Regenerating the catalog after editing the venue list:

```bash
node tools/generate-ccf-catalog.cjs
```

Runtime check inside a real Zotero. It uses a throwaway profile (Zotero 9 ignores
XPIs that are merely copied into a profile `extensions` folder, so the profile is
pre-seeded with the plugin plus a small harness extension that drives the
checks); the installed Zotero, the user's profile and the release XPI are never
modified:

```bash
pwsh tools/runtime-check.ps1 -SkipBuild
```

## Current verification status

- `tsc --noEmit`, `eslint`, `prettier --check` clean; `pnpm build` produces the XPI.
- 157 tests pass, covering name normalization, catalog matching, LetPub page
  parsing against a captured real page, the identification pipeline with a
  stubbed journal cache (backed by a real temporary directory), the Extra-field
  round-trip, summary templates, the preference-pane controller (evaluated in a
  VM), preference-pane registration, the menu entries, the manager's Zotero API
  usage and package consistency. `tools/check-pane.ps1` additionally validates
  the pane fragment (well-formedness, unique ids, pref bindings, locale keys).
- The DBLP worker and the LetPub search page have been fetched successfully.
- **Runtime verified inside Zotero 9.0.6** by `tools/runtime-check.ps1`, which
  assembles a throwaway profile from the real `build/addon` contents and drives
  the plugin through a probe extension. It reports:
  - the plugin starts and reaches `data.initialized`;
  - the preference pane loads: 12 checkboxes that really render (measured at
    14×14, not just counted), 13 buttons, 13 `preference` bindings, the pane
    controller attached, and the template preview rendering
    `中科院1区 CCF-A TPAMI`;
  - a checkbox round-trip proves the binding is live: ticking one writes the
    preference and unticking restores it;
  - all 11 template placeholders are documented in the pane with a translated
    explanation and a sample value;
  - a real button press reaches the plugin (`ccfrank:action` → `aliasSave`), and
    the preference observer that follows reloads the columns without
    duplicating them;
  - the Tools-menu and item-menu entries exist (scan, self-check, refresh
    column); the item toolbar is left alone;
  - the settings page shows a progress bar for running jobs (measured through the
    plugin's own `onProgress` callback, not just in a unit test);
  - both columns (`ccfRankSummary`, `ccfrankCitation`) and the item pane row
    (`ccfrank-summary-row`) are registered;
  - a full library scan runs to completion.
- The same check runs with the 13 plugins of a real profile installed alongside
  it (`-ExtraExtensions <folder of XPIs>`). That environment is much slower — the
  probe can be starved of time before it finishes — but the pane itself renders
  there too. It is how the empty preference pane was reproduced and fixed: the
  pane's `src` has to be an absolute `chrome://` URI, because a plugin-relative
  one resolves to `jar:file:///...xpi!/...`, which
  `Zotero.File.getContentsFromURL()` cannot read — the sidebar entry appears, the
  pane body stays empty and nothing is logged.

## Installation from a release (auto-update)

Download `zotero-ccf-rank.xpi` from the
[latest release](https://github.com/ZBigFish/zotero-ccf-rank/releases/latest)
and install it with **Tools → Add-ons → ⚙ → Install Add-on From File…**.

Once installed from a release, Zotero keeps the plugin up to date by itself. The
chain is:

```
manifest.json  update_url
   └─ https://github.com/ZBigFish/zotero-ccf-rank/releases/download/release/update.json   (fixed URL)
        └─ updates[0].update_link -> .../releases/download/v1.2.3/zotero-ccf-rank.xpi      (immutable asset)
        └─ updates[0].update_hash -> sha512 of that asset
```

The `update.json` URL never changes, so Zotero can always find the newest
version; the XPI itself lives under a version tag so a release can never be
overwritten by a later one. `tests/release.test.ts` pins both halves down.

> Measured facts, because they are easy to get wrong: Zotero compares the
> `version` in `update.json` with the installed one following Mozilla version
> ordering (so `1.1.0 > 1.0.10` is false — `1.0.10 < 1.1.0`), and it only
> updates over `https`. The manual `Check for Updates` in the add-on manager
> works too.
>
> Not verified here: the update has not been observed end to end, because that
> needs a published release. Verify it once after the first release by installing
> the previous version and pressing _Check for Updates_.

## Releasing

```bash
pnpm version patch          # or minor / major: bumps package.json and tags
git push --follow-tags      # the tag triggers .github/workflows/release.yml
```

The workflow runs the tests, builds the XPI, publishes a GitHub release for the
tag and refreshes the `release` tag that carries `update.json` /
`update-beta.json`. Nothing else is needed — `GITHUB_TOKEN` is provided by
Actions (a repository secret is not required).

## Publishing

Maintainers: see [doc/PUBLISHING.md](doc/PUBLISHING.md) for the repository setup,
the tag-and-release flow, how to verify auto-update once, and the entries to
submit to the Zotero plugin catalogs.

## Credits

- [TimeTrapzz](https://github.com/TimeTrapzz) — original
  [zotero-ccf-info](https://github.com/TimeTrapzz/zotero-ccf-info) plugin
- [tojunfeng](https://github.com/tojunfeng) — the original CCF matching core logic
- LetPub (letpub.com.cn) for the 中科院分区 data; please keep the request interval
  at a polite value.

## License

AGPL-3.0-or-later
