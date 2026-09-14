/* eslint-disable no-undef */
/**
 * Controller of the preference pane.
 *
 * This file is loaded into the preferences window as a plain subscript (see
 * `PreferencesPane.register()`), so it uses the classic-script style: it
 * defines the factory `window.__ccfrankPrefsPane` which the pane's `onload`
 * handler calls.
 *
 * It is also embedded into the plugin bundle as a string (via the `?raw`
 * import in `src/ui/preferencesPane.ts`), so there is a single source of truth.
 *
 * The pane talks to the plugin through DOM events instead of importing the
 * addon module:
 *
 *   window -> addon : `ccfrank:action` (CustomEvent, detail: { action, ... })
 *   addon -> window : `ccfrank:status` (CustomEvent, detail: { text, ... })
 */
(function (root) {
  "use strict";

  var win = root || (typeof window !== "undefined" ? window : null);
  if (!win) return undefined;

  var REF = "ccfrank";
  var ACTION_EVENT = REF + ":action";
  var STATUS_EVENT = REF + ":status";
  var PREFIX = "extensions.zotero.ccfrank.";

  /**
   * Every placeholder the template understands, in the order it is documented.
   *
   * `sample` is a literal example value (so the preview and the reference table
   * work before any item was identified), `key` is the Fluent id that explains
   * what the placeholder stands for.
   */
  var PLACEHOLDERS = [
    { token: "{ccf}", sample: "CCF-A", key: "tmpl-ccf" },
    { token: "{cas}", sample: "中科院1区", key: "tmpl-cas" },
    { token: "{top}", sample: "Nature子刊 NC", key: "tmpl-top" },
    { token: "{venue}", sample: "TPAMI", key: "tmpl-venue" },
    { token: "{venueAbbr}", sample: "TPAMI", key: "tmpl-venue-abbr" },
    { token: "{ccfAbbr}", sample: "A", key: "tmpl-ccf-abbr" },
    { token: "{casAbbr}", sample: "1区", key: "tmpl-cas-abbr" },
    { token: "{type}", sample: "journal", key: "tmpl-type" },
    { token: "{typeLabel}", sample: "期刊", key: "tmpl-type-label" },
    { token: "{year}", sample: "2024", key: "tmpl-year" },
    { token: "{updated}", sample: "2026-09-12", key: "tmpl-updated" },
    { token: "{citation}", sample: "128", key: "tmpl-citation" },
  ];

  var PLACEHOLDER_EXAMPLE = (function () {
    var map = {};
    for (var i = 0; i < PLACEHOLDERS.length; i++) {
      map[PLACEHOLDERS[i].token] = PLACEHOLDERS[i].sample;
    }
    return map;
  })();

  function zotero() {
    return win.Zotero || (typeof Zotero !== "undefined" ? Zotero : undefined);
  }

  function prefGet(key) {
    var Z = zotero();
    try {
      var value = Z.Prefs.get(PREFIX + key, true);
      return value === undefined || value === null ? "" : value;
    } catch (error) {
      return "";
    }
  }

  function prefSet(key, value) {
    var Z = zotero();
    try {
      Z.Prefs.set(PREFIX + key, value, true);
    } catch (error) {
      Z.debug("[" + REF + "] cannot set " + key + ": " + error);
    }
  }

  function emit(detail) {
    try {
      win.dispatchEvent(
        new win.CustomEvent(ACTION_EVENT, { detail: detail, bubbles: false })
      );
    } catch (error) {
      var Z = zotero();
      if (Z) Z.debug("[" + REF + "] cannot emit " + ACTION_EVENT + ": " + error);
    }
  }

  function setText(id, text, isError) {
    var element = win.document.getElementById(id);
    if (!element) return;
    element.textContent = text || "";
    element.classList.toggle("ccfrank-error", !!isError);
  }

  function localize() {
    try {
      var rootElement = win.document.getElementById("ccfrank-prefpane-root");
      if (rootElement && win.document.l10n) {
        win.document.l10n.translateFragment(rootElement);
      }
    } catch (error) {
      // translation failures are never fatal
    }
  }

  /**
   * Resolve one Fluent string for the controller.
   *
   * The pane's own strings are applied by `data-l10n-id`, but the placeholder
   * table is built in JavaScript, so it has to ask Fluent itself.
   */
  function renderAbout() {
    var target = win.document.getElementById("ccfrank-pref-about");
    if (!target) return;
    var name = "CCF Rank";
    var version = "";
    try {
      var link = win.document.querySelector('link[rel="manifest"]');
      if (link) {
        var manifest = JSON.parse(link.textContent);
        name = manifest.name || name;
        version = manifest.version || "";
      }
    } catch (error) {
      // The manifest link is injected by Zotero after the pane scripts run, so
      // it may not be there yet; retry once instead of showing a bare name.
      if (!target.getAttribute("data-about-retried")) {
        target.setAttribute("data-about-retried", "1");
        win.setTimeout(renderAbout, 400);
      }
      return;
    }
    target.textContent = version ? name + " " + version : name;
  }

  function insertToken(token) {
    var input = win.document.getElementById("ccfrank-pref-template");
    if (!input) return;
    var value = String(input.value || "");
    var start = typeof input.selectionStart === "number" ? input.selectionStart : value.length;
    var end = typeof input.selectionEnd === "number" ? input.selectionEnd : start;
    input.value = value.slice(0, start) + token + value.slice(end);
    var caret = start + token.length;
    try {
      input.setSelectionRange(caret, caret);
      input.focus();
    } catch (error) {
      // Some input implementations do not support selection ranges.
    }
    prefSet("summaryTemplate", input.value);
    renderPreview();
  }

  /**
   * Make the placeholder reference interactive.
   *
   * The rows themselves live in the pane markup so their meanings are
   * translated by Zotero's Fluent pass along with the rest of the pane; all this
   * adds is "click a row to insert that token at the cursor".
   */
  function bindPlaceholders() {
    var doc = win.document;
    var rows = doc.querySelectorAll(".ccfrank-placeholder-row");
    // The tooltip is a localized string in the markup, so no Fluent lookup is
    // needed here (the pane's own `l10n` object does not resolve plugin
    // messages that were added after it was created).
    var hintElement = doc.getElementById("ccfrank-placeholder-hint");
    var hint = hintElement ? String(hintElement.textContent || "").trim() : "";
    for (var i = 0; i < rows.length; i++) {
      (function (row) {
        if (row.getAttribute("data-bound") === "1") return;
        row.setAttribute("data-bound", "1");
        if (hint) row.setAttribute("title", hint);
        row.addEventListener("click", function () {
          insertToken(row.getAttribute("data-token"));
        });
      })(rows[i]);
    }
  }

  /** Localized labels for the three job phases. */
  var PHASE_LABELS = {
    scan: "progress-scan",
    identify: "progress-identify",
    cas: "progress-cas",
  };

  /**
   * Render one progress report as a bar plus a "done / total" line.
   *
   * The phase label comes from the markup's own localized copies (the pane's
   * `l10n` object cannot resolve plugin messages), so they are read once and
   * cached.
   */
  var phaseText = {};

  function phaseLabel(phase) {
    if (!Object.prototype.hasOwnProperty.call(PHASE_LABELS, phase)) {
      return phase;
    }
    if (phaseText[phase] === undefined) {
      var element = win.document.getElementById(
        "ccfrank-progress-label-" + phase
      );
      phaseText[phase] = element
        ? String(element.textContent || "").trim()
        : phase;
    }
    return phaseText[phase];
  }

  function renderProgress(report) {
    var box = win.document.getElementById("ccfrank-progress");
    if (!box) return;
    if (!report || typeof report.percent !== "number") {
      box.setAttribute("hidden", "true");
      return;
    }
    box.removeAttribute("hidden");
    var fill = win.document.getElementById("ccfrank-progress-fill");
    if (fill) {
      fill.style.width = Math.max(0, Math.min(100, report.percent)) + "%";
    }
    var text = win.document.getElementById("ccfrank-progress-text");
    if (text) {
      var total = Number(report.total) || 0;
      var done = Number(report.done) || 0;
      var counts = total ? done + " / " + total : "";
      var percent = Math.round(report.percent) + "%";
      text.textContent =
        phaseLabel(report.phase) +
        " " +
        (counts ? counts + " · " : "") +
        percent +
        (report.active === false ? " · " + phaseLabel("done") : "");
    }
    // A finished job is cleared shortly after, so the pane returns to its
    // resting state instead of claiming a scan is still running.
    if (report.active === false) {
      clearRestoreTimer();
      progressTimer = win.setTimeout(function () {
        progressTimer = 0;
        renderProgress(null);
      }, 8000);
    } else {
      clearRestoreTimer();
    }
  }

  /** Clear the "job finished" restore timer, if one is pending. */
  function clearRestoreTimer() {
    if (!progressTimer) return;
    try {
      if (typeof win.clearTimeout === "function") {
        win.clearTimeout(progressTimer);
      }
    } catch (error) {
      // the window is gone, so there is nothing to clear
    }
    progressTimer = 0;
  }

  var progressTimer = 0;

  function renderPreview() {
    var input = win.document.getElementById("ccfrank-pref-template");
    var target = win.document.getElementById("ccfrank-template-preview");
    if (!input || !target) return;
    var template = String(input.value || prefGet("summaryTemplate") || "");
    var separator = String(prefGet("separator") || " ");
    var preview = template.replace(/\{(\w+)\}/g, function (match) {
      if (!Object.prototype.hasOwnProperty.call(PLACEHOLDER_EXAMPLE, match)) {
        return match;
      }
      return String(PLACEHOLDER_EXAMPLE[match]).split(" ").join(separator);
    });
    target.textContent = preview.replace(/\s+/g, " ").trim();
  }

  function readAliases() {
    try {
      var parsed = JSON.parse(String(prefGet("aliasMapping") || "[]"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function aliasRow(alias) {
    var doc = win.document;
    var row = doc.createElement("div");
    row.className = "ccfrank-alias-row";

    function make(value, placeholder, key, width) {
      var input = doc.createElement("input");
      input.type = "text";
      input.value = value === null || value === undefined ? "" : String(value);
      input.placeholder = placeholder;
      input.setAttribute("data-key", key);
      input.style.width = width;
      return input;
    }

    row.appendChild(make(alias.match, "匹配名称", "match", "16em"));
    row.appendChild(make(alias.abbr, "缩写", "abbr", "8em"));
    row.appendChild(make(alias.full, "全称", "full", "18em"));

    var ccf = doc.createElement("select");
    ccf.setAttribute("data-key", "ccf");
    var choices = [
      ["", "CCF：不设置"],
      ["A", "CCF-A"],
      ["B", "CCF-B"],
      ["C", "CCF-C"],
    ];
    for (var i = 0; i < choices.length; i++) {
      var option = doc.createElement("option");
      option.value = choices[i][0];
      option.textContent = choices[i][1];
      if ((alias.ccf || "") === choices[i][0]) option.selected = true;
      ccf.appendChild(option);
    }
    row.appendChild(ccf);

    row.appendChild(make(alias.cas, "中科院分区，如 1区", "cas", "10em"));

    var remove = doc.createElement("button");
    remove.textContent = "✕";
    remove.className = "ccfrank-alias-remove";
    remove.addEventListener("click", function () {
      row.remove();
    });
    row.appendChild(remove);

    return row;
  }

  function renderAliases() {
    var list = win.document.getElementById("ccfrank-alias-list");
    if (!list) return;
    list.textContent = "";
    var aliases = readAliases();
    if (aliases.length === 0) {
      list.appendChild(aliasRow({}));
      return;
    }
    for (var i = 0; i < aliases.length; i++) {
      list.appendChild(aliasRow(aliases[i]));
    }
  }

  function collectAliases() {
    var list = win.document.getElementById("ccfrank-alias-list");
    if (!list) return [];
    var rows = Array.prototype.slice.call(
      list.querySelectorAll(".ccfrank-alias-row")
    );
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var entry = {};
      var inputs = Array.prototype.slice.call(
        rows[i].querySelectorAll("[data-key]")
      );
      for (var j = 0; j < inputs.length; j++) {
        var key = inputs[j].getAttribute("data-key");
        var value = String(inputs[j].value || "").trim();
        if (value) entry[key] = value;
      }
      if (!entry.match) continue;
      if (entry.ccf && !/^[ABC]$/.test(entry.ccf)) delete entry.ccf;
      result.push(entry);
    }
    return result;
  }

  /**
   * Two-way bind one checkbox.
   *
   * The checkboxes are native HTML inputs (see `preferences.xhtml`), so Zotero's
   * `preference=` attribute cannot be used; the value is mirrored by hand. They
   * are registered as preference observers as well, so a change made elsewhere
   * (or by another window) shows up here.
   */
  function bindCheckbox(input) {
    var key = input.getAttribute("data-pref");
    if (!key) return;
    var apply = function (value) {
      var next = value === true || value === "true";
      if (input.checked !== next) input.checked = next;
    };
    apply(prefGet(key));
    var observer = null;
    try {
      observer = zotero().Prefs.registerObserver(
        PREFIX + key,
        function (value) {
          apply(value);
        },
        true,
      );
      input.setAttribute("data-observer", String(observer));
    } catch (error) {
      observer = null;
    }
    input.addEventListener("change", function () {
      prefSet(key, !!input.checked);
    });
  }

  function bindCheckboxes() {
    var inputs = win.document.querySelectorAll("input[type=checkbox][data-pref]");
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].getAttribute("data-bound") === "1") continue;
      inputs[i].setAttribute("data-bound", "1");
      bindCheckbox(inputs[i]);
    }
  }

  function wire() {
    var doc = win.document;
    var rootElement = doc.getElementById("ccfrank-prefpane-root");
    if (!rootElement) return false;

    renderAliases();
    renderPreview();
    bindPlaceholders();
    renderAbout();
    bindCheckboxes();
    localize();

    if (rootElement.getAttribute("data-wired") === "1") {
      emit({ action: "hello" });
      return true;
    }
    rootElement.setAttribute("data-wired", "1");

    var template = doc.getElementById("ccfrank-pref-template");
    if (template) {
      template.addEventListener("input", renderPreview);
      template.addEventListener("change", renderPreview);
    }

    function bind(id, action, payload) {
      var element = doc.getElementById(id);
      if (!element) return;
      var handler = function () {
        var detail = { action: action };
        if (payload) {
          for (var key in payload) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
              detail[key] = payload[key];
            }
          }
        }
        emit(detail);
      };
      // XUL buttons re-dispatch `command` when they receive a click, so binding
      // both events would run every action twice (two scans, two file pickers).
      element.addEventListener("command", handler);
    }

    bind("ccfrank-button-scan", "scan");
    bind("ccfrank-button-scan-force", "scanForce");
    bind("ccfrank-button-update-selected", "identifySelected");
    bind("ccfrank-button-cancel", "cancel");
    bind("ccfrank-button-cas-refresh", "casRefresh");
    bind("ccfrank-button-cas-rebuild", "casRebuild");
    bind("ccfrank-button-cas-warm", "casWarm");
    bind("ccfrank-button-cas-import", "casImport");
    bind("ccfrank-button-cas-export", "casExport");
    bind("ccfrank-button-cas-clear", "casClear");

    // The alias mapping is owned by the pane: it is the only place that knows
    // the list widget, so saving happens here and the plugin is only told that
    // the value changed.
    var aliasSaveButton = doc.getElementById("ccfrank-button-alias-save");
    if (aliasSaveButton) {
      var saveAliases = function () {
        var aliases = collectAliases();
        prefSet("aliasMapping", JSON.stringify(aliases));
        setText("ccfrank-cas-status", "已保存 " + aliases.length + " 条别名映射");
        emit({ action: "aliasSave", count: aliases.length });
      };
      aliasSaveButton.addEventListener("command", saveAliases);
    }

    var addButton = doc.getElementById("ccfrank-button-alias-add");
    if (addButton) {
      addButton.addEventListener("click", function () {
        var list = doc.getElementById("ccfrank-alias-list");
        if (list) list.appendChild(aliasRow({}));
      });
    }

    win.addEventListener(STATUS_EVENT, function (event) {
      var detail = (event && event.detail) || {};
      if (detail.scan) setText("ccfrank-scan-status", detail.scan);
      if (detail.cas) setText("ccfrank-cas-status", detail.cas, detail.error);
      if (detail.cache) setText("ccfrank-cache-status", detail.cache);
      if (detail.aliases) renderAliases();
      if (detail.about) renderAbout();
      if (detail.progress) renderProgress(detail.progress);
    });

    emit({ action: "hello" });
    return true;
  }

  function attach() {
    if (!win || !win.document) return;
    if (win.document.readyState === "loading") {
      win.addEventListener("DOMContentLoaded", wire);
      return;
    }
    if (wire()) return;
    var attempts = 0;
    var timer = win.setInterval(function () {
      attempts++;
      if (wire() || attempts > 60) win.clearInterval(timer);
    }, 50);
  }

  var api = {
    ACTION_EVENT: ACTION_EVENT,
    STATUS_EVENT: STATUS_EVENT,
    attach: attach,
    wire: wire,
    emit: emit,
    setText: setText,
    renderProgress: renderProgress,
    collectAliases: collectAliases,
    renderAliases: renderAliases,
  };

  win.__ccfrankPrefsPane = api;
  return api;
})(typeof window !== "undefined" ? window : null);
