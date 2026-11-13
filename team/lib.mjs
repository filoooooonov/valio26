// Shared helpers for the team board: config, agent identity, Convex client.
// Plain Node ESM so hooks, the MCP server and the CLI run on Windows and macOS.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of the *current* checkout (worktree-aware). Falls back to this file's repo. */
export function repoRoot(cwd = process.cwd()) {
  try {
    return execSync("git rev-parse --show-toplevel", { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return path.resolve(here, "..");
  }
}

/** Main checkout root (shared across worktrees) — where .env lives. */
function mainRoot(cwd) {
  try {
    const common = execSync("git rev-parse --path-format=absolute --git-common-dir", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return path.dirname(common);
  } catch {
    return repoRoot(cwd);
  }
}

function loadDotenv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export function config(cwd = process.cwd()) {
  const root = repoRoot(cwd);
  const env = { ...loadDotenv(path.join(mainRoot(cwd), ".env")), ...loadDotenv(path.join(root, ".env")), ...process.env };
  return { root, url: env.TEAM_BOARD_URL, token: env.TEAM_TOKEN, env };
}

/**
 * Agent id = <human>-<tool>[-<worktree>], e.g. "aleksei-claude", "ayaan-codex-wt-api".
 * Override with AGENT_ID. human: TEAM_HUMAN or first word of git user.name.
 */
export function agentIdentity(cwd = process.cwd()) {
  const { env, root } = config(cwd);
  const tool = env.TEAM_TOOL || (env.CLAUDECODE ? "claude" : "agent");
  if (env.AGENT_ID) return { agentId: env.AGENT_ID, tool };
  let human = env.TEAM_HUMAN;
  if (!human) {
    try {
      human = execSync("git config user.name", { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {}
  }
  human = (human || "anon").split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "anon";
  const main = path.basename(mainRoot(cwd));
  const wt = path.basename(root);
  const suffix = wt !== main ? `-${wt.replace(/[^A-Za-z0-9_.]/g, "")}` : "";
  return { agentId: `${human}-${tool}${suffix}`, tool };
}

export function client(cwd = process.cwd()) {
  const { url, token } = config(cwd);
  if (!url || !token) return null;
  return { c: new ConvexHttpClient(url), token };
}

export const board = anyApi.board;

/** Repo-relative POSIX path for an absolute or relative path. */
export function relPath(p, cwd = process.cwd()) {
  const root = repoRoot(cwd);
  const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p);
  return path.relative(root, abs).split(path.sep).join("/");
}

export function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export function fmtAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

export function fmtOverview(o, me) {
  const lines = [];
  lines.push("Agents:");
  for (const a of o.agents.sort((x, y) => y.lastSeen - x.lastSeen)) {
    lines.push(`  ${a.agentId === me ? "*" : " "} ${a.agentId} [${a.status}] ${a.task || "-"} (${fmtAgo(a.lastSeen)})`);
  }
  lines.push("Claims:");
  if (o.claims.length === 0) lines.push("   (none)");
  for (const c of o.claims) lines.push(`    ${c.path}  <- ${c.agentId} (${c.reason})`);
  if (o.recent.length) {
    lines.push("Recent messages:");
    for (const m of o.recent.slice(-5)) lines.push(`    ${m.from} -> ${m.to} [${m.kind}]: ${m.body.slice(0, 120)}`);
  }
  return lines.join("\n");
}
