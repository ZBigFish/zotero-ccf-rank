/**
 * The item tree columns.
 *
 *  - 分区汇总   one line combining the CAS zone, the CCF rank and the venue
 *  - CCF 分区   rank only (off by default)
 *  - 中科院分区 zone only (off by default)
 *  - 引用次数   citation count (on by default)
 *
 * Column labels can be overridden in the preferences; an empty preference
 * falls back to the localized default.
 */

import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref, readRuntimeOptions } from "../utils/prefs";
import {
  decodeTopJournal,
  encodeTopJournal,
  topJournalByIssn,
  topJournalByName,
} from "../data/topJournals";
import { RankRecord, parseRankRecord } from "./record";
import { renderSummary, RenderOptions } from "./summary";

export const COLUMN_KEYS = {
  summary: "ccfRankSummary",
  ccf: "ccfRankCcf",
  cas: "ccfRankCas",
  citation: "ccfRankCitation",
} as const;

type ColumnName = keyof typeof COLUMN_KEYS;

/** Options accepted by `Zotero.ItemTreeManager.registerColumn`. */
type ItemTreeCustomColumnOptions = Parameters<
  typeof Zotero.ItemTreeManager.registerColumn
>[0];

export function readRecordOf(item: Zotero.Item): RankRecord {
  try {
    return parseRankRecord((item.getField("extra") as string) ?? "");
  } catch (_error) {
    return {};
  }
}

function isPlainItem(item: Zotero.Item): boolean {
  try {
    if (!item || !item.itemTypeID) return false;
    if (item.isNote() || item.isAttachment()) return false;
    return item.isRegularItem();
  } catch (_error) {
    return false;
  }
}

/** Is the item an arXiv / preprint style record? */
export function itemIsPreprint(item: Zotero.Item, record: RankRecord): boolean {
  if (record.venueType === "preprint") return true;
  if (/^arxiv$/i.test(record.ccfVenue ?? "")) return true;
  try {
    const repository = (item.getField("repository") as string) ?? "";
    if (/arxiv|preprint|biorxiv|medrxiv|ssrn/i.test(repository)) return true;
    const publication = (item.getField("publicationTitle") as string) ?? "";
    return /^arxiv/i.test(publication);
  } catch (_error) {
    return false;
  }
}

export function buildRenderOptions(): RenderOptions {
  const options = readRuntimeOptions();
  return {
    noCcf: options.placeholderNoCcf,
    preprint: options.placeholderPreprint,
    notApplicable: options.placeholderNotApplicable,
    noCas: options.placeholderNoCas,
    ccfPrefix: options.ccfPrefix,
    separator: options.separator,
    typeLabels: {
      journal: getString("type-journal"),
      conference: getString("type-conference"),
      preprint: getString("type-preprint"),
      other: getString("type-other"),
    },
  };
}

/**
 * The full summary line shown by the 分区汇总 column.
 *
 * Items identified before a release that added new fields (the CNS attribute)
 * only carry the old `Extra` lines, so the missing parts are derived from the
 * metadata here. That keeps old libraries correct without forcing a rescan.
 */
export function summaryText(item: Zotero.Item): string {
  if (!isPlainItem(item)) return "";
  const record = readRecordOf(item);
  if (!record.topJournal) {
    const journal = topJournalForItem(item);
    if (journal) record.topJournal = encodeTopJournal(journal);
  }
  const options = readRuntimeOptions();
  let year = "";
  try {
    year =
      ((item.getField("date") as string) ?? "").match(/(19|20)\d{2}/)?.[0] ??
      "";
  } catch (_error) {
    year = "";
  }
  return renderSummary(record, options.summaryTemplate, buildRenderOptions(), {
    year,
    isPreprint: itemIsPreprint(item, record),
    notApplicable: record.ccf === "NotApplicable",
  });
}

/** CNS membership of an item, read from `Extra` or derived from the metadata. */
export function topJournalForItem(item: Zotero.Item) {
  const stored = decodeTopJournal(readRecordOf(item).topJournal);
  if (stored) return stored;
  let issn = "";
  let publication = "";
  try {
    issn =
      (item.getField("ISSN") as string) ??
      (item.getField("issn") as string) ??
      "";
    publication = (item.getField("publicationTitle") as string) ?? "";
  } catch (_error) {
    return undefined;
  }
  return topJournalByIssn(issn) ?? topJournalByName(publication);
}

/** CCF only. */
export function ccfText(item: Zotero.Item): string {
  if (!isPlainItem(item)) return "";
  const record = readRecordOf(item);
  const options = readRuntimeOptions();
  if (record.ccf === "NotApplicable") return options.placeholderNotApplicable;
  if (itemIsPreprint(item, record)) return options.placeholderPreprint;
  if (!record.ccf || record.ccf === "None") {
    // A CNS journal has no CCF rank because CCF does not rank it; that is not
    // the same as being unranked, so the family label is shown instead.
    const top = topJournalForItem(item);
    if (top) return topDisplay(top);
    return record.ccfVenue && record.ccfVenue !== "arXiv"
      ? options.placeholderNoCcf
      : "";
  }
  return options.ccfPrefix ? `CCF-${record.ccf}` : record.ccf;
}

/**
 * How a CNS journal is written: "Nature" for the main journals, and
 * "Nature子刊 NC" / "Science子刊 SciAdv" / "Cell子刊 NC" for the sub-journals.
 */
export function topDisplay(journal: {
  familyLabel: string;
  kind: string;
  abbr: string;
}): string {
  return journal.kind === "main"
    ? journal.abbr
    : `${journal.familyLabel}子刊 ${journal.abbr}`;
}

/** 中科院分区 only. */
export function casText(item: Zotero.Item): string {
  if (!isPlainItem(item)) return "";
  const record = readRecordOf(item);
  if (record.cas) return record.cas;
  // Not in the CAS list at all (a Nature sub-journal, say): the family label is
  // more useful in this column than an empty cell.
  const top = topJournalForItem(item);
  return top ? topDisplay(top) : "";
}

/** Citation count only. */
export function citationText(item: Zotero.Item): string {
  if (!isPlainItem(item)) return "";
  const record = readRecordOf(item);
  return record.citation ?? "";
}

/** Resolve the label of a column, honouring the preference override. */
export function columnLabel(
  prefKey:
    | "summaryColumnLabel"
    | "ccfColumnLabel"
    | "casColumnLabel"
    | "citationColumnLabel",
  fallback: string,
): string {
  const override = String(getPref(prefKey, "") ?? "").trim();
  return override || getString(fallback);
}

const COLUMN_DEFS: Record<
  ColumnName,
  {
    pref:
      | "showSummaryColumn"
      | "showCcfColumn"
      | "showCasColumn"
      | "showCitationColumn";
    labelPref:
      | "summaryColumnLabel"
      | "ccfColumnLabel"
      | "casColumnLabel"
      | "citationColumnLabel";
    labelString: string;
    provider: (item: Zotero.Item) => string;
  }
> = {
  summary: {
    pref: "showSummaryColumn",
    labelPref: "summaryColumnLabel",
    labelString: "column-summary",
    provider: summaryText,
  },
  ccf: {
    pref: "showCcfColumn",
    labelPref: "ccfColumnLabel",
    labelString: "column-ccf",
    provider: ccfText,
  },
  cas: {
    pref: "showCasColumn",
    labelPref: "casColumnLabel",
    labelString: "column-cas",
    provider: casText,
  },
  citation: {
    pref: "showCitationColumn",
    labelPref: "citationColumnLabel",
    labelString: "column-citation",
    provider: citationText,
  },
};

export class Columns {
  /** Registered (namespaced) data keys, needed to unregister later. */
  private registeredKeys: string[] = [];

  async register(): Promise<string[]> {
    if (this.registeredKeys.length > 0) return this.registeredKeys;
    const options: ItemTreeCustomColumnOptions[] = [];
    for (const name of Object.keys(COLUMN_DEFS) as ColumnName[]) {
      const def = COLUMN_DEFS[name];
      if (!getPref(def.pref, false)) continue;
      options.push({
        pluginID: config.addonID,
        dataKey: COLUMN_KEYS[name],
        label: columnLabel(def.labelPref, def.labelString),
        dataProvider: (item: Zotero.Item) => def.provider(item),
        zoteroPersist: ["width", "hidden", "sortDirection"],
      });
    }
    if (options.length === 0) return [];
    try {
      const keys = (await Zotero.ItemTreeManager.registerColumns(
        options,
      )) as Array<string | false>;
      this.registeredKeys = keys.filter((key): key is string => Boolean(key));
      return this.registeredKeys;
    } catch (error) {
      ztoolkit.log("registerColumns failed", error);
      return [];
    }
  }

  /**
   * Re-register the columns from scratch.
   *
   * The tree resolves a column through Zotero's own option cache, and a stale or
   * half-registered entry there renders an empty cell even though the item has
   * the data. Unregistering first makes the next `register()` rebuild it.
   */
  async repair(): Promise<string[]> {
    for (const key of this.registeredKeys) {
      try {
        Zotero.ItemTreeManager.unregisterColumn?.(key);
      } catch (_error) {
        // ignore: it may already be gone
      }
    }
    this.registeredKeys = [];
    const keys = await this.register();
    refreshAll();
    return keys;
  }

  /** Re-register after a preference change (labels or visibility). */
  async reload(): Promise<void> {
    for (const key of this.registeredKeys) {
      try {
        Zotero.ItemTreeManager.unregisterColumn?.(key);
      } catch (_error) {
        // ignore
      }
    }
    this.registeredKeys = [];
    await this.register();
    refreshAll();
  }
}

/**
 * Repaint one row.
 *
 * Clearing `_rowCache` is the part that matters. Zotero builds every cell's text
 * once per row into `itemTree._rowCache[itemID]` and serves it from there, so a
 * row that was read while the item had no rank keeps rendering an empty cell no
 * matter how often it is invalidated. Dropping that entry makes the next read
 * run the column's `dataProvider` again.
 *
 * This intentionally does *not* fire a `refresh` notifier event: `onNotify`
 * reacts to that event by calling this function, which would recurse until the
 * stack overflows.
 */
export function refreshRow(itemID: number): void {
  try {
    const windows = Zotero.getMainWindows?.() ?? [];
    for (const win of windows) {
      const itemsView = (win as any).ZoteroPane?.itemsView;
      if (!itemsView) continue;
      try {
        const cache = itemsView._rowCache;
        if (cache) delete cache[itemID];
      } catch (_error) {
        // A frozen cache is not fatal: `refreshAll` falls back to a full reset.
      }
      try {
        itemsView.tree?.invalidate?.();
        const rowIndex = itemsView.getRowIndexByID?.(String(itemID));
        if (typeof rowIndex === "number" && rowIndex >= 0) {
          itemsView.tree?.invalidateRow?.(rowIndex);
        }
      } catch (_error) {
        // The tree repaints on its own eventually.
      }
    }
  } catch (_error) {
    // Nothing to repaint.
  }
}

/** Ask every item tree to rebuild its rows and repaint. */
export function refreshAll(): void {
  try {
    Zotero.ItemTreeManager.refreshColumns?.();
  } catch (_error) {
    // ignore
  }
  try {
    const windows = Zotero.getMainWindows?.() ?? [];
    for (const win of windows) {
      const itemsView = (win as any).ZoteroPane?.itemsView;
      if (!itemsView) continue;
      try {
        itemsView._rowCache = {};
      } catch (_error) {
        // ignore
      }
      try {
        itemsView.tree?.invalidate?.();
      } catch (_error) {
        // ignore
      }
    }
  } catch (_error) {
    // ignore
  }
}
