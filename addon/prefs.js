/* eslint-disable no-undef */
// Default preference values.
// `__prefsPrefix__` is replaced with `extensions.zotero.ccfrank` at build time.
pref("__prefsPrefix__.enable", true);

// ---- Automatic identification ----
// Automatically identify newly added items.
pref("__prefsPrefix__.autoIdentifyNewItems", true);
// Delay (ms) before querying a newly added item, so Zotero can finish the import.
pref("__prefsPrefix__.newItemDelay", 4000);
// Only process newly added items whose rank summary is still empty.
pref("__prefsPrefix__.skipAlreadyIdentified", true);

// ---- Data sources ----
// Query CCF rank from DBLP (through the public worker endpoint).
pref("__prefsPrefix__.dblpEnabled", true);
// Endpoint used for DBLP lookups.
pref("__prefsPrefix__.dblpEndpoint", "https://dblp.timetrap.workers.dev/");
// Query the CAS (中科院) journal zone.
pref("__prefsPrefix__.casEnabled", true);
// Refresh a cached journal after this many days (0 = never refresh automatically).
pref("__prefsPrefix__.casCacheTtlDays", 30);
// Minimum delay (ms) between two LetPub requests.
pref("__prefsPrefix__.casRequestInterval", 2000);

// ---- Extra field record ----

// Delete the legacy child note after a successful migration.
pref("__prefsPrefix__.deleteLegacyNoteAfterMigration", false);

// ---- Columns ----
// Show the combined summary column.
pref("__prefsPrefix__.showSummaryColumn", true);
// Show the CCF rank only column.
pref("__prefsPrefix__.showCcfColumn", false);
// Show the CAS zone column.
pref("__prefsPrefix__.showCasColumn", false);
// Show the citation count column.
pref("__prefsPrefix__.showCitationColumn", true);
// Custom column labels (empty = localized default).
pref("__prefsPrefix__.summaryColumnLabel", "");
pref("__prefsPrefix__.ccfColumnLabel", "");
pref("__prefsPrefix__.casColumnLabel", "");
pref("__prefsPrefix__.citationColumnLabel", "");

// ---- Summary format ----
// Placeholders: {cas} {ccf} {top} {venue} {ccfAbbr} {casAbbr} {type} {year}
// {top} = "Nature" / "Science" / "Cell", or "Nature子刊 NC" for the
// major sub-journals (CNS family; empty for everything else).
pref("__prefsPrefix__.summaryTemplate", "{cas} {ccf} {top} {venue}");
// Text used when no CCF rank was found.
pref("__prefsPrefix__.placeholderNoCcf", "无分区");
// Text used for arXiv / CoRR preprints.
pref("__prefsPrefix__.placeholderPreprint", "arXiv预印本");
// Text used when the CCF rank is not applicable (e.g. a book or thesis).
pref("__prefsPrefix__.placeholderNotApplicable", "不适用");
// Text used when the CAS zone is unknown.
pref("__prefsPrefix__.placeholderNoCas", "无中科院分区");
// Whether to print "CCF-A" / "CCF-B" (true) or just "A" / "B" (false).
pref("__prefsPrefix__.ccfPrefix", true);
// Separator between the parts of the CCF block.
pref("__prefsPrefix__.separator", " ");

// ---- Item pane ----
// Show the summary row in the item info pane.
pref("__prefsPrefix__.showItemPaneRow", true);

// ---- Alias mapping (JSON) ----
// [{"match":"...","abbr":"...","full":"...","ccf":"A","cas":"1区"}]
pref("__prefsPrefix__.aliasMapping", "[]");
