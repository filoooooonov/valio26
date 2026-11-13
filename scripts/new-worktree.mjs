#!/usr/bin/env node
// Create a parallel checkout for another agent session:
//   node scripts/new-worktree.mjs <name>
// -> ../valio26-worktrees/<name> on branch wt/<name>, deps installed.
// The agent there gets id "<you>-<tool>-<name>" on the team board.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const name = process.argv[2];
if (!name || !/^[A-Za-z0-9_.-]+$/.test(name)) {
  console.error("usage: node scripts/new-worktree.mjs <name>   (letters, digits, - _ .)");
  process.exit(1);
}
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const root = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout.trim();
const dir = path.join(path.dirname(root), `${path.basename(root)}-worktrees`, name);
if (existsSync(dir)) {
  console.error(`exists: ${dir}`);
  process.exit(1);
}
run("git", ["fetch", "--quiet", "origin"], root);
run("git", ["worktree", "add", "-b", `wt/${name}`, dir, "origin/main"], root);
const hasBun = spawnSync("bun", ["--version"], { shell: true }).status === 0;
run(hasBun ? "bun" : "npm", ["install"], dir);
console.log(`\nReady: ${dir}\n  cd "${dir}" && claude      (or codex)\nMerge back with a PR from wt/${name}, then: git worktree remove "${dir}"`);
