---
name: demo-check
description: Run the demo-tester subagent against DEMO.md, then update DEMO.md step statuses with what broke.
disable-model-invocation: true
---

1. Launch the `demo-tester` subagent: "Walk through DEMO.md and report."
2. Update the Status column of each step in `DEMO.md`: ✅ with the time if it passed, or ❌ with the short error if it broke.
3. For each ❌, add a task to `TASKS.md` under "Now" (`- [ ] T<n> fix demo step <#>: <error> — files: <guess>`),
   assigned to the folder owner from CLAUDE.md.
4. If a broken step is in the other person's area, `send_message` them on the team board with `kind: "help"`.
5. Commit with `demo: check <n>/<total> passing` and push. Report the pass count and the first broken step.
