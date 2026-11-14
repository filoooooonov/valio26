---
name: lock-challenge
description: Lock the repo in to one challenge. Fills CLAUDE.md, copies sponsor docs, sets up the MCP, env vars and app scaffold, seeds TASKS.md and logs the decision. Run only when the humans have decided.
argument-hint: <slug>  (mariadb-wikipedia | valio-trade-agents | bahn-spread)
disable-model-invocation: true
---

Lock in challenge **`$ARGUMENTS`**. Target: done in under 10 minutes. Ask the human only if something is truly blocking.

0. `git pull`. Check that `challenges/$ARGUMENTS/` exists, and stop if it doesn't. Post on the team board:
   `post_status(working, "lock-in $ARGUMENTS")` and `send_message(all, "Locking in $ARGUMENTS; hold off on edits to CLAUDE.md, TASKS.md, CONTRACT.md, package.json")`.
1. **CLAUDE.md:** replace the "Active challenge" section with the challenge name, a one-line goal, and a link to
   `challenges/$ARGUMENTS/BRIEF.md`. Replace "Judging rubric" with the rubric copied verbatim from BRIEF.md, plus the event-wide
   Innovation, Impact and Implementation criteria. Fill in the build and deploy commands.
2. **Sponsor docs:** copy everything the sponsor gave us (handbooks, OpenAPI, kits' READMEs, links listed in
   QUICKSTART.md) into `docs/sponsors/<sponsor>/` as markdown. Use the `researcher` subagent to fetch them if needed.
3. **MCP:** if QUICKSTART.md names a sponsor MCP server, add it to `.mcp.json` (keep `team`), using `${VAR}` placeholders for keys,
   and add it to `enabledMcpjsonServers` in `.claude/settings.json`. Add the same server to `.codex/config.toml`.
4. **Env:** append every key from QUICKSTART.md to `.env.example` with a comment on where to get it. Use no real values.
5. **Scaffold:** pick the stack from `challenges/$ARGUMENTS/IDEAS.md`, or the "Stack" line in QUICKSTART.md:
   - Create `app/server/` and `app/web/` (both owned by aleksei), each with a hello-world that runs.
   - In root `package.json`, add `dev:app` (starts everything), `test:app`, and a `test:fast` that finishes in under 10s.
   - Run `bun run dev` and `node scripts/test.mjs --fast` to prove they work.
   - Hacking must have started (Fri 19:30 or later) before you write app code. If it hasn't, stop after step 4 and tell the human.
6. **CONTRACT.md:** write the first API shapes for the chosen idea (health endpoint plus the 2–3 core calls).
7. **TASKS.md:** seed a **first-6-hours plan** with about 6 tasks per person, each 2h or less, each tied to a rubric line and listing its files.
   aleksei owns everything; agents do frontend, backend and data. Put the SPIKE.md experiment first.
8. **DEMO.md:** draft the 5–7 step demo script from the chosen idea.
9. **DECISIONS.md:** add `<time> · <who> · Locked $ARGUMENTS — <why, 1 line from DECIDE.md>`.
10. Commit (`lock-in: $ARGUMENTS`), push, then `send_message(all, "Locked $ARGUMENTS. Pull now. Tasks in TASKS.md.")`,
    `post_status(idle, "lock-in done")`. Print a 5-line summary for the human.
