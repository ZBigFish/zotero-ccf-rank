# Contributing

Thanks for looking at this plugin. Issues and pull requests are welcome — please
use [GitHub Issues](https://github.com/ZBigFish/zotero-ccf-rank/issues) and
write in English or Chinese.

## Getting started

```bash
corepack pnpm install
corepack pnpm start        # launches a Zotero with the plugin live-reloading
```

Node 22+ and pnpm 9 (through `corepack`) are what CI uses.

## Before you open a pull request

```bash
corepack pnpm run lint     # prettier --write + eslint --fix
corepack pnpm test         # 164 unit tests; the release/build contracts included
corepack pnpm run build    # tsc --noEmit + builds build/zotero-ccf-rank.xpi
```

All three must pass. `pnpm test` also validates the preference pane markup
(well-formedness, unique ids, `preference`/`data-pref` bindings and locale keys)
and asserts that `addon/chrome/content/prefs-pane.js` matches
`src/ui/prefs-pane.js`; run `node tools/build-prefs-pane.cjs` after editing the
pane controller.

## Testing against a real Zotero

Unit tests cover the pure logic. For anything that touches Zotero's UI or APIs,
`tools/runtime-check.ps1` boots a throwaway Zotero profile, installs the built
plugin together with a probe extension, drives it and writes a report:

```powershell
pwsh tools/runtime-check.ps1                        # build + verify
pwsh tools/runtime-check.ps1 -SkipBuild -Keep       # reuse the build, keep the profile
pwsh tools/runtime-check.ps1 -ExtraExtensions <dir>  # with other plugins installed
```

It never touches your own profile, data directory or the installed Zotero.

## Adding journals

- **CCF venues**: edit `tools/out/ccf-data.json` (or use
  `node tools/add-ccf-entry.cjs`) and run `node tools/generate-ccf-catalog.cjs`.
- **CNS flagship journals**: edit `src/data/topJournals.ts`. Add an ISSN for
  every entry — matching is ISSN-first, and the test suite rejects a journal
  without one, a duplicate abbreviation and a duplicate ISSN. Please keep the
  scope tight: the three main journals plus the sub-journals a computer scientist
  would actually cite. Adding Scientific Reports or similar would make the
  attribute meaningless, and `tests/topJournals.test.ts` guards that list.

## Data sources

- **CCF rank**: the DBLP-backed endpoint plus the bundled catalog.
- **中科院分区**: LetPub. The request interval is configurable and defaults to
  2 s — please keep it polite, and do not raise the request rate in a pull
  request.
