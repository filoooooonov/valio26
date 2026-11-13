#!/usr/bin/env node
// Test entry point. `--fast` runs "test:fast" (must finish in seconds; used by the Stop hook),
// otherwise "test:app". Exits 0 with a note if the script doesn't exist yet.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const fast = process.argv.includes("--fast");
const name = fast ? "test:fast" : "test:app";
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (!pkg.scripts?.[name]) {
  console.log(`no tests yet (package.json has no "${name}" script).`);
  process.exit(0);
}
const pm = spawnSync("bun", ["--version"], { shell: true }).status === 0 ? "bun" : "npm";
const r = spawnSync(pm, ["run", name], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
