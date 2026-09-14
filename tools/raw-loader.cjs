const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

/**
 * Node counterpart of the bundler's `?raw` import suffix.
 *
 * `src/ui/prefs-pane.raw.ts` pulls the pane controller in as a string so the
 * file ships inside the XPI. esbuild inlines it during `pnpm build`; the plain
 * `tsc` test build keeps the import, so it is resolved here.
 *
 * The controller is plain JavaScript that `tsc` does not compile, so a request
 * coming from the compiled tree is redirected to the same path under `src/`.
 * Evaluating it here is also a syntax check of the pane controller itself.
 */
const SUFFIX = "?raw";

Module._resolveFilename = new Proxy(Module._resolveFilename, {
  apply(target, thisArg, args) {
    const request = args[0];
    if (typeof request !== "string" || !request.endsWith(SUFFIX)) {
      return Reflect.apply(target, thisArg, args);
    }
    const relative = request.slice(0, -SUFFIX.length);
    const from = path.dirname(args[1]?.filename ?? process.cwd());
    let file = path.resolve(from, relative);
    if (!fs.existsSync(file)) {
      const marker = `${path.sep}build-test${path.sep}`;
      const index = file.indexOf(marker);
      if (index >= 0) {
        file = file.slice(0, index) + file.slice(index + marker.length - 1);
      }
    }
    const module = new Module(file, args[1]);
    module.filename = file;
    module.loaded = true;
    module.exports = fs.readFileSync(file, "utf8");
    Module._cache[file] = module;
    return file;
  },
});
