/**
 * Self-check, reachable from the Tools menu.
 *
 * The column pipeline has several links that fail silently: a column can be
 * registered, visible and sized while its cells stay empty, because Zotero
 * resolves the cell text through its own option cache. This produces one plain
 * report of every link for the selected item, so a user can say what is wrong
 * without opening a debugger.
 */

import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref, readRuntimeOptions } from "../utils/prefs";
import { COLUMN_KEYS, readRecordOf, summaryText } from "../modules/columns";
import type { Columns } from "../modules/columns";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/** The namespaced data key Zotero builds for one of our columns. */
function namespacedKey(dataKey: string): string {
  return `${config.addonRef}\\@${config.addonID.replace("@", "\\.")}-${dataKey}`;
}

/**
 * The columns this plugin registered, read from Zotero's own cache.
 *
 * `getCustomColumns()` only exists in newer builds, so the cache is read
 * directly; the keys there are the namespaced data keys the tree uses.
 */
function registeredColumns(): Array<{ key: string; label?: string }> {
  const cache = (Zotero.ItemTreeManager as any)._customColumns as
    Record<string, { label?: string; pluginID?: string }> | undefined;
  if (!cache) return [];
  return Object.entries(cache)
    .filter(([, options]) => options?.pluginID === config.addonID)
    .map(([key, options]) => ({ key, label: options?.label }));
}

function selectedItems(): Zotero.Item[] {
  try {
    const pane =
      Zotero.getActiveZoteroPane?.() ?? (globalThis as any).ZoteroPane;
    const items = pane?.getSelectedItems?.() as Zotero.Item[] | undefined;
    return Array.isArray(items) ? items : [];
  } catch (_error) {
    return [];
  }
}

/**
 * @returns one line per link in the chain, in the order Zotero walks it.
 */
export async function runSelfCheck(columns: Columns): Promise<Check[]> {
  const checks: Check[] = [];
  const { addonID } = config;

  checks.push({
    name: "插件已启动",
    ok: true,
    detail: `${addonID} · 版本 ${String((addon as any).data?.version ?? "?")}`,
  });

  // 1. Are the columns registered where Zotero looks for them?
  const ours = registeredColumns();
  checks.push({
    name: "已注册的列",
    ok: ours.length > 0,
    detail: ours.length
      ? ours
          .map((column) => `${column.label ?? "?"} (${column.key})`)
          .join("； ")
      : "一个都没有 —— 列没有注册成功",
  });

  const sample = selectedItems()[0];
  if (!sample) {
    checks.push({
      name: "选中条目",
      ok: false,
      detail: "请先在文献列表中选中 1 篇已识别的论文，再运行自检",
    });
    return checks;
  }

  const extra = (sample.getField("extra") as string) ?? "";
  const record = readRecordOf(sample);
  checks.push({
    name: "选中条目的识别数据",
    ok: Boolean(record.ccf || record.cas || record.ccfVenue),
    detail:
      Object.entries(record)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => `${key}=${value}`)
        .join(" ") || `Extra 里没有识别数据（前 80 字：${extra.slice(0, 80)}）`,
  });

  // 2. Does Zotero's own cache resolve the cell for this item?
  const key = namespacedKey(COLUMN_KEYS.summary);
  let cell = "";
  let isCustom = false;
  try {
    isCustom = Boolean(Zotero.ItemTreeManager.isCustomColumn(key));
    cell = String(Zotero.ItemTreeManager.getCustomCellData(sample, key) ?? "");
  } catch (error) {
    checks.push({
      name: "Zotero 取单元格文本",
      ok: false,
      detail: String(error),
    });
  }
  checks.push({
    name: "Zotero 认得这一列",
    ok: isCustom,
    detail: isCustom ? key : `没有命中 Zotero 的列缓存；使用的键是 ${key}`,
  });
  checks.push({
    name: "单元格文本（Zotero 通道）",
    ok: Boolean(cell),
    detail: cell || "空 —— 这一列就会显示为空白",
  });
  checks.push({
    name: "单元格文本（插件直算）",
    ok: Boolean(summaryText(sample)),
    detail: summaryText(sample) || "空",
  });

  // 3. How is the template configured?
  const options = readRuntimeOptions();
  checks.push({
    name: "模板 / 分隔符",
    ok: Boolean(options.summaryTemplate),
    detail: `${JSON.stringify(options.summaryTemplate)} · 分隔符 ${JSON.stringify(options.separator)} · CCF 前缀 ${options.ccfPrefix}`,
  });
  checks.push({
    name: "列开关",
    ok: getPref("showSummaryColumn", false),
    detail: `汇总 ${getPref("showSummaryColumn", false)} · CCF ${getPref("showCcfColumn", false)} · 中科院 ${getPref("showCasColumn", false)} · 引用 ${getPref("showCitationColumn", false)}`,
  });

  // 4. Rebuild the columns and measure again, so a stale cache is ruled out.
  try {
    const keys = await columns.repair();
    const after = String(
      Zotero.ItemTreeManager.getCustomCellData(sample, key) ?? "",
    );
    checks.push({
      name: "重建列之后",
      ok: Boolean(after),
      detail: after
        ? `已恢复：${after}`
        : `仍然为空；重建后拿到的键：${keys.join(", ") || "无"}`,
    });
  } catch (error) {
    checks.push({ name: "重建列", ok: false, detail: String(error) });
  }

  return checks;
}

/** Show the report as text the user can copy out. */
export function showSelfCheckReport(checks: Check[]): void {
  const text = [
    "Zotero CCF Rank 自检",
    "",
    ...checks.map(
      (check) => `${check.ok ? "✔" : "✘"} ${check.name}\n    ${check.detail}`,
    ),
  ].join("\n");
  for (const line of text.split("\n")) ztoolkit.log("[self-check]", line);

  try {
    const win = Zotero.getMainWindow();
    const doc = win.document;
    const existing = doc.getElementById("ccfrank-selfcheck-window");
    if (existing) existing.remove();
    const box = doc.createXULElement("vbox");
    box.setAttribute("id", "ccfrank-selfcheck-window");
    box.setAttribute(
      "style",
      "position: fixed; right: 16px; bottom: 16px; width: 46em; max-height: 60vh;" +
        "padding: 10px; z-index: 9999; background: var(--material-background, #fff);" +
        "border: 1px solid var(--fill-quinary, #ccc); border-radius: 8px;" +
        "box-shadow: 0 6px 24px rgba(0,0,0,.25); overflow: auto;",
    );
    const heading = doc.createXULElement("label");
    heading.setAttribute("style", "font-weight: 600; margin-block-end: 6px;");
    heading.setAttribute("value", getString("self-check-title"));
    const body = doc.createElement("textarea");
    body.setAttribute("readonly", "true");
    body.setAttribute(
      "style",
      "width: 100%; height: 24em; font-family: monospace; font-size: 12px;",
    );
    body.value = text;
    const close = doc.createXULElement("button");
    close.setAttribute("label", "关闭");
    close.addEventListener("command", () => box.remove());
    box.appendChild(heading);
    box.appendChild(body);
    box.appendChild(close);
    const container =
      doc.getElementById("zotero-items-pane") ?? doc.documentElement;
    container.appendChild(box);
    body.focus();
    body.select();
  } catch (error) {
    ztoolkit.log("self-check window failed", error);
  }
}
