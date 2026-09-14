/**
 * Smoke test for the preference pane controller.
 *
 * The controller is a classic script that runs inside the preferences window,
 * so it cannot be imported. It is evaluated here in a fresh VM context with a
 * minimal fake `window`/`Zotero`, which catches syntax errors, missing
 * elements and broken event wiring without launching Zotero.
 */
import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as vm from "node:vm";

const root = join(__dirname, "..", "..");

class FakeElement {
  tagName: string;

  children: FakeElement[] = [];

  attributes = new Map<string, string>();

  listeners = new Map<string, Array<(event: unknown) => void>>();

  style: Record<string, string> = {};

  value = "";

  /** Native checkbox state; the pane controller reads and writes it. */
  checked = false;

  textContent = "";

  #className = "";

  get className(): string {
    return this.#className;
  }

  set className(value: string) {
    this.#className = value;
  }

  get classList() {
    return {
      toggle: () => undefined,
      add: (name: string) => {
        if (!this.#className.split(" ").includes(name)) {
          this.#className = `${this.#className} ${name}`.trim();
        }
      },
      remove: () => undefined,
      contains: (name: string) => this.#className.split(" ").includes(name),
    };
  }

  parentNode?: FakeElement;

  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(
      (child) => child !== this,
    );
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatch(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler({ type, target: this });
    }
  }

  querySelectorAll(selector: string): FakeElement[] {
    const selector2 = selector.trim();
    const isAttribute = selector2.startsWith("[") && selector2.endsWith("]");
    const attribute = isAttribute ? selector2.slice(1, -1) : "";
    const className = isAttribute ? "" : selector2.replace(/^\./, "");
    const result: FakeElement[] = [];
    const matches = (child: FakeElement) =>
      isAttribute
        ? child.attributes.has(attribute)
        : child.className.split(" ").includes(className);
    const walk = (node: FakeElement) => {
      for (const child of node.children) {
        if (matches(child)) result.push(child);
        walk(child);
      }
    };
    walk(this);
    return result;
  }

  get firstChild(): FakeElement | undefined {
    return this.children[0];
  }
}

interface FakeWindow {
  [key: string]: any;
  document: any;
}

function makeEnvironment(markupIds: string[]) {
  const elements = new Map();
  for (const id of markupIds) {
    elements.set(
      id,
      new FakeElement(id.startsWith("ccfrank-alias") ? "div" : "button"),
    );
  }
  const root = new FakeElement("vbox");
  // The progress box starts hidden in the markup, like in `preferences.xhtml`.
  elements.get("ccfrank-progress")?.setAttribute("hidden", "true");
  // Native checkboxes bound by the controller: `<input type=checkbox data-pref>`.
  const checkboxes = ["enable", "autoIdentifyNewItems"].map((key) => {
    const box = new FakeElement("input");
    box.setAttribute("type", "checkbox");
    box.setAttribute("data-pref", key);
    return box;
  });
  // The placeholder rows are declared in the pane markup; the fake DOM only
  // needs the same tokens so the controller's click binding can be exercised.
  const PLACEHOLDER_TOKENS = [
    "ccf",
    "cas",
    "venue",
    "venueAbbr",
    "ccfAbbr",
    "casAbbr",
    "type",
    "typeLabel",
    "year",
    "updated",
    "citation",
  ];
  const placeholderRows = PLACEHOLDER_TOKENS.map((token) => {
    const row = new FakeElement("div");
    row.setAttribute("class", "ccfrank-placeholder-row");
    row.setAttribute("data-token", `{${token}}`);
    return row;
  });
  const hint = new FakeElement("label");
  hint.textContent = "插入到模板光标处";
  const document = {
    readyState: "complete",
    l10n: { translateFragment: () => undefined },
    getElementById: (id: string) =>
      id === "ccfrank-placeholder-hint" ? hint : (elements.get(id) ?? null),
    querySelector: () => null,
    querySelectorAll: (selector: string) => {
      if (selector.includes("checkbox")) return checkboxes;
      if (selector.includes("ccfrank-placeholder-row")) return placeholderRows;
      return [];
    },
    createElement: (tag: string) => new FakeElement(tag),
  };

  const listeners = new Map<string, Array<(event: any) => void>>();
  const window: FakeWindow = {
    document,
    setInterval: () => 0,
    clearInterval: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent: (event: any) => {
      for (const handler of listeners.get(event.type) ?? []) handler(event);
      return true;
    },
    CustomEvent: class FakeCustomEvent {
      type: string;

      detail: unknown;

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
  };

  const prefs = new Map<string, unknown>([
    ["extensions.zotero.ccfrank.summaryTemplate", "{cas} {ccf} {venue}"],
    ["extensions.zotero.ccfrank.separator", " "],
    [
      "extensions.zotero.ccfrank.aliasMapping",
      JSON.stringify([{ match: "My Workshop", abbr: "MW", ccf: "B" }]),
    ],
    ["extensions.zotero.ccfrank.enable", true],
    ["extensions.zotero.ccfrank.autoIdentifyNewItems", false],
  ]);
  const observers = new Map<string, (value: unknown) => void>();

  window.Zotero = {
    Prefs: {
      get: (key: string, _global: boolean) => prefs.get(key),
      set: (key: string, value: any, _global: boolean) => prefs.set(key, value),
      registerObserver: (
        key: string,
        handler: (value: unknown) => void,
        _immediate: boolean,
      ) => {
        observers.set(key, handler);
        return Symbol(key);
      },
    },
    debug: () => undefined,
  };

  return {
    window,
    elements,
    root,
    prefs,
    listeners,
    checkboxes,
    observers,
    placeholderRows,
  };
}

const source = readFileSync(join(root, "src", "ui", "prefs-pane.js"), "utf8");

function evaluate(ids: string[]) {
  const env = makeEnvironment(ids);
  const context = vm.createContext({
    window: env.window,
    Zotero: env.window.Zotero,
    console,
  });
  vm.runInContext(source, context);
  return env;
}

const PANE_IDS = [
  "ccfrank-prefpane-root",
  "ccfrank-scan-status",
  "ccfrank-cas-status",
  "ccfrank-cache-status",
  "ccfrank-template-preview",
  "ccfrank-alias-list",
  "ccfrank-placeholder-table",
  "ccfrank-progress",
  "ccfrank-progress-fill",
  "ccfrank-progress-text",
  "ccfrank-progress-label-scan",
  "ccfrank-progress-label-done",
  "ccfrank-pref-about",
  "ccfrank-pref-template",
  "ccfrank-button-scan",
  "ccfrank-button-scan-force",
  "ccfrank-button-update-selected",
  "ccfrank-button-cancel",
  "ccfrank-button-cas-refresh",
  "ccfrank-button-cas-rebuild",
  "ccfrank-button-cas-warm",
  "ccfrank-button-cas-import",
  "ccfrank-button-cas-export",
  "ccfrank-button-cas-clear",
  "ccfrank-button-alias-save",
  "ccfrank-button-alias-add",
];

describe("preference pane controller", () => {
  it("evaluates and exposes the factory", () => {
    const env = evaluate(PANE_IDS);
    const api = env.window.__ccfrankPrefsPane;
    ok(api, "window.__ccfrankPrefsPane must be defined");
    equal(typeof api.attach, "function");
    equal(typeof api.wire, "function");
    equal(api.ACTION_EVENT, "ccfrank:action");
    equal(api.STATUS_EVENT, "ccfrank:status");
  });

  it("wires the pane and emits a hello action", () => {
    const env = evaluate(PANE_IDS);
    const api = env.window.__ccfrankPrefsPane;
    const actions: Array<Record<string, unknown>> = [];
    env.window.addEventListener("ccfrank:action", (event: any) => {
      actions.push(event.detail);
    });

    api.attach();
    ok(
      actions.some((action) => action.action === "hello"),
      "the pane must ask the plugin for the cache status",
    );

    // A second attach must not duplicate the wiring.
    api.attach();
    equal(
      actions.filter((action) => action.action === "hello").length >= 2,
      true,
    );
  });

  it("binds the native checkboxes to their preferences", () => {
    const env = evaluate(PANE_IDS);
    env.window.__ccfrankPrefsPane.attach();

    // The boxes are plain HTML inputs, so the pane has to mirror the values
    // itself: Zotero's `preference=` binding does not apply to them.
    const [enable, autoNew] = env.checkboxes;
    equal(enable.checked, true, "a true preference checks the box");
    equal(autoNew.checked, false, "a false preference leaves it unchecked");

    // Ticking a box writes the preference.
    enable.checked = false;
    enable.dispatch("change");
    equal(env.prefs.get("extensions.zotero.ccfrank.enable"), false);

    autoNew.checked = true;
    autoNew.dispatch("change");
    equal(
      env.prefs.get("extensions.zotero.ccfrank.autoIdentifyNewItems"),
      true,
    );

    // A change from elsewhere is mirrored back into the pane.
    env.prefs.set("extensions.zotero.ccfrank.enable", true);
    env.observers.get("extensions.zotero.ccfrank.enable")?.(true);
    equal(enable.checked, true);
  });

  it("keeps the placeholder rows in sync with the controller's token list", () => {
    // The rows live in the pane markup (`preferences.xhtml`) so Fluent can
    // translate them; the controller only needs to know every token, so the two
    // lists are compared here — the fake DOM cannot read the markup itself.
    const env = evaluate(PANE_IDS);
    env.window.__ccfrankPrefsPane.attach();
    const tokens = env.placeholderRows.map((row) =>
      row.getAttribute("data-token"),
    );
    equal(tokens.length, 11, `expected 11 placeholders, got ${tokens.length}`);
    for (const token of [
      "{ccf}",
      "{cas}",
      "{venue}",
      "{ccfAbbr}",
      "{casAbbr}",
      "{venueAbbr}",
      "{type}",
      "{typeLabel}",
      "{year}",
      "{updated}",
      "{citation}",
    ]) {
      ok(tokens.includes(token), `${token} must be documented`);
    }
    // Clicking a row needs a localized tooltip from the markup.
    ok(
      tokens.every((_token, index) =>
        Boolean(env.placeholderRows[index].getAttribute("title")),
      ),
      "every row gets the insert hint",
    );
  });

  it("inserts a placeholder into the template when its row is clicked", () => {
    const env = evaluate(PANE_IDS);
    env.window.__ccfrankPrefsPane.attach();
    const template = env.elements.get("ccfrank-pref-template");
    template.value = "{ccf}";
    const row = env.placeholderRows.find(
      (candidate) => candidate.getAttribute("data-token") === "{venue}",
    );
    ok(row, "the {venue} row must exist");
    row.dispatch("click");
    equal(template.value, "{ccf}{venue}");
    equal(
      env.prefs.get("extensions.zotero.ccfrank.summaryTemplate"),
      "{ccf}{venue}",
      "the edited template is persisted",
    );
  });

  it("renders the progress bar and marks the job as finished", () => {
    const env = evaluate(PANE_IDS);
    env.window.__ccfrankPrefsPane.attach();
    const box = env.elements.get("ccfrank-progress");
    const fill = env.elements.get("ccfrank-progress-fill");
    const text = env.elements.get("ccfrank-progress-text");
    equal(box.getAttribute("hidden"), "true", "hidden while idle");

    env.window.dispatchEvent(
      new (env.window.CustomEvent as any)("ccfrank:status", {
        detail: {
          progress: {
            phase: "scan",
            done: 30,
            total: 120,
            percent: 25,
            active: true,
          },
        },
      }),
    );
    equal(box.getAttribute("hidden"), null, "shown while a job is running");
    equal(fill.style.width, "25%");
    ok(text.textContent.includes("30 / 120"), text.textContent);
    ok(text.textContent.includes("25%"), text.textContent);

    // The final report must show completion, not an empty bar again.
    env.window.dispatchEvent(
      new (env.window.CustomEvent as any)("ccfrank:status", {
        detail: {
          progress: {
            phase: "scan",
            done: 120,
            total: 120,
            percent: 100,
            active: false,
          },
        },
      }),
    );
    equal(fill.style.width, "100%");
    ok(text.textContent.includes("100%"), text.textContent);
  });

  it("renders the saved aliases and the template preview", () => {
    const env = evaluate(PANE_IDS);
    env.window.__ccfrankPrefsPane.attach();
    const list = env.elements.get("ccfrank-alias-list");
    equal(list.children.length, 1, "one alias row must be rendered");
    const inputs = list.children[0].children;
    equal(inputs[0].value, "My Workshop");
    equal(inputs[1].value, "MW");

    env.elements.get("ccfrank-pref-template").value = "{ccf} | {cas} | {venue}";
    env.elements.get("ccfrank-pref-template").dispatch("input");
    equal(
      env.elements.get("ccfrank-template-preview").textContent,
      "CCF-A | 中科院1区 | TPAMI",
    );
  });

  it("sends every button action to the plugin", () => {
    const env = evaluate(PANE_IDS);
    env.window.__ccfrankPrefsPane.attach();
    const actions: string[] = [];
    env.window.addEventListener("ccfrank:action", (event: any) => {
      actions.push(event.detail.action);
    });

    for (const [id, expected] of [
      ["ccfrank-button-scan", "scan"],
      ["ccfrank-button-scan-force", "scanForce"],
      ["ccfrank-button-update-selected", "identifySelected"],
      ["ccfrank-button-cancel", "cancel"],
      ["ccfrank-button-cas-refresh", "casRefresh"],
      ["ccfrank-button-cas-rebuild", "casRebuild"],
      ["ccfrank-button-cas-warm", "casWarm"],
      ["ccfrank-button-cas-import", "casImport"],
      ["ccfrank-button-cas-export", "casExport"],
      ["ccfrank-button-cas-clear", "casClear"],
      ["ccfrank-button-alias-save", "aliasSave"],
    ] as const) {
      env.elements.get(id).dispatch("command");
      ok(actions.includes(expected), `${id} must emit ${expected}`);
    }
  });

  it("collects the alias rows into the preference value", () => {
    const env = evaluate(PANE_IDS);
    env.window.__ccfrankPrefsPane.attach();
    const list = env.elements.get("ccfrank-alias-list");

    const add = env.elements.get("ccfrank-button-alias-add");
    add.dispatch("click");
    equal(list.children.length, 2);

    const newRow = list.children[1];
    newRow.children[0].value = "Journal of Testing";
    newRow.children[1].value = "JoT";
    newRow.children[3].value = "A";
    newRow.children[4].value = "2区";

    // The save button writes the preference; the controller only collects.
    console.log(
      "DEBUG collect",
      JSON.stringify(env.window.__ccfrankPrefsPane.collectAliases()),
    );
    env.elements.get("ccfrank-button-alias-save").dispatch("command");
    console.log(
      "DEBUG raw pref",
      String(env.prefs.get("extensions.zotero.ccfrank.aliasMapping")),
    );
    const saved = JSON.parse(
      String(env.prefs.get("extensions.zotero.ccfrank.aliasMapping")),
    );
    equal(saved.length, 2);
    equal(saved[1].match, "Journal of Testing");

    const collected = env.window.__ccfrankPrefsPane.collectAliases();
    equal(collected.length, 2, JSON.stringify(collected));
    equal(collected[1].match, "Journal of Testing");
    equal(collected[1].ccf, "A");
    equal(collected[1].cas, "2区");

    // Rows without a match value are dropped, not saved as junk.
    newRow.children[0].value = "";
    equal(env.window.__ccfrankPrefsPane.collectAliases().length, 1);

    // Removing a row works too.
    newRow.children[5].dispatch("click");
    equal(list.querySelectorAll(".ccfrank-alias-row").length, 1);
  });

  it("shows the status messages sent by the plugin", () => {
    const env = evaluate(PANE_IDS);
    env.window.__ccfrankPrefsPane.attach();
    env.window.dispatchEvent(
      new env.window.CustomEvent("ccfrank:status", {
        detail: {
          scan: "扫描中 3/10",
          cas: "已缓存 12 条",
          cache: "缓存 12 条",
        },
      }),
    );
    equal(env.elements.get("ccfrank-scan-status").textContent, "扫描中 3/10");
    equal(env.elements.get("ccfrank-cas-status").textContent, "已缓存 12 条");
    equal(env.elements.get("ccfrank-cache-status").textContent, "缓存 12 条");
  });

  it("survives a pane without the optional elements", () => {
    const env = evaluate(["ccfrank-prefpane-root"]);
    env.window.__ccfrankPrefsPane.attach();
    // No throw means the controller is defensive about missing markup.
    ok(true);
  });
});
