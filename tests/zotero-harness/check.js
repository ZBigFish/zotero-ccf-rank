/**
 * Diagnostic self-check for the CCF Rank plugin, run inside a real Zotero build.
 *
 * Not part of the shipped plugin: it lives in `tests/zotero-harness/` and is
 * injected by `tools/run-zotero-check.ps1` into a throwaway profile that has the
 * built XPI installed. It only uses public APIs, so it verifies the real
 * integration rather than the internals.
 *
 * Evaluated as a classic script, hence the ES5-ish style.
 */
/* eslint-disable no-undef */
var CCFRankCheck = {
  ADDON_ID: "ccfrank@timetrapzz.site",
  INSTANCE: "CCFRank",
  ROOT: "chrome://ccfrank/content/",
  lines: [],
  failures: 0,

  record: function (message, details) {
    var suffix = "";
    if (details !== undefined && details !== null) {
      try {
        suffix =
          " " +
          (typeof details === "string" ? details : JSON.stringify(details));
      } catch (e) {
        suffix = " " + String(details);
      }
    }
    this.lines.push(message + suffix);
  },

  expect: function (condition, message, details) {
    if (!condition) this.failures++;
    this.record(
      (condition ? "PASS " : "FAIL ") + message,
      details === undefined ? undefined : details,
    );
  },

  writeReport: async function (path) {
    if (!path) return;
    try {
      await IOUtils.writeUTF8(path, this.lines.join("\n"));
    } catch (e) {
      Zotero.debug("[ccfrank-check] cannot write the report: " + e);
    }
  },

  waitForPlugin: async function (timeoutMs) {
    var deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      var addon = Zotero[this.INSTANCE];
      if (addon && addon.data && addon.data.initialized) return true;
      await Zotero.Promise.delay(500);
    }
    return false;
  },

  readAsset: function (name) {
    return Zotero.File.getContentsFromURL(this.ROOT + name);
  },

  /** One synthetic item per venue topology. */
  makeFixtures: async function () {
    var libraryID = Zotero.Libraries.userLibraryID;
    var templates = [
      {
        type: "journalArticle",
        fields: {
          title: "Attention Is All You Need",
          publicationTitle:
            "IEEE Transactions on Pattern Analysis and Machine Intelligence",
          ISSN: "0162-8828",
          date: "2017",
        },
      },
      {
        type: "conferencePaper",
        fields: {
          title: "Deep Residual Learning for Image Recognition",
          proceedingsTitle:
            "Proceedings of the 2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)",
          conferenceName:
            "IEEE/CVF Conference on Computer Vision and Pattern Recognition",
          date: "2016",
        },
      },
      {
        type: "preprint",
        fields: {
          title: "Scaling Laws for Neural Language Models",
          repository: "arXiv",
          publicationTitle: "arXiv",
          date: "2020",
        },
      },
      {
        type: "journalArticle",
        fields: {
          title: "A Study of Nothing in Particular",
          publicationTitle: "Journal of Totally Unrelated Studies",
          date: "2021",
        },
      },
      {
        type: "journalArticle",
        fields: {
          title: "BERT: Pre-training of Deep Bidirectional Transformers",
          publicationTitle:
            "Conference of the North American Chapter of the Association for Computational Linguistics",
          conferenceName: "NAACL-HLT 2019",
          date: "2019",
        },
      },
      {
        type: "journalArticle",
        fields: {
          title: "A Survey of Large Language Models",
          publicationTitle: "ACM Computing Surveys",
          date: "2024",
        },
      },
    ];

    var created = [];
    for (var i = 0; i < templates.length; i++) {
      var template = templates[i];
      var item = new Zotero.Item(template.type);
      item.libraryID = libraryID;
      for (var field in template.fields) {
        if (Object.prototype.hasOwnProperty.call(template.fields, field)) {
          try {
            item.setField(field, template.fields[field]);
          } catch (e) {
            this.record("fixture.field.error", field + ": " + e);
          }
        }
      }
      await item.saveTx();
      created.push(item);
    }
    return created;
  },

  run: async function (options) {
    var reportPath = options && options.reportPath;

    this.record("zotero.version", Zotero.version);
    this.record("profile.dir", Zotero.Profile.dir);
    var started = await this.waitForPlugin(120000);
    this.expect(started, "plugin.startup");
    if (!started) {
      await this.writeReport(reportPath);
      return;
    }
    var addon = Zotero[this.INSTANCE];

    // ---- preference pane -------------------------------------------------
    try {
      var panes = (Zotero.PreferencePanes.pluginPanes || []).filter(
        function (pane) {
          return pane.pluginID === this.ADDON_ID;
        }.bind(this),
      );
      this.expect(panes.length === 1, "pref.pane.registered", panes.length);
      this.record("pref.pane.label", panes.length ? panes[0].rawLabel : "none");
      this.record("pref.pane.src", panes.length ? panes[0].src : "none");
      this.record("pref.pane.scripts", panes.length ? panes[0].scripts : []);
      this.record(
        "pref.pane.stylesheets",
        panes.length ? panes[0].stylesheets : [],
      );
      this.expect(
        panes.length > 0 && panes[0].src.indexOf("preferences.xhtml") > 0,
        "pref.pane.src.resolves",
        panes.length ? panes[0].src : "none",
      );
    } catch (e) {
      this.expect(false, "pref.pane.registered", String(e));
    }

    // ---- columns ---------------------------------------------------------
    try {
      var columns = Zotero.ItemTreeManager.getCustomColumns(undefined, {
        pluginID: this.ADDON_ID,
      });
      var keys = (columns || []).map(function (column) {
        return column.dataKey;
      });
      this.expect(
        keys.some(function (key) {
          return key.indexOf("ccfRankSummary") >= 0;
        }),
        "column.summary.registered",
        keys,
      );
      this.expect(
        keys.some(function (key) {
          return key.indexOf("ccfRankCitation") >= 0;
        }),
        "column.citation.registered",
        keys,
      );
      this.record(
        "column.labels",
        (columns || []).map(function (column) {
          return column.label;
        }),
      );
    } catch (e) {
      this.expect(false, "columns.registered", String(e));
    }

    // ---- item pane row ---------------------------------------------------
    try {
      var rows = Zotero.ItemPaneManager.customInfoRowData || {};
      var rowKeys = Object.keys(rows).filter(function (key) {
        return key.indexOf("ccfrank") === 0;
      });
      this.expect(rowKeys.length === 1, "info.row.registered", rowKeys);
    } catch (e) {
      this.expect(false, "info.row.registered", String(e));
    }

    // ---- pane assets -----------------------------------------------------
    try {
      var markup = this.readAsset("preferences.xhtml");
      var ids = [
        "ccfrank-prefpane-root",
        "ccfrank-button-scan",
        "ccfrank-button-scan-force",
        "ccfrank-button-alias-save",
        "ccfrank-button-cas-refresh",
        "ccfrank-alias-list",
        "ccfrank-pref-template",
        "ccfrank-cache-status",
      ];
      var missing = ids.filter(function (id) {
        return markup.indexOf('id="' + id + '"') < 0;
      });
      this.expect(missing.length === 0, "pane.markup.ids", missing);
      this.record(
        "pane.script.bytes",
        String(this.readAsset("prefs-pane.js").length),
      );
      this.record(
        "pane.css.bytes",
        String(this.readAsset("preferences.css").length),
      );

      // Load the controller the way Zotero does and run it against a minimal
      // stand-in for the pane markup, which exercises the real event wiring.
      var win = Zotero.getMainWindow();
      Services.scriptloader.loadSubScript(
        "chrome://ccfrank/content/prefs-pane.js",
        win,
      );
      this.expect(!!win.__ccfrankPrefsPane, "pane.controller.loads");
      var api = win.__ccfrankPrefsPane;
      if (api) {
        var actions = [];
        win.addEventListener(api.ACTION_EVENT, function (event) {
          actions.push(event.detail && event.detail.action);
        });
        var host = win.document.createElement("div");
        host.id = "ccfrank-prefpane-root";
        win.document.documentElement.appendChild(host);
        api.attach();
        this.expect(
          actions.indexOf("hello") >= 0,
          "pane.controller.hello",
          actions,
        );
      }
    } catch (e) {
      this.expect(false, "pane.assets", String((e && e.stack) || e));
    }

    // ---- identification --------------------------------------------------
    try {
      var store =
        (addon.manager && addon.manager.casStore) ||
        (addon.manager ? await addon.manager.init() : undefined);
      this.expect(!!store, "cas.store.available", store ? store.path : "none");
      this.record("cas.store.path", store ? store.path : "none");
    } catch (e) {
      this.expect(false, "cas.store.available", String(e));
    }

    try {
      var fixtures = await this.makeFixtures();
      this.expect(fixtures.length === 6, "fixtures.created", fixtures.length);
      var result = await addon.manager.identifyNow(fixtures, { force: true });
      this.record("identify.processed", String(result.processed));
      this.record("identify.updated", String(result.updated));
      this.expect(
        result.processed === fixtures.length,
        "identify.processed.all",
        result.processed,
      );
    } catch (e) {
      this.expect(false, "identify.run", String((e && e.stack) || e));
    }

    try {
      var items = Zotero.Items.getAll(
        Zotero.Libraries.userLibraryID,
        false,
        false,
        false,
      );
      var withExtra = 0;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item.isRegularItem()) continue;
        var extra = String(item.getField("extra") || "");
        if (extra.indexOf("CCF-RANK") >= 0) withExtra++;
        this.record(
          "item.title",
          String(item.getField("title") || "").slice(0, 60),
        );
        this.record("item.extra", extra.replace(/\n/g, " | ").slice(0, 300));
        this.record(
          "item.cas",
          String(item.getField("publicationTitle") || "").slice(0, 80),
        );
      }
      this.expect(withExtra >= 5, "extra.written", withExtra);
    } catch (e) {
      this.record("library.error", String((e && e.stack) || e));
    }

    // ---- live CAS lookup -------------------------------------------------
    try {
      var casModule = addon.manager && addon.manager.casClient;
      if (casModule && casModule.lookup) {
        var lookup = await casModule.lookup({
          name: "IEEE Transactions on Pattern Analysis and Machine Intelligence",
          issn: "0162-8828",
        });
        this.record("letpub.status", lookup.status);
        this.record(
          "letpub.best",
          lookup.best
            ? lookup.best.name +
                "|" +
                lookup.best.zone +
                "|IF " +
                lookup.best.impactFactor
            : "none",
        );
        this.expect(lookup.status === "ok", "letpub.lookup", lookup.status);
      } else {
        this.record("letpub.client", "not exposed");
      }
    } catch (e) {
      this.record("letpub.error", String((e && e.stack) || e));
    }

    this.record("failures", String(this.failures));
    this.record("done", "ok");
    await this.writeReport(reportPath);
  },
};
