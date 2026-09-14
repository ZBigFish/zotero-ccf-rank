// Removes a directory tree (used to clean the test build output).
const fs = require("fs");
const path = require("path");

const target = process.argv[2];
if (!target) {
  console.error("usage: node tools/clean.cjs <dir>");
  process.exit(1);
}

const resolved = path.resolve(process.cwd(), target);
const root = process.cwd();
if (!resolved.startsWith(root)) {
  console.error(`refusing to remove ${resolved} (outside the project)`);
  process.exit(1);
}
fs.rmSync(resolved, { recursive: true, force: true });
console.log(`cleaned ${path.relative(root, resolved)}`);
