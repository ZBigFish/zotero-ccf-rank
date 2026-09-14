/**
 * Preference pane registration.
 *
 * `Zotero.PreferencePanes.register()` resolves relative URIs against the plugin
 * root and loads the pane's `src` as an XHTML fragment. The options object is
 * pinned here because a wrong `src` (or a `scripts` entry that is not inside the
 * XPI) leaves the entry visible in the sidebar while the pane body stays empty.
 */
import { equal, ok } from "node:assert/strict";
import { describe, it } from "node:test";

import { PreferencesPane } from "../src/ui/preferencesPane";

interface Registered {
  pluginID: string;
  id: string;
  src: string;
  scripts: string[];
  stylesheets: string[];
  label: string;
  image: string;
}

function installStubs() {
  const registered: Registered[] = [];
  const refreshed: string[] = [];
  const preferenceWindows: any[] = [];

  (globalThis as any).ztoolkit = {
    log: () => undefined,
    unregisterAll: () => undefined,
  };
  (globalThis as any).addon = {
    data: {
      locale: {
        current: {
          formatMessagesSync: (entries: Array<{ id: string }>) =>
            entries.map((entry) => ({ value: entry.id })),
        },
      },
    },
    dataReady: true,
  };
  (globalThis as any).Zotero = {
    PreferencePanes: {
      register: async (options: Registered) => {
        registered.push(options);
        return options.id;
      },
      unregister: (id: string) => refreshed.push(id),
    },
    getMainWindows: () => [],
    Plugins: { resolveURI: (_id: string, uri: string) => uri },
  };
  (globalThis as any).Services = {
    wm: {
      getEnumerator: () => {
        let index = 0;
        return {
          hasMoreElements: () => index < preferenceWindows.length,
          getNext: () => preferenceWindows[index++],
        };
      },
    },
  };

  return { registered, refreshed, preferenceWindows };
}

function makeManager() {
  return {
    isScanning: false,
    casStore: undefined,
    async init() {
      return {
        size: 0,
        updatedAt: 0,
        clear: async () => 0,
        toJSON: () => ({}),
      };
    },
    reloadOptions: () => undefined,
  };
}

function makeWindow(controller: unknown) {
  const listeners = new Map<string, Array<(event: any) => void>>();
  // Minimal stand-in for the pane root; `attachController` inserts a diagnostic
  // description into it when the pane script never loaded.
  const root: any = {
    id: "ccfrank-prefpane-root",
    children: [] as any[],
    firstChild: null,
    insertBefore: (child: any) => {
      root.children.unshift(child);
      root.firstChild = child;
    },
  };
  const elements = new Map<string, any>([["ccfrank-prefpane-root", root]]);
  const timers: Array<() => void> = [];
  const win: any = {
    __ccfrankPrefsPane: controller,
    __registrations: [] as string[],
    __timers: timers,
    setTimeout: (handler: () => void) => {
      timers.push(handler);
      return timers.length;
    },
    runTimers: () => {
      for (const handler of timers.splice(0)) handler();
    },
    document: {
      getElementById: (id: string) => elements.get(id) ?? null,
      createXULElement: (tagName: string) => {
        const element: any = {
          tagName: tagName.toUpperCase(),
          attributes: new Map<string, string>(),
          setAttribute(name: string, value: string) {
            this.attributes.set(name, value);
          },
          getAttribute(name: string) {
            return this.attributes.get(name) ?? null;
          },
          textContent: "",
        };
        elements.set("", element);
        return element;
      },
    },
    addEventListener: (type: string, handler: (event: any) => void) => {
      win.__registrations.push(type);
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent: (event: any) => {
      for (const handler of listeners.get(event.type) ?? []) handler(event);
      return true;
    },
    CustomEvent: class {
      type: string;

      detail: unknown;

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
  };
  return { win, root };
}

describe("preference pane registration", () => {
  it("registers the pane with readable chrome URIs", async () => {
    const stubs = installStubs();
    const pane = new PreferencesPane({ manager: makeManager() as never });

    const okResult = await pane.register();

    equal(okResult, true);
    equal(stubs.registered.length, 1);
    const options = stubs.registered[0];
    equal(options.pluginID, "ccfrank@timetrapzz.site");
    equal(options.id, "ccfrank-prefpane");
    // Zotero resolves a relative URI against the plugin root, which inside an
    // XPI becomes `jar:file:///...xpi!/chrome/content/...`; the pane fragment is
    // read with `Zotero.File.getContentsFromURL()`, which cannot open that, so
    // the pane stays empty. The registered chrome mapping is readable.
    equal(options.src, "chrome://ccfrank/content/preferences.xhtml");
    equal(options.scripts.length, 1);
    equal(options.scripts[0], "chrome://ccfrank/content/prefs-pane.js");
    equal(options.stylesheets.length, 1);
    equal(options.stylesheets[0], "chrome://ccfrank/content/preferences.css");
    equal(options.image, "chrome://ccfrank/content/icons/favicon@0.5x.png");
    for (const uri of [
      options.src,
      options.scripts[0],
      options.stylesheets[0],
    ]) {
      ok(uri.startsWith("chrome://ccfrank/content/"), uri);
      ok(!uri.startsWith("chrome/content/"), `relative URI left: ${uri}`);
    }
  });

  it("wires the pane controller when the pane loads", async () => {
    installStubs();
    const pane = new PreferencesPane({ manager: makeManager() as never });
    await pane.register();

    let attached = 0;
    const { win } = makeWindow({
      attach: () => {
        attached += 1;
      },
      emit: () => undefined,
    });

    pane.watchWindow(win as never);
    equal(attached, 1);
    // Re-wiring the same window must not double-attach.
    pane.watchWindow(win as never);
    equal(attached, 1);

    const actions: string[] = [];
    const deps = pane as unknown as {
      deps: { onAliasesChanged?: () => void; onCacheChanged?: () => void };
    };
    deps.deps.onAliasesChanged = () => actions.push("aliases");
    deps.deps.onCacheChanged = () => actions.push("cache");
    win.dispatchEvent(
      new (win.CustomEvent as any)("ccfrank:action", {
        detail: { action: "aliasSave" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    equal(actions.join(","), "aliases");
  });

  it("never schedules work on a preferences window it does not own", async () => {
    installStubs();
    const pane = new PreferencesPane({ manager: makeManager() as never });
    await pane.register();

    // Zotero reloads the preferences window when a plugin registers a pane, so a
    // timer that later touches that window throws inside Zotero's settings.
    // Wiring must stay synchronous: attach the controller and stop.
    const { win, root } = makeWindow(undefined);
    pane.watchWindow(win as never);
    equal(
      (win as any).__timers.length,
      0,
      "no timer may be scheduled on the preferences window",
    );
    equal(root.children.length, 0, "no DOM write from a dead window");
  });

  it("attaches to preference windows that are already open", async () => {
    const stubs = installStubs();
    const pane = new PreferencesPane({ manager: makeManager() as never });
    await pane.register();

    let attached = 0;
    const { win } = makeWindow({
      attach: () => {
        attached += 1;
      },
    });
    stubs.preferenceWindows.push(win as never);

    pane.watchWindows();
    equal(attached, 1);
  });
});
