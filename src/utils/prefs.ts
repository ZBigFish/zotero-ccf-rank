import { config } from "../../package.json";

export type PrefKey = keyof _ZoteroTypes.Prefs["PluginPrefsMap"];

const FULL_PREFIX = config.prefsPrefix;

function fullKey(key: string): string {
  return `${FULL_PREFIX}.${key}`;
}

/**
 * Read a preference. Falls back to the value registered in `prefs.js` and to
 * the supplied default when the pref has never been written.
 */
export function getPref<K extends PrefKey>(
  key: K,
  fallback?: _ZoteroTypes.Prefs["PluginPrefsMap"][K],
): _ZoteroTypes.Prefs["PluginPrefsMap"][K] {
  const value = Zotero.Prefs.get(fullKey(key), true);
  if (value === undefined || value === null) {
    return fallback as _ZoteroTypes.Prefs["PluginPrefsMap"][K];
  }
  return value as _ZoteroTypes.Prefs["PluginPrefsMap"][K];
}

export function setPref<K extends PrefKey>(
  key: K,
  value: _ZoteroTypes.Prefs["PluginPrefsMap"][K],
): void {
  Zotero.Prefs.set(fullKey(key), value as never, true);
}

export function clearPref(key: PrefKey): void {
  Zotero.Prefs.clear(fullKey(key), true);
}

/** Register a callback fired whenever a preference of this plugin changes. */
export function observePrefs(callback: (key: string) => void): symbol {
  return Zotero.Prefs.registerObserver(
    FULL_PREFIX,
    (value: unknown, _pref: unknown, key?: string) => {
      const short = String(key ?? "").replace(`${FULL_PREFIX}.`, "");
      callback(short);
      void value;
    },
    true,
  );
}

export function unobservePrefs(symbol: symbol): void {
  try {
    Zotero.Prefs.unregisterObserver(symbol);
  } catch (_error) {
    // already gone
  }
}

/** Convenience reader used by the identification pipeline. */
export interface RuntimeOptions {
  enabled: boolean;
  autoIdentifyNewItems: boolean;
  newItemDelay: number;
  skipAlreadyIdentified: boolean;
  dblpEnabled: boolean;
  dblpEndpoint: string;
  casEnabled: boolean;
  casCacheTtlDays: number;
  casRequestInterval: number;

  deleteLegacyNoteAfterMigration: boolean;
  summaryTemplate: string;
  placeholderNoCcf: string;
  placeholderPreprint: string;
  placeholderNotApplicable: string;
  placeholderNoCas: string;
  ccfPrefix: boolean;
  separator: string;
  showItemPaneRow: boolean;
  aliasMapping: string;
}

export function readRuntimeOptions(): RuntimeOptions {
  return {
    enabled: getPref("enable", true),
    autoIdentifyNewItems: getPref("autoIdentifyNewItems", true),
    newItemDelay: Number(getPref("newItemDelay", 4000)) || 0,
    skipAlreadyIdentified: getPref("skipAlreadyIdentified", true),
    dblpEnabled: getPref("dblpEnabled", true),
    dblpEndpoint: String(getPref("dblpEndpoint", "") ?? ""),
    casEnabled: getPref("casEnabled", true),
    casCacheTtlDays: Number(getPref("casCacheTtlDays", 30)) || 0,
    casRequestInterval: Number(getPref("casRequestInterval", 2000)) || 0,

    deleteLegacyNoteAfterMigration: getPref(
      "deleteLegacyNoteAfterMigration",
      false,
    ),
    summaryTemplate: String(getPref("summaryTemplate", "") ?? ""),
    placeholderNoCcf: String(getPref("placeholderNoCcf", "") ?? ""),
    placeholderPreprint: String(getPref("placeholderPreprint", "") ?? ""),
    placeholderNotApplicable: String(
      getPref("placeholderNotApplicable", "") ?? "",
    ),
    placeholderNoCas: String(getPref("placeholderNoCas", "") ?? ""),
    ccfPrefix: getPref("ccfPrefix", true),
    separator: String(getPref("separator", " ") ?? " "),
    showItemPaneRow: getPref("showItemPaneRow", true),
    aliasMapping: String(getPref("aliasMapping", "[]") ?? "[]"),
  };
}
