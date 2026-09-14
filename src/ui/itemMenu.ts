/**
 * Right-click menu entries in the item tree.
 */

import { config } from "../../package.json";
import { getString } from "../utils/locale";
import type { IdentifyManager } from "../modules/manager";
import { readRecordOf } from "../modules/columns";

const MENU_IDENTIFY = `${config.addonRef}-itemmenu-identify`;
const MENU_REIDENTIFY = `${config.addonRef}-itemmenu-reidentify`;

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

/** Show a short progress message. */
function notify(
  text: string,
  type: "default" | "success" | "fail" = "default",
): void {
  try {
    new ztoolkit.ProgressWindow(getString("scan-progress-title"), {
      closeOtherProgressWindows: true,
    })
      .createLine({ text, type })
      .show();
  } catch (error) {
    ztoolkit.log("progress window failed", error);
  }
}

export function registerItemMenu(manager: IdentifyManager): void {
  const icon = `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`;

  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: MENU_IDENTIFY,
    label: getString("get-ccf-info"),
    icon,
    commandListener: () => {
      const items = selectedItems();
      if (items.length === 0) {
        notify(getString("scan-need-selection"));
        return;
      }
      notify(
        getString("requesting-citations-multiple", {
          args: { count: items.length },
        }),
      );
      void manager
        .identifyNow(items)
        .then(({ updated }) =>
          notify(
            getString("scan-finished", {
              args: { updated, total: items.length },
            }),
            "success",
          ),
        )
        .catch((error) => {
          ztoolkit.log("identify failed", error);
          notify(String((error as Error)?.message ?? error), "fail");
        });
    },
  });

  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: MENU_REIDENTIFY,
    label: getString("reidentify-selected"),
    icon,
    commandListener: () => {
      const items = selectedItems();
      if (items.length === 0) {
        notify(getString("scan-need-selection"));
        return;
      }
      void manager
        .identifyNow(items, { force: true })
        .then(({ updated }) =>
          notify(
            getString("scan-finished", {
              args: { updated, total: items.length },
            }),
            "success",
          ),
        )
        .catch((error) => {
          ztoolkit.log("re-identify failed", error);
          notify(String((error as Error)?.message ?? error), "fail");
        });
    },
  });

  // Keep the menu enabled only when the selection is 1..n
  ztoolkit.Menu.register("item", {
    tag: "menuseparator",
    id: `${config.addonRef}-itemmenu-separator`,
  });
}

/** Exposed for the tests / debugging. */
export function describeRecord(item: Zotero.Item): string {
  const record = readRecordOf(item);
  return Object.entries(record)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}
