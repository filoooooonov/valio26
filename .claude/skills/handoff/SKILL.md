---
name: handoff
description: Write a HANDOFF.md note from recent git log and the current task, release team-board claims, then commit and push.
disable-model-invocation: true
---

1. `git pull`. Gather your own recent commits (`git log --oneline -15 --author="$(git config user.name)"`),
   your `[~]` tasks in `TASKS.md`, and `git status`.
2. Prepend a note to `HANDOFF.md`, below the `---` line, in the format shown at the top of that file. Include:
   - **Done:** what's finished
   - **State:** what runs and how to run it
   - **Next / blocked:** what's next, and who it's for
   - **Gotchas**
   Keep it to 8 lines or fewer and be concrete: include commands and file paths.
3. Update `TASKS.md`: mark finished tasks `[x]`, and unclaim tasks you're dropping (set them back to `[ ]` with a note).
4. Commit with `handoff: <one line>` and push.
5. On the team board: `release_files()`, then `post_status(idle, "handoff written")`. If the note says something
   is for the other person, `send_message` them with `kind: "handoff"` and a 1-line summary.
