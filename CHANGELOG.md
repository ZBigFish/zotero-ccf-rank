# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-14

First release of the rewritten plugin. The previous `zotero-ccf-info` released
`0.4.0`; this is a new plugin (new id `ccfrank@timetrapzz.site`) that can be
installed next to the old one and migrates its data on first use.

### Added

- **A real preference pane** under _Edit → Settings → CCF 分区助手_: every option
  is a bound control instead of an invisible background default.
- **Automatic identification of new items**, plus a whole-library scan with a
  progress bar and a cancel button.
- **CNS flagship attribute** for Cell / Nature / Science and their major
  sub-journals, so a Nature paper reads `Nature子刊 NC` instead of `无分区`.
  The pay-to-publish long tail (Scientific Reports, PLOS ONE, …) is deliberately
  excluded.
- **Summary row in the item pane** and four optional columns (summary, CCF, CAS,
  citation) with editable titles.
- **Custom format template** with twelve documented placeholders; the settings
  page explains each one and inserts it on click.
- **Alias mapping editor** for venues the automatic matcher cannot resolve.
- **中科院分区 cache** harvested from LetPub, stored on disk, refreshed when stale,
  and importable/exportable as JSON or CSV.
- **Tools menu**: scan the library, refresh the summary column, and a self-check
  that reports which link of the column pipeline is broken.

### Changed

- Results are written to the item's `Extra` field (`CCF-RANK:`, `CAS-ZONE:`, …)
  instead of a child note, so they are searchable, exportable and synced.
- Venue matching normalizes editions, years, volumes, locations, word order and
  abbreviations before comparing, which fixes the many `无分区` false negatives.

### Fixed

- The preference pane no longer renders empty: its `src` has to be an absolute
  `chrome://` URI, because a plugin-relative one resolves to
  `jar:file:///…xpi!/…`, which `Zotero.File.getContentsFromURL()` cannot read.
- Checkboxes are native HTML inputs; Zotero's XUL checkbox styling left the box
  itself invisible in a plugin pane.
- The summary column no longer stays empty after a scan: Zotero caches each
  row's cell text, so `refreshRow()` now drops that cache entry.
- `onStartup` is no longer re-entrant, which used to register the pane, notifier
  and columns several times over until the stack ran out.
- Changing a preference no longer rebuilds the whole item tree unless the change
  really affects which columns exist.
- Forced re-identification no longer wipes a correct rank with `无分区`.

[Unreleased]: https://github.com/ZBigFish/zotero-ccf-rank/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ZBigFish/zotero-ccf-rank/releases/tag/v1.0.0
