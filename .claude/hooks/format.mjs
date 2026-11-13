// PostToolUse(Edit|Write): format the edited file. Silent no-op if no formatter applies.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

let input = "";
for await (const chunk of process.stdin) input += chunk;

try {
  const file = JSON.parse(input).tool_input?.file_path;
  if (!file || !existsSync(file)) process.exit(0);
  const ext = path.extname(file).toLowerCase();
  if ([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".css", ".scss", ".html", ".vue", ".svelte"].includes(ext)) {
    let bin;
    try {
      bin = createRequire(file).resolve("prettier/bin/prettier.cjs");
    } catch {
      process.exit(0);
    }
    spawnSync(process.execPath, [bin, "--write", "--log-level", "silent", file], { timeout: 15000 });
  } else if (ext === ".py") {
    spawnSync("ruff", ["format", "--quiet", file], { timeout: 15000, shell: false });
  }
} catch {}
process.exit(0);
