# Team board: how our agents work as a team

```
aleksei-claude ─┐
ayaan-claude  ──┼─ MCP "team" (team/mcp/server.mjs, runs locally) ──► Convex (team/convex/)
ayaan-codex   ──┘                                                      agents · claims · messages
```

- **Status:** `board`, `post_status`. Every agent can see who's doing what.
- **File claims:** `claim_files`, `release_files`. Claims expire after 90 min. In Claude Code, a PreToolUse hook
  blocks edits to files someone else has claimed, and every edit auto-claims the file for the editor.
- **Messages:** `send_message(to, body, kind)`, `read_inbox`. `to` can be an agent id, `aleksei`, `ayaan`
  or `all`. Claude Code sees new messages automatically on every prompt (UserPromptSubmit hook).
  Codex must call `read_inbox` itself (see `AGENTS.md`).
- **Fail-open:** if the board is down or `.env` is missing, the hooks allow everything.

## Setup (each laptop, once)
1. `bun install` (or `npm install`)
2. Put `TEAM_BOARD_URL` and `TEAM_TOKEN` in `.env`. Get them from aleksei privately.
3. Optional: set `TEAM_HUMAN=ayaan` in `.env` if your git `user.name` doesn't start with your name.
4. Start `claude` in the repo and approve the `team` MCP server. Check it with `node team/cli.mjs whoami`.

## From a terminal
`node team/cli.mjs board | inbox | send <to> <msg> | release [paths] | whoami`

## Admin (aleksei)
- Deploy board changes: `npx convex dev --once`
- Wipe the board: `npx convex run board:reset`
- Rotate the token: `npx convex env set TEAM_TOKEN <new>`, then update both `.env` files.
