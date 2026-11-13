// PreToolUse(Edit|Write): block edits to files another agent has claimed; auto-claim otherwise.
// Fails OPEN: if the board is unreachable or unconfigured, the edit goes through.
import path from "node:path";

const SHARED = new Set(["TASKS.md", "HANDOFF.md", "DECISIONS.md", ".claude/settings.local.json"]);

let input = "";
for await (const chunk of process.stdin) input += chunk;

try {
  const { tool_input, cwd } = JSON.parse(input);
  const file = tool_input?.file_path;
  if (!file) process.exit(0);
  const { client, board, agentIdentity, relPath, withTimeout } = await import("../../team/lib.mjs");
  const dir = path.dirname(file);
  const base = cwd || dir;
  const rel = relPath(file, base);
  if (rel.startsWith("..") || SHARED.has(rel)) process.exit(0);
  const cl = client(base);
  if (!cl) process.exit(0);
  const { agentId, tool } = agentIdentity(base);
  const r = await withTimeout(cl.c.mutation(board.guardEdit, { token: cl.token, agentId, tool, path: rel }), 4000);
  if (!r.ok) {
    process.stderr.write(
      `BLOCKED: ${rel} is claimed by ${r.holder} (claim: ${r.claimPath}, reason: ${r.reason}). ` +
        `Do not edit it. Pick other work, or ask them with the team send_message tool (to: "${r.holder}", kind: "help"). ` +
        `If the claim looks stale, ask your human.`,
    );
    process.exit(2);
  }
} catch {
  // fail open
}
process.exit(0);
