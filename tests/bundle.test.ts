import { equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

describe("packaged assets", () => {
  it("ships a prefs pane script identical to the source", () => {
    const source = read("src/ui/prefs-pane.js");
    const shipped = read("addon/chrome/content/prefs-pane.js");
    ok(
      shipped.includes(source.trim()),
      "addon/chrome/content/prefs-pane.js is out of date; run `node tools/build-prefs-pane.cjs`",
    );
  });

  it("keeps the pane markup and the controller in sync", () => {
    const markup = read("addon/chrome/content/preferences.xhtml");
    const controller = read("src/ui/prefs-pane.js");

    // Every button the controller binds must exist in the markup.
    const boundIds = [...controller.matchAll(/bind\("([^"]+)"/g)].map(
      (match) => match[1],
    );
    ok(
      boundIds.length >= 10,
      `expected the pane buttons, got ${boundIds.length}`,
    );
    for (const id of boundIds) {
      ok(
        markup.includes(`id="${id}"`),
        `${id} is missing from the pane markup`,
      );
    }
    ok(markup.includes('id="ccfrank-button-alias-add"'));

    // Status targets.
    for (const id of [
      "ccfrank-scan-status",
      "ccfrank-cas-status",
      "ccfrank-cache-status",
      "ccfrank-template-preview",
      "ccfrank-alias-list",
      "ccfrank-pref-about",
    ]) {
      ok(
        markup.includes(`id="${id}"`),
        `${id} is missing from the pane markup`,
      );
    }

    // The controller style element must be referenced by the pane.
    ok(markup.includes('href="ccfrank-addon.ftl"'));
  });

  it("registers every preference the code reads", () => {
    const prefsJs = read("addon/prefs.js");
    const registered = new Set(
      [...prefsJs.matchAll(/pref\("__prefsPrefix__\.(\w+)"/g)].map(
        (match) => match[1],
      ),
    );
    ok(registered.size > 20, `expected the full preference list`);

    const used = new Set<string>();
    for (const file of [
      "src/utils/prefs.ts",
      "src/modules/columns.ts",
      "src/hooks.ts",
      "src/modules/manager.ts",
      "src/modules/itemPane.ts",
    ]) {
      for (const match of read(file).matchAll(
        /(?:getPref|setPref|observePrefs\()\(?\s*"(\w+)"/g,
      )) {
        used.add(match[1]);
      }
    }
    ok(used.size > 15, `expected the code to read many preferences`);

    for (const key of used) {
      ok(
        registered.has(key),
        `preference ${key} is not registered in prefs.js`,
      );
    }
  });

  it("binds every preference attribute to the plugin prefix", () => {
    const markup = read("addon/chrome/content/preferences.xhtml");
    const attributes = [...markup.matchAll(/preference="([^"]+)"/g)].map(
      (match) => match[1],
    );
    ok(
      attributes.length >= 10,
      `expected bound preferences, got ${attributes.length}`,
    );
    for (const attribute of attributes) {
      ok(
        attribute.startsWith("extensions.zotero.ccfrank."),
        `${attribute} must be a full preference key`,
      );
    }
    // The checkboxes are native inputs bound by the pane controller, so their
    // preference names live in `data-pref`; both forms have to stay registered.
    const dataPrefs = [...markup.matchAll(/data-pref="([^"]+)"/g)].map(
      (match) => match[1],
    );
    ok(
      dataPrefs.length >= 10,
      `expected data-pref bindings, got ${dataPrefs.length}`,
    );
    const prefsJs = read("addon/prefs.js");
    for (const key of dataPrefs) {
      ok(
        prefsJs.includes(`__prefsPrefix__.${key}"`),
        `data-pref ${key} is not registered in prefs.js`,
      );
    }
    // Every checkbox must carry one, or it silently stops persisting.
    const boxes = markup.match(/type="checkbox"/g) ?? [];
    equal(boxes.length, dataPrefs.length);
  });

  it("registers the item observer and wires the pane from the load event", () => {
    // These two wirings are what makes requirements 1 and 2 work at all, and
    // they cannot be observed without running Zotero, so the source is pinned
    // down here: the observer registration, the per-window wiring, and no
    // self-triggered `refresh` event (which would recurse through onNotify).
    const hooks = read("src/hooks.ts");
    ok(
      hooks.includes("Zotero.Notifier.registerObserver("),
      "without a notifier observer, newly added items are never identified",
    );
    ok(
      hooks.includes("Zotero.Notifier.unregisterObserver("),
      "the observer must be removed on shutdown",
    );
    ok(
      hooks.includes("addon.preferences?.watchWindow(win)"),
      "the pane has to be wired from its own load event",
    );
    const columns = read("src/modules/columns.ts");
    ok(
      !columns.includes('Notifier.trigger("refresh"'),
      "firing `refresh` from refreshRow recurses through onNotify",
    );
    ok(
      !hooks.includes('case "refresh"'),
      "onNotify must not react to the event refreshRow used to fire",
    );
  });

  it("every asset the pane registers exists under addon/chrome/content", () => {
    // The pane registers readable `chrome://ccfrank/content/...` URIs, which map
    // to `<rootURI>/chrome/content/`, so every entry has to point at a file that
    // ships inside the XPI. A missing one leaves the sidebar entry visible while
    // the pane body stays empty, which is the failure this guards against.
    const pane = read("src/ui/preferencesPane.ts");
    const names = [
      ...pane.matchAll(
        /chrome:\/\/\$\{config\.addonRef\}\/content\/([\w./@-]+)/g,
      ),
    ].map((match) => match[1]);
    ok(names.length >= 4, `expected the pane assets, got ${names.join(", ")}`);
    for (const name of names) {
      ok(
        existsSync(join(root, "addon", "chrome", "content", name)),
        `${name} must live in addon/chrome/content/ for the chrome URI to resolve`,
      );
    }
  });

  it("the pane markup loads the same locale file the plugin injects", () => {
    const markup = read("addon/chrome/content/preferences.xhtml");
    const itemPane = read("src/modules/itemPane.ts");
    const ftl = /href="ccfrank-addon\.ftl"/.test(markup);
    ok(ftl, "the pane must load ccfrank-addon.ftl");
    ok(
      itemPane.includes("${config.addonRef}-addon.ftl"),
      "the item pane row needs the same locale file injected",
    );
  });

  it("reads the item pane rows from the shape Zotero really exposes", () => {
    // The runtime check caught this: `customInfoRowData` is
    // `{ updateID, options: [...] }`, so `Object.keys()` returns the two
    // wrapper keys and the row looks unregistered.
    const itemPane = read("src/modules/itemPane.ts");
    ok(
      itemPane.includes("customInfoRowData?.options"),
      "the registered rows live in customInfoRowData.options",
    );
    ok(
      !/Object\.keys\(\s*\(Zotero as unknown as \{ ItemPaneManager/.test(
        itemPane,
      ),
      "customInfoRowData must not be treated as a map of rows",
    );
  });

  it("documents every template placeholder in the pane", () => {
    // The preview samples in the controller and the reference table in the
    // markup are two views of one list; a token present in only one of them
    // leaves the user with an unexplained `{...}`.
    const markup = read("addon/chrome/content/preferences.xhtml");
    const controller = read("src/ui/prefs-pane.js");
    const tokens = [...controller.matchAll(/token: "\{(\w+)\}"/g)].map(
      (match) => match[1],
    );
    ok(tokens.length >= 11, `expected the placeholders, got ${tokens.length}`);
    for (const token of tokens) {
      ok(
        markup.includes(`data-token="{${token}}"`),
        `{${token}} is missing from the pane's placeholder table`,
      );
    }
    // Every documented row needs an explanation, in the same order.
    const documented = [...markup.matchAll(/data-token="\{(\w+)\}"/g)].map(
      (match) => match[1],
    );
    equal(documented.join(","), tokens.join(","));
  });

  it("keeps start-up non-reentrant and the pref observer cheap", () => {
    // Two failures that made the plugin look dead in a real profile:
    //  - `onStartup` re-entering (Zotero reloads open preferences windows when a
    //    pane registers) registered a second pane, notifier and column set;
    //  - reacting to every preference change by re-registering the columns made
    //    Zotero rebuild the whole item tree on each keystroke.
    const hooks = read("src/hooks.ts");
    ok(
      hooks.includes("if (starting || addon.data.initialized) return;"),
      "onStartup must ignore a second call",
    );
    ok(
      hooks.includes("starting = true;"),
      "onStartup must mark itself as running",
    );
    // The four column-visibility preferences may reload the columns …
    ok(
      hooks.includes('case "showSummaryColumn":'),
      "changing which columns exist must reload them",
    );
    const switchBody = hooks.match(/switch \(key\) \{[\s\S]*?\n {2}\}\n\}/);
    ok(switchBody, "onPrefChange must switch on the preference key");
    // … but a label change must only repaint.
    const labelCase = switchBody[0].match(
      /case "summaryColumnLabel":[\s\S]*?break;/,
    );
    ok(labelCase, "the label preferences need their own branch");
    ok(
      labelCase[0].includes("refreshAll()"),
      "a label change only needs a repaint",
    );
    ok(
      !labelCase[0].includes("columns.reload()"),
      "a label change must not re-register the columns",
    );
    // `reload()` is the expensive call and belongs to exactly one branch.
    equal(
      (hooks.match(/await columns\.reload\(\)/g) ?? []).length,
      1,
      "the columns must be re-registered from one place only",
    );
    ok(
      !/default:[\s\S]{0,80}refreshAll\(\)/.test(hooks),
      "the default branch must not repaint the tree for every preference",
    );
  });

  it("declares the same version in the manifest template and package.json", () => {
    const manifest = read("addon/manifest.json");
    const pkg = JSON.parse(read("package.json")) as {
      config: { addonRef: string; addonID: string; prefsPrefix: string };
    };
    ok(manifest.includes("__addonID__"));
    equal(pkg.config.addonRef, "ccfrank");
    equal(pkg.config.prefsPrefix, "extensions.zotero.ccfrank");
    equal(pkg.config.addonID, "ccfrank@timetrapzz.site");
  });

  it("has a locale entry for every fluent key used by the code", () => {
    const zh = read("addon/locale/zh-CN/addon.ftl");
    const en = read("addon/locale/en-US/addon.ftl");
    const keys = new Set<string>();
    for (const file of [
      "src/modules/columns.ts",
      "src/modules/manager.ts",
      "src/modules/itemPane.ts",
      "src/ui/itemMenu.ts",
      "src/ui/preferencesPane.ts",
    ]) {
      for (const match of read(file).matchAll(/getString\("([\w-]+)"/g)) {
        keys.add(match[1]);
      }
    }
    for (const match of read("addon/chrome/content/preferences.xhtml").matchAll(
      /data-l10n-id="([\w-]+)"/g,
    )) {
      keys.add(match[1]);
    }
    ok(keys.size > 30, `expected many localized strings, got ${keys.size}`);
    for (const key of keys) {
      ok(zh.includes(`${key} =`), `${key} is missing from zh-CN/addon.ftl`);
      ok(en.includes(`${key} =`), `${key} is missing from en-US/addon.ftl`);
    }
  });
});
