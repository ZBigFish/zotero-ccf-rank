/* eslint-disable no-undef */
/**
 * Test probe addon (not part of the plugin).
 *
 * `tools/runtime-check.ps1` builds this XPI from the real `build/addon`
 * directory plus this file, so the code under test is byte-identical to the
 * shipped artifact. The probe XPI's `bootstrap.js` starts the plugin exactly
 * like the plugin's own bootstrap does; this controller only observes: it waits
 * for the add-on, opens the preferences window on the plugin's pane and records
 * what happened.
 */
var CCFRankProbe = {
  lines: [],
  report: "",

  emit: async function (message) {
    var text = String(message);
    this.lines.push(text);
    dump("[ccfrank-probe] " + text + "\n");
    if (!this.report) return;
    try {
      await IOUtils.writeUTF8(this.report, this.lines.join("\n"));
    } catch (error) {
      dump("[ccfrank-probe] cannot write the report: " + error + "\n");
    }
  },

  waitForUi: async function (timeoutMs) {
    var deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (Zotero.getMainWindow()) return true;
      await Zotero.Promise.delay(500);
    }
    return false;
  },

  waitForPlugin: async function (timeoutMs) {
    var deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      var addon = Zotero.CCFRank;
      if (addon && addon.data && addon.data.initialized) return true;
      await Zotero.Promise.delay(500);
    }
    return false;
  },

  /**
   * @param {string} rootURI - the root URI the plugin code is loaded from
   */
  run: async function (rootURI) {
    this.report = Services.env.get("CCFRANK_PROBE_REPORT") || "";
    await this.emit("probe.start");

    await this.waitForUi(120000);
    await this.emit("probe.uiReady");

    // The plugin is started by this XPI's bootstrap. A brand-new profile does
    // not start extensions until its database exists, so the first of two runs
    // legitimately ends here.
    var started = await this.waitForPlugin(60000);
    await this.emit("probe.pluginInitialized " + String(started));
    if (!started) {
      await this.finish();
      return;
    }

    var panes = [];
    try {
      panes = (Zotero.PreferencePanes.pluginPanes || []).filter(
        function (pane) {
          return pane.pluginID === "ccfrank@timetrapzz.site";
        },
      );
    } catch (error) {
      await this.emit("probe.paneLookupFailed " + String(error));
    }
    await this.emit("probe.paneCount " + String(panes.length));
    if (panes.length) {
      await this.emit("probe.paneId " + panes[0].id);
      await this.emit("probe.paneSrc " + panes[0].src);
    }
    // Read the live registrations *before* opening a window: this is what tells
    // "the plugin never registered anything" apart from "the pane is broken".
    try {
      var custom = await Zotero.ItemTreeManager.getCustomColumns();
      await this.emit(
        "probe.columnsBefore " +
          JSON.stringify(
            (custom || [])
              .filter(function (column) {
                return column.pluginID === "ccfrank@timetrapzz.site";
              })
              .map(function (column) {
                return column.dataKey;
              }),
          ),
      );
    } catch (error) {
      await this.emit("probe.columnsBeforeFailed " + String(error));
    }
    try {
      await this.emit(
        "probe.toolsMenuItemBefore " +
          String(
            !!Zotero.getMainWindow().document.getElementById(
              "ccfrank-tools-scan",
            ),
          ),
      );
    } catch (error) {
      await this.emit("probe.toolsMenuItemBeforeFailed " + String(error));
    }

    // Opening the preferences window wedges this harness (Zotero builds it
    // synchronously inside `openDialog()` and the probe's promise never
    // settles), so the pane checks are opt-in and the rest of the run — the
    // columns, the cell data and the identify pass — still happens.
    if (Services.env.get("CCFRANK_PROBE_NO_PANE") === "1") {
      await this.emit("probe.paneSkipped true");
      await this.checkIdentify();
      await this.finish();
      return;
    }

    var win;
    try {
      // Opens the window on a later turn: Zotero's preferences window is built
      // synchronously inside `openDialog()`, so opening it from here competes
      // with the plugin's own start-up work.
      win = await new Promise(function (resolve) {
        Services.tm.dispatchToMainThread(function () {
          try {
            resolve(
              Zotero.Utilities.Internal.openPreferences("ccfrank-prefpane"),
            );
          } catch (error) {
            dump("[ccfrank-probe] openPreferences threw: " + error + "\n");
            resolve(null);
          }
        });
      });
      await this.emit("probe.openPreferences " + String(!!win));
    } catch (error) {
      await this.emit("probe.openFailed " + String(error));
      await this.finish();
      return;
    }
    if (!win) {
      await this.emit("probe.noPrefWindow");
      await this.finish();
      return;
    }
    // Reading anything from a chrome window while it is still being built throws
    // NS_ERROR_NOT_AVAILABLE, so every access is guarded and separated.
    for (var settle = 1; settle <= 6; settle++) {
      await Zotero.Promise.delay(1000);
      try {
        await this.emit(
          "probe.prefAlive " +
            settle +
            " " +
            JSON.stringify({
              closed: !!win.closed,
              href: win.location ? String(win.location.href) : "?",
              panes: win.document.querySelectorAll(".pane-container").length,
            }),
        );
      } catch (error) {
        await this.emit(
          "probe.prefAlive " + settle + " threw " + String(error),
        );
      }
    }
    try {
      await this.emit(
        "probe.prefWindow " +
          JSON.stringify(
            win && win.location ? String(win.location.href) : "(no location)",
          ),
      );
    } catch (error) {
      await this.emit("probe.prefWindowFailed " + String(error));
    }
    // The pane fragment is read and parsed inside a promise chain that Zotero
    // never catches, so a failure there is silent. Listen for it instead.
    try {
      win.addEventListener("error", function (event) {
        void CCFRankProbe.emit(
          "probe.prefError " +
            JSON.stringify(String((event && event.message) || event)),
        );
      });
      win.addEventListener("unhandledrejection", function (event) {
        void CCFRankProbe.emit(
          "probe.prefRejection " +
            JSON.stringify(String((event && event.reason) || event)),
        );
      });
      await this.emit("probe.prefListeners true");
    } catch (error) {
      await this.emit("probe.prefListeners " + JSON.stringify(String(error)));
    }

    // Zotero loads the pane on demand; wait for its markup.
    var container = null;
    var lastPollError = "";
    var paneState = "";
    for (var attempt = 0; attempt < 600; attempt++) {
      try {
        container = win.document.getElementById("ccfrank-prefpane-root");
        if (container) break;
        // The container is created by `_addPane()` before the fragment is read,
        // so its presence separates "Zotero never loaded the pane" from "the
        // fragment or its script failed".
        if (!paneState) {
          var containers = win.document.querySelectorAll(".pane-container");
          paneState =
            "navItems=" +
            win.document.querySelectorAll("#prefs-navigation richlistitem")
              .length +
            " containers=" +
            containers.length +
            " nav=" +
            String(
              win.Zotero_Preferences && win.Zotero_Preferences.navigation
                ? win.Zotero_Preferences.navigation.value
                : "?",
            );
        }
      } catch (error) {
        lastPollError = String(error);
        if (attempt > 20) break;
      }
      await Zotero.Promise.delay(100);
    }

    await this.emit("probe.docError " + JSON.stringify(lastPollError));
    await this.emit("probe.paneLoadState " + JSON.stringify(paneState));
    await this.emit("probe.paneMarkup " + String(!!container));
    if (container) {
      var document = win.document;
      var missing = [
        "ccfrank-button-scan",
        "ccfrank-button-scan-force",
        "ccfrank-button-update-selected",
        "ccfrank-button-cas-refresh",
        "ccfrank-button-alias-save",
        "ccfrank-button-cas-import",
        "ccfrank-alias-list",
        "ccfrank-pref-template",
        "ccfrank-cache-status",
        "ccfrank-scan-status",
      ].filter(function (id) {
        return !document.getElementById(id);
      });
      await this.emit("probe.paneIdsMissing " + JSON.stringify(missing));
      await this.emit(
        "probe.paneCheckboxes " +
          String(container.querySelectorAll("input[type=checkbox]").length),
      );
      await this.emit(
        "probe.paneButtons " +
          String(container.querySelectorAll("button").length),
      );
      // Checkboxes are measured instead of counted: a checkbox that exists but
      // renders 0x0 is invisible to the user, which counting cannot detect.
      var boxes = Array.prototype.slice.call(
        container.querySelectorAll("input[type=checkbox]"),
      );
      await this.emit(
        "probe.checkboxGeometry " +
          JSON.stringify(
            boxes.slice(0, 4).map(function (box) {
              var rect = box.getBoundingClientRect();
              var style = win.getComputedStyle(box);
              return {
                id: box.id,
                w: Math.round(rect.width),
                h: Math.round(rect.height),
                display: style.display,
                visibility: style.visibility,
                hidden: box.hidden,
                label: box.getAttribute("label"),
                checked: box.getAttribute("checked"),
                text: (box.textContent || "").trim().slice(0, 24),
                labelElem: !!box.querySelector("label"),
                checkElem: !!box.querySelector(".checkbox-check"),
              };
            }),
          ),
      );
      await this.emit(
        "probe.paneHidden " +
          JSON.stringify(
            boxes.filter(function (b) {
              return b.hidden;
            }).length,
          ),
      );
      // The checkboxes are native inputs bound by the pane controller, so a
      // preference round-trip proves the binding is live rather than decorative.
      var inputs = container.querySelectorAll(
        "input[type=checkbox][data-pref]",
      );
      await this.emit("probe.checkboxInputs " + String(inputs.length));
      if (inputs.length) {
        var first = inputs[0];
        var prefKey =
          "extensions.zotero.ccfrank." + first.getAttribute("data-pref");
        // Toggling a preference wakes every observer in the profile, so this is
        // wrapped: a busy vendor plugin must not stall the whole probe.
        var before = Zotero.Prefs.get(prefKey, true);
        try {
          first.checked = !before;
          first.dispatchEvent(new win.Event("change", { bubbles: true }));
          await Zotero.Promise.delay(100);
          var after = Zotero.Prefs.get(prefKey, true);
          first.checked = before;
          first.dispatchEvent(new win.Event("change", { bubbles: true }));
          await Zotero.Promise.delay(100);
          await this.emit(
            "probe.checkboxRoundTrip " +
              JSON.stringify({
                key: prefKey,
                before: String(before),
                after: String(after),
                restored: String(Zotero.Prefs.get(prefKey, true)),
              }),
          );
        } catch (error) {
          await this.emit("probe.checkboxRoundTripFailed " + String(error));
        }
      }
      var table = container.querySelectorAll(
        "#ccfrank-placeholder-table .ccfrank-placeholder-row",
      );
      await this.emit("probe.placeholderRows " + String(table.length));
      if (table.length) {
        await this.emit(
          "probe.placeholderFirst " +
            JSON.stringify(
              (table[0].textContent || "").replace(/\s+/g, " ").trim(),
            ),
        );
      }
      await this.emit(
        "probe.paneBindings " +
          String(container.querySelectorAll("[preference]").length),
      );

      // The pane script is a subscript of the preferences window.
      await this.emit(
        "probe.controller " + String(typeof win.__ccfrankPrefsPane),
      );

      var aliasList = document.getElementById("ccfrank-alias-list");
      await this.emit(
        "probe.aliasRows " +
          String(
            aliasList
              ? aliasList.querySelectorAll(".ccfrank-alias-row").length
              : -1,
          ),
      );
      var preview = document.getElementById("ccfrank-template-preview");
      await this.emit(
        "probe.preview " + JSON.stringify(preview ? preview.textContent : null),
      );
      var about = document.getElementById("ccfrank-pref-about");
      await this.emit(
        "probe.about " + JSON.stringify(about ? about.textContent : null),
      );

      // The columns and the item pane row must be live (read-only checks first).
      try {
        var columns = Zotero.ItemTreeManager.getCustomColumns(undefined, {
          pluginID: "ccfrank@timetrapzz.site",
        });
        await this.emit(
          "probe.columns " +
            JSON.stringify(
              (columns || []).map(function (column) {
                return column.dataKey;
              }),
            ),
        );
      } catch (columnsError) {
        await this.emit("probe.columnsError " + String(columnsError));
      }
      try {
        var rowData = Zotero.ItemPaneManager.customInfoRowData || {};
        await this.emit(
          "probe.infoRows " +
            JSON.stringify(
              Array.isArray(rowData.options)
                ? rowData.options.map(function (row) {
                    return row.rowID;
                  })
                : [],
            ),
        );
      } catch (rowsError) {
        await this.emit("probe.infoRowsError " + String(rowsError));
      }

      // The one-click entry points have to exist in the main window.
      try {
        var mainWin = Zotero.getMainWindow();
        var toolbarButton = mainWin.document.getElementById(
          "ccfrank-toolbar-scan",
        );
        await this.emit("probe.toolbarButton " + String(!!toolbarButton));
        if (toolbarButton) {
          await this.emit(
            "probe.toolbarLabel " +
              JSON.stringify(
                toolbarButton.querySelector(".toolbarbutton-text")
                  ? toolbarButton
                      .querySelector(".toolbarbutton-text")
                      .getAttribute("value")
                  : null,
              ),
          );
        }
        var toolsItem = mainWin.document.getElementById("ccfrank-tools-scan");
        await this.emit("probe.toolsMenuItem " + String(!!toolsItem));
        var itemMenuItem = mainWin.document.getElementById(
          "ccfrank-itemmenu-scan-all",
        );
        await this.emit("probe.itemMenuItem " + String(!!itemMenuItem));
      } catch (toolbarError) {
        await this.emit("probe.toolbarError " + String(toolbarError));
      }

      // Exercise the pipeline end to end on the (empty) user library: the scan
      // must complete rather than silently finding nothing.
      try {
        var summary = await Zotero.CCFRank.manager.scanLibrary({
          refreshCas: false,
        });
        await this.emit(
          "probe.scan " +
            JSON.stringify({
              total: summary.total,
              scanned: summary.scanned,
              updated: summary.updated,
              errors: summary.errors,
            }),
        );
      } catch (error) {
        await this.emit("probe.scanError " + String(error));
      }
      // A real click has to reach the plugin through the action event.
      var seen = [];
      win.addEventListener("ccfrank:action", function (event) {
        seen.push(event.detail && event.detail.action);
      });
      await this.emit("probe.beforeClick");
      var aliasSave = document.getElementById("ccfrank-button-alias-save");
      if (aliasSave) {
        try {
          aliasSave.dispatchEvent(new win.CustomEvent("command", {}));
          await this.emit("probe.clickDispatched " + JSON.stringify(seen));
        } catch (clickError) {
          await this.emit("probe.clickError " + String(clickError));
        }
      } else {
        await this.emit("probe.noSaveButton");
      }
      await this.emit("probe.actionsAfterClick " + JSON.stringify(seen));
    }

    // ---------------------------------------------------------------- identify
    // The user-visible job: identify one real item and read back what the
    // plugin wrote. This runs last because it is the only step that mutates a
    // preference-adjacent state (it creates an item in the throwaway library).
    await this.checkIdentify();

    await this.finish();
  },

  /**
   * Create a journal article, seed the CAS cache for its journal, identify it
   * and read the result back. Reports every step so a failure is attributable.
   */
  checkIdentify: async function () {
    var manager = Zotero.CCFRank && Zotero.CCFRank.manager;
    if (!manager) {
      await this.emit("probe.identify skipped: no manager");
      return;
    }
    var library = Zotero.Libraries.userLibraryID;
    var item = null;
    try {
      item = new Zotero.Item("journalArticle");
      item.libraryID = library;
      item.setField("title", "CCF Rank runtime check");
      // A top-tier journal from the bundled CCF catalog: the metadata path must
      // resolve it without any network access.
      item.setField(
        "publicationTitle",
        "IEEE Transactions on Pattern Analysis and Machine Intelligence",
      );
      item.setField("date", "2024-01-01");
      await item.saveTx();
      await this.emit("probe.identifyItemCreated " + String(item.id));
    } catch (error) {
      await this.emit("probe.identifyItemFailed " + String(error));
      return;
    }

    try {
      var store = await manager.init();
      store.put({
        name: "IEEE Transactions on Pattern Analysis and Machine Intelligence",
        abbr: "IEEE Trans. Pattern Anal. Mach. Intell.",
        issn: "01628828",
        zone: "1区",
        category: "计算机科学",
        top: true,
        fetchedAt: Date.now(),
        origin: "import",
      });
      await store.save();
      await this.emit("probe.identifyCacheSeeded " + String(store.size));
    } catch (error) {
      await this.emit("probe.identifyCacheFailed " + String(error));
    }

    try {
      var before = String(item.getField("extra") || "");
      var result = await manager.identifyNow([item], { force: true });
      var after = String(item.getField("extra") || "");
      await this.emit(
        "probe.identifyResult " +
          JSON.stringify({
            processed: result.processed,
            updated: result.updated,
            extraBefore: before.slice(0, 60),
            extra: after.replace(/\s+/g, " ").slice(0, 240),
          }),
      );
      // The column provider is what the user actually looks at, and the tree
      // reaches it through `getCustomCellData`, so that exact call is measured.
      var columnKey = "ccfrank\\@timetrapzz\\.site-ccfRankSummary";
      await this.emit(
        "probe.identifySummaryCell " +
          JSON.stringify(
            Zotero.CCFRank.api && Zotero.CCFRank.api.summaryText
              ? Zotero.CCFRank.api.summaryText(item)
              : null,
          ),
      );
      await this.emit(
        "probe.cellData " +
          JSON.stringify({
            isCustom: Zotero.ItemTreeManager.isCustomColumn(columnKey),
            viaManager: Zotero.ItemTreeManager.getCustomCellData(
              item,
              columnKey,
            ),
            dataKeyInList: (
              await Zotero.ItemTreeManager.getCustomColumns()
            ).map(function (column) {
              return column.dataKey;
            }),
          }),
      );
    } catch (error) {
      await this.emit(
        "probe.identifyError " + String((error && error.stack) || error),
      );
    }

    // The progress bar in the settings pane must react to a real job.
    try {
      var win3 = Zotero.Utilities.Internal.openPreferences("ccfrank-prefpane");
      await Zotero.Promise.delay(1500);
      var progressBox = win3.document.getElementById("ccfrank-progress");
      var fill = win3.document.getElementById("ccfrank-progress-fill");
      await this.emit("probe.progressBox " + String(!!progressBox));
      await this.emit(
        "probe.progressIdle " +
          JSON.stringify({
            hidden: progressBox ? progressBox.getAttribute("hidden") : null,
            width: fill ? fill.style.width : null,
          }),
      );
      // Push one report through the plugin's own callback chain.
      Zotero.CCFRank.manager.callbacks.onProgress?.({
        phase: "scan",
        done: 3,
        total: 12,
        percent: 25,
        active: true,
      });
      await Zotero.Promise.delay(200);
      await this.emit(
        "probe.progressRunning " +
          JSON.stringify({
            hidden: progressBox ? progressBox.getAttribute("hidden") : null,
            width: fill ? fill.style.width : null,
            text: String(
              (win3.document.getElementById("ccfrank-progress-text") || {})
                .textContent || "",
            ).trim(),
          }),
      );
    } catch (error) {
      await this.emit("probe.progressFailed " + String(error));
    }

    // The right-click entry the user presses must exist in the built menu.
    try {
      var mainWin = Zotero.getMainWindow();
      var menuItem = mainWin.document.getElementById(
        "ccfrank-itemmenu-identify",
      );
      await this.emit("probe.identifyMenuItem " + String(!!menuItem));
    } catch (error) {
      await this.emit("probe.identifyMenuError " + String(error));
    }

    // Keep the throwaway library clean for the next run.
    try {
      await item.eraseTx();
      await this.emit("probe.identifyItemRemoved true");
    } catch (error) {
      await this.emit("probe.identifyItemRemoved " + String(error));
    }
  },

  finish: async function () {
    await this.emit("probe.done ok");
    try {
      Components.classes["@mozilla.org/toolkit/app-startup;1"]
        .getService(Components.interfaces.nsIAppStartup)
        .quit(Components.interfaces.nsIAppStartup.eForceQuit);
    } catch (error) {
      dump("[ccfrank-probe] quit failed: " + error + "\n");
    }
  },

  /**
   * Entry point, called from this XPI's `bootstrap.js` right after the plugin was
   * started. A failure here must always reach the report: a probe that dies
   * silently looks exactly like a plugin that dies silently.
   */
  startup: async function (rootURI) {
    try {
      await this.run(rootURI);
    } catch (error) {
      dump("[ccfrank-probe] fatal " + error + "\n");
      try {
        await this.emit(
          "probe.fatal " +
            String((error && error.stack) || error) +
            " | report=" +
            this.report,
        );
      } catch (_writeError) {
        // nothing left to do
      }
      await this.finish();
    }
  },
};
