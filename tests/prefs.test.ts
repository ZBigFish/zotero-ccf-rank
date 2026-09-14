import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import { getPref, observePrefs, readRuntimeOptions } from "../src/utils/prefs";

/**
 * Contract tests for the preference helpers.
 *
 * `Zotero.Prefs.registerObserver` is called with `global = true`, so the
 * observer receives the full preference name. The plugin's callback maps that
 * back to the short key, which is what the UI switches on.
 */
function installPrefsStub(values: Record<string, unknown> = {}) {
  const handlers: Array<(value: unknown, pref: unknown, key: string) => void> =
    [];
  const Zotero = {
    Prefs: {
      get: (key: string) => values[key],
      set: (key: string, value: unknown) => {
        values[key] = value;
      },
      clear: (key: string) => {
        delete values[key];
      },
      registerObserver: (
        _name: string,
        handler: (value: unknown, pref: unknown, key: string) => void,
        _global: boolean,
      ) => {
        handlers.push(handler);
        return Symbol("observer");
      },
      unregisterObserver: () => undefined,
    },
  };
  (globalThis as any).Zotero = Zotero;
  return { values, handlers };
}

describe("preference helpers", () => {
  it("reads a pref through the plugin prefix", () => {
    const { values } = installPrefsStub();
    getPref("summaryTemplate", "{cas} {ccf}");
    equal(values["extensions.zotero.ccfrank.summaryTemplate"], undefined);
    values["extensions.zotero.ccfrank.summaryTemplate"] = "{ccf}";
    equal(getPref("summaryTemplate"), "{ccf}");
  });

  it("falls back to the supplied default when unset", () => {
    installPrefsStub();
    equal(getPref("newItemDelay", 4000), 4000);
    equal(getPref("ccfPrefix", true), true);
  });

  it("reports the short preference key to the observer", () => {
    const { handlers } = installPrefsStub();
    const seen: string[] = [];
    observePrefs((key) => seen.push(key));
    equal(handlers.length, 1);
    // Zotero calls the observer with (value, pref, fullKey) for global observers.
    handlers[0](true, undefined, "extensions.zotero.ccfrank.showCcfColumn");
    handlers[0](false, undefined, "extensions.zotero.ccfrank.showCasColumn");
    equal(seen[0], "showCcfColumn");
    equal(seen[1], "showCasColumn");
  });

  it("exposes every runtime option the manager needs", () => {
    installPrefsStub({
      "extensions.zotero.ccfrank.enable": true,
      "extensions.zotero.ccfrank.newItemDelay": 1000,
      "extensions.zotero.ccfrank.casCacheTtlDays": 7,
      "extensions.zotero.ccfrank.casRequestInterval": 1500,
      "extensions.zotero.ccfrank.summaryTemplate": "{ccf}",
      "extensions.zotero.ccfrank.aliasMapping": "[]",
    });
    const options = readRuntimeOptions();
    equal(options.newItemDelay, 1000);
    equal(options.casCacheTtlDays, 7);
    equal(options.casRequestInterval, 1500);
    equal(options.summaryTemplate, "{ccf}");
    equal(options.aliasMapping, "[]");
    // The removed preferences must not come back through the runtime options.
    ok(!("casSkipPreprints" in options));
    ok(!("migrateLegacyNotes" in options));
  });
});
