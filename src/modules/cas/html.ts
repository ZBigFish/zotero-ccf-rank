/**
 * Small HTML helpers for the LetPub scraping code.
 *
 * Kept dependency free on purpose: the plugin evaluates inside a Zotero
 * sandbox with no DOM, and regex parsing keeps the module unit-testable under
 * plain Node.
 */

export interface HtmlTableCell {
  /** Inner HTML of the cell. */
  html: string;
  /** Cell text with tags removed and entities decoded. */
  text: string;
  colspan: number;
  rowspan: number;
}

export interface HtmlTableRow {
  cells: HtmlTableCell[];
  /** Raw `<tr ...>` attributes. */
  attributes: string;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  "#160": " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  times: "×",
  deg: "°",
};

/** Decode the handful of HTML entities that show up in journal names. */
export function decodeEntities(value: string): string {
  return String(value ?? "").replace(/&(#?\w+);/g, (match, name: string) => {
    const key = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ENTITIES, key)) {
      return ENTITIES[key];
    }
    if (key.startsWith("#")) {
      const code = Number(key.slice(1));
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch (_error) {
          return match;
        }
      }
    }
    return match;
  });
}

/** Strip tags, scripts and styles, then collapse whitespace. */
export function htmlToText(html: string): string {
  let result = String(html ?? "");
  result = result.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  result = result.replace(/<br\s*\/?>/gi, "\n");
  result = result.replace(/<\/(?:div|p|tr|li|h\d)>/gi, "\n");
  result = result.replace(/<[^>]*>/g, " ");
  result = decodeEntities(result);
  return result
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Alias of `htmlToText`: the name used by the LetPub parser. */
export const stripTags = htmlToText;

function parseCellAttributes(attributes: string): {
  colspan: number;
  rowspan: number;
} {
  const colspan = Number(
    /\bcolspan\s*=\s*["']?(\d+)/i.exec(attributes)?.[1] ?? 1,
  );
  const rowspan = Number(
    /\browspan\s*=\s*["']?(\d+)/i.exec(attributes)?.[1] ?? 1,
  );
  return {
    colspan: Number.isFinite(colspan) && colspan > 0 ? colspan : 1,
    rowspan: Number.isFinite(rowspan) && rowspan > 0 ? rowspan : 1,
  };
}

/** Parse every `<tr>` of an HTML fragment into rows of cells. */
export function parseTableRows(html: string): HtmlTableRow[] {
  const rows: HtmlTableRow[] = [];
  const rowRegex = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html))) {
    const attributes = rowMatch[1] ?? "";
    const body = rowMatch[2] ?? "";
    const cells: HtmlTableCell[] = [];
    const cellRegex = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(body))) {
      const attrs = parseCellAttributes(cellMatch[1] ?? "");
      cells.push({
        html: cellMatch[2] ?? "",
        text: htmlToText(cellMatch[2] ?? ""),
        colspan: attrs.colspan,
        rowspan: attrs.rowspan,
      });
    }
    if (cells.length) rows.push({ cells, attributes });
  }
  return rows;
}

/** Extract all links (`<a href=...>text</a>`) from a fragment. */
export function parseLinks(
  html: string,
): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const regex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    links.push({ href: decodeEntities(match[1]), text: htmlToText(match[2]) });
  }
  return links;
}

/**
 * Flatten rows into a rectangular grid, honouring `colspan`, the way a browser
 * would lay the table out. `rowspan` is ignored: the tables parsed by this
 * plugin do not rely on it, and dropping the cell keeps the column indices
 * aligned.
 */
export function toGrid(rows: HtmlTableRow[]): string[][] {
  const grid: string[][] = [];
  for (const row of rows) {
    const cells: string[] = [];
    for (const cell of row.cells) {
      cells.push(cell.text);
      for (let i = 1; i < cell.colspan; i++) cells.push(cell.text);
    }
    grid.push(cells);
  }
  return grid;
}
