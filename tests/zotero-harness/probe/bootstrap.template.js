/* Test probe bootstrap (not part of the plugin).
 *
 * `tools/runtime-check.ps1` assembles the probe XPI from the real
 * `build/addon` directory, so the plugin code under test is byte-identical to
 * the shipped artifact. This bootstrap is the plugin's own `bootstrap.js` with
 * the probe controller added: it loads the bundle exactly once and starts the
 * plugin, so the probe observes a normal start-up rather than a second,
 * parallel one (loading the bundle twice left the add-on half-built).
 */
/* eslint-disable no-undef */
var CCFRankProbeChromeHandle;

function install() {}

function uninstall() {}

function shutdown() {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;

  if (!rootURI) {
    rootURI = resourceURI.spec;
  }

  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  CCFRankProbeChromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "ccfrank", rootURI + "chrome/content/"],
  ]);

  // The same global object the plugin's own bootstrap builds.
  var ctx = { rootURI: rootURI };
  ctx._globalThis = ctx;
  Services.scriptloader.loadSubScript(
    rootURI + "chrome/content/scripts/ccfrank.js",
    ctx,
  );

  // Load the probe controller before starting the plugin, so it is ready to
  // observe the start-up. `loadSubScript` evaluates the file in the given
  // scope, so the controller is read back from it (not from a global).
  var probeCtx = { rootURI: rootURI };
  probeCtx._globalThis = probeCtx;
  Services.scriptloader.loadSubScript(
    rootURI + "chrome/content/probe.js",
    probeCtx,
  );
  probeCtx.CCFRankProbe.startup(rootURI);

  // Start the plugin; the probe polls for `data.initialized`.
  Zotero.CCFRank.hooks.onStartup();
}

async function onMainWindowLoad({ window }, reason) {
  if (Zotero.CCFRank && Zotero.CCFRank.hooks) {
    Zotero.CCFRank.hooks.onMainWindowLoad(window);
  }
}

async function onMainWindowUnload({ window }, reason) {
  if (Zotero.CCFRank && Zotero.CCFRank.hooks) {
    Zotero.CCFRank.hooks.onMainWindowUnload(window);
  }
}
