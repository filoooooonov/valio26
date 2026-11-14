// Stop: run the fast test suite if the working tree changed. Exit 2 feeds failures back
// to Claude so it fixes them before finishing. Skips on re-entry to avoid loops.
import { spawnSync } from "node:child_process";
import path from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;

try {
  const { stop_hook_active, cwd } = JSON.parse(input || "{}");
  if (stop_hook_active) process.exit(0);
  // Repo root, not the session's cwd (which may be a subfolder like app/server).
  const start = cwd || process.cwd();
  const root =
    process.env.CLAUDE_PROJECT_DIR ||
    spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: start,
      encoding: "utf8",
    }).stdout?.trim() ||
    start;
  const dirty = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).stdout?.trim();
  if (!dirty) process.exit(0);
  const r = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "test.mjs"), "--fast"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 90_000,
    },
  );
  if (r.status !== 0 && r.status !== null) {
    const out = `${r.stdout || ""}\n${r.stderr || ""}`
      .trim()
      .split("\n")
      .slice(-40)
      .join("\n");
    process.stderr.write(
      `Fast tests failed (node scripts/test.mjs --fast). Fix before finishing:\n${out}`,
    );
    process.exit(2);
  }
} catch {}
process.exit(0);
