/**
 * Test harness extension (not part of the plugin).
 *
 * `tools/runtime-check.ps1` installs this into a throwaway profile together
 * with the built plugin. This script waits for the main window, evaluates
 * `tests/zotero-harness/check.js` in it, runs the checks and writes the report
 * to the path in `${CCFRANK_REPORT}`.
 */
/* eslint-disable no-undef */
var CCFRankHarness = {
  report: null,
  lines: [],
  failures: 0,

  emit: async function (message) {
    var text = String(message);
    this.lines.push(text);
    dump("[ccfrank-harness] " + text + "\n");
    if (!this.report) return;
    try {
      await IOUtils.writeUTF8(this.report, this.lines.join("\n"));
    } catch (error) {
      dump("[ccfrank-harness] cannot write report: " + error + "\n");
    }
  },

  quit: function () {
    try {
      Components.classes["@mozilla.org/toolkit/app-startup;1"]
        .getService(Components.interfaces.nsIAppStartup)
        .quit(Components.interfaces.nsIAppStartup.eForceQuit);
    } catch (error) {
      dump("[ccfrank-harness] quit failed: " + error + "\n");
    }
  },

  run: async function () {
    try {
      this.report = Services.env.get("CCFRANK_REPORT");
    } catch (error) {
      this.report = null;
    }
    var checkPath = null;
    try {
      checkPath = Services.env.get("CCFRANK_CHECK");
    } catch (error) {
      checkPath = null;
    }

    await this.emit("harness.start");
    await this.emit("harness.report " + String(this.report));
    await this.emit("harness.check " + String(checkPath));

    if (!checkPath) {
      await this.emit("harness.no.check.path");
      this.quit();
      return;
    }

    // Wait for the main window and for the plugin to finish starting up.
    var win;
    for (var attempt = 0; attempt < 240; attempt++) {
      win = Zotero.getMainWindow();
      if (
        win &&
        Zotero.CCFRank &&
        Zotero.CCFRank.data &&
        Zotero.CCFRank.data.initialized
      ) {
        break;
      }
      await Zotero.Promise.delay(500);
    }
    var addon = Zotero.CCFRank;
    await this.emit("harness.window " + String(!!win));
    await this.emit(
      "harness.plugin " +
        String(!!addon) +
        " initialized=" +
        String(!!(addon && addon.data && addon.data.initialized)),
    );

    if (!win || !addon) {
      await this.emit("harness.abort");
      await this.emit("done ok");
      this.quit();
      return;
    }

    try {
      Services.scriptloader.loadSubScript(PathUtils.toFileURI(checkPath), win);
      await this.emit(
        "harness.check.loaded " + String(typeof win.CCFRankCheck),
      );
      var check = win.CCFRankCheck;
      if (!check) {
        await this.emit("harness.check.missing");
      } else {
        var originalRecord = check.record;
        check.record = function (message, details) {
          originalRecord.call(this, message, details);
          CCFRankHarness.lines.push(
            "check " + this.lines[this.lines.length - 1],
          );
        };
        await check.run({ reportPath: undefined });
        for (var i = 0; i < check.lines.length; i++) {
          this.lines.push("check " + check.lines[i]);
        }
        this.failures = check.failures;
        await this.emit("harness.failures " + String(check.failures));
      }
    } catch (error) {
      await this.emit(
        "harness.error " + String(error && error.stack ? error.stack : error),
      );
    }

    await this.emit("done ok");
    this.quit();
  },
};

CCRankHarness.run().catch(function (error) {
  dump("[ccfrank-harness] fatal " + error + "\n");
  try {
    Components.classes["@mozilla.org/toolkit/app-startup;1"]
      .getService(Components.interfaces.nsIAppStartup)
      .quit(Components.interfaces.nsIAppStartup.eForceQuit);
  } catch (quitError) {
    // give up
  }
});
