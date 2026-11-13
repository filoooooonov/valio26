#!/usr/bin/env node
// Dev entry point. Runs package.json "dev:app" once /lock-challenge has set it up.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (!pkg.scripts?.["dev:app"]) {
  console.log("no app yet: run /lock-challenge <slug> to scaffold one.");
  process.exit(0);
}
const pm = process.versions.bun || spawnSync("bun", ["--version"], { shell: true }).status === 0 ? "bun" : "npm";
const r = spawnSync(pm, ["run", "dev:app"], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
