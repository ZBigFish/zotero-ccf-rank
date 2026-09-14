/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Raw text of the pane controller.
 *
 * The bundler understands `import x from "./prefs-pane.js?raw"`, but the plain
 * `tsc` test build does not, so the import is kept out of the type system and
 * resolved by Node when the module is actually loaded in a test.
 */
export const prefsPaneScript: string = require("./prefs-pane.js?raw");
