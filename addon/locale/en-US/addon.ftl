# ---------------------------------------------------------------- general ----
get-ccf-info = Identify venue ranking
paper-info-update = Identifying venue ranking…
requesting-citations-multiple = Identifying the venue ranking of { $count } items…
requesting-citation-single = Identifying the venue ranking…
reidentify-selected = Re-identify venue ranking (ignore cache)

# ---------------------------------------------------------------- columns ----
column-summary = Rank Summary
column-ccf = CCF Rank
column-cas = CAS Zone
column-citation = Citations
item-row-label = Rank Summary
item-row-empty = Not identified yet

type-journal = Journal
type-conference = Conference
type-preprint = Preprint
type-other = Other

# ------------------------------------------------------------- scan / jobs ----
scan-progress-title = CCF Rank
scan-progress-line = Scanning library: { $done }/{ $total }
scan-finished = Scan finished, { $updated } of { $total } items updated
scan-cancelled = Scan cancelled
scan-started = Library scan started…
scan-already-running = A scan is already running
scan-need-selection = Select items in the library first
cas-refresh-title = Updating CAS journal data
cas-refresh-line = Querying journal zones: { $done }/{ $total }
cas-refresh-finished = Journal data updated, { $count } records refreshed
cas-clear-done = Cleared { $count } cached journal records
cas-import-done = Imported { $imported } records ({ $skipped } skipped)
cas-import-failed = Import failed: unrecognized file format
cas-export-done = Exported to { $path }
cas-export-empty = The local journal cache is empty
cas-warm-done = Fetched zones for { $count } journals used in your library
cas-rebuild-done = Rebuilt { $count } journal records
cas-store-empty = No local journal cache yet
alias-saved = Alias mapping saved

# -------------------------------------------------------------- preferences ----
pref-pane-title = CCF Rank
progress-scan = Scanning library
progress-identify = Identifying items
progress-cas = Refreshing CAS zones
progress-done = done
pref-basic-title = Automatic identification
pref-enable = Enable the plugin
pref-auto-new = Identify newly added items automatically
pref-skip-identified = Skip items that were already identified
pref-new-delay = Delay for new items
pref-new-delay-unit = ms
pref-button-scan = Scan library and fill gaps
pref-button-scan-force = Re-identify the whole library
pref-button-update-selected = Identify selected items
pref-button-cancel = Stop

pref-format-title = Summary format
pref-template = Template
pref-template-hint = Click any entry below to insert it at the cursor. Templates from an older version lack {top}; click it to add it.
pref-template-legend = Available placeholders (click to insert)
tmpl-insert-hint = Insert at the cursor
tmpl-ccf = The final CCF text, e.g. "CCF-A"; "无分区" when unknown, "arXiv预印本" for preprints
tmpl-cas = The final CAS zone text, e.g. "中科院1区"; left empty for conferences and preprints
tmpl-top = CNS flagship attribute: "Nature" / "Science" / "Cell" for the main journals, "Nature子刊 NC" for the major sub-journals, empty otherwise
tmpl-venue = Journal name or conference abbreviation, e.g. "TPAMI"; "arXiv" for preprints
tmpl-venue-abbr = Same value without substitution — always the raw name
tmpl-ccf-abbr = The rank letter only, e.g. "A" (without the "CCF-" prefix)
tmpl-cas-abbr = The zone only, e.g. "1区" (without the "中科院" prefix)
tmpl-type = Item type code: journal / conference / preprint / other
tmpl-type-label = Localized item type: 期刊 / 会议 / 预印本
tmpl-year = Publication year, e.g. "2024"
tmpl-updated = Date of the last identification, e.g. "2026-09-12"
tmpl-citation = Citation count, e.g. "128"
pref-separator = Separator
pref-ccf-prefix = Show "CCF-A" instead of just "A"
pref-no-ccf = When there is no CCF rank
pref-preprint = For preprints
pref-no-cas = When the CAS zone is unknown

pref-columns-title = Columns and item pane
pref-show-summary = Show the "Rank Summary" column
pref-summary-label = Summary column title
pref-show-ccf = Show the "CCF Rank" column
pref-ccf-label = CCF column title
pref-show-cas = Show the "CAS Zone" column
pref-cas-label = CAS column title
pref-show-citation = Show the "Citations" column
pref-citation-label = Citations column title
pref-show-item-pane = Show the summary in the item pane

pref-sources-title = Data sources and cache
pref-dblp = Query the CCF rank through DBLP
pref-dblp-endpoint = DBLP endpoint
pref-cas = Query the CAS zone through LetPub
pref-cas-ttl = Cached journal data is valid for
pref-cas-ttl-unit = days (0 = never refresh)
pref-cas-interval = Delay between LetPub requests
pref-cas-interval-unit = ms (2000 or more recommended)
pref-button-cas-refresh = Refresh stale entries
pref-button-cas-rebuild = Rebuild all journal data
pref-button-cas-warm = Prefetch library journals
pref-button-cas-import = Import journal data
pref-button-cas-export = Export journal data
pref-button-cas-clear = Clear cache

pref-alias-title = Custom alias mapping
pref-alias-hint = Add a mapping when a venue cannot be recognized automatically: the name as it appears in Zotero, plus the abbreviation, the full name, the CCF rank and the CAS zone. Matching ignores case, edition, year and location.
pref-alias-add = Add entry
pref-alias-save = Save alias mapping

pref-extra-title = Storage and migration
pref-delete-notes = Delete the legacy note after migrating

pref-about = { $name } { $version } · built { $time }

alias-column-match = Match
alias-column-abbr = Abbreviation
alias-column-full = Full name
alias-column-ccf = CCF
alias-column-cas = CAS zone
alias-none = CCF: none

# ---------------------------------------------------------------- menus ----
menu-scan-library = Scan library and fill in rankings
menu-self-check = Self-check: why is the column empty? (rebuilds it)
self-check-title = CCF Rank self-check
menu-refresh-column = Refresh the summary column (use when cells stay empty)
menu-refresh-column-done = Refreshed { $count } ranking column(s)
