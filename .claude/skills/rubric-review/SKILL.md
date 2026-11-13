---
name: rubric-review
description: Score the current project against the judging rubric in CLAUDE.md and list the 3 cheapest improvements.
---

1. Read the "Judging rubric" in `CLAUDE.md`. If it's not locked, use `challenges/DECIDE.md` and say so. Also read
   `DEMO.md`, `README.md`, `TASKS.md` and `git log --oneline -20`.
2. Score each rubric line from 0 to 5. Base the score on evidence: what a judge would actually see in the demo, video or repo.
   Don't give credit for code paths that aren't on the demo path.
3. Output:
```
| Rubric line | Score | Evidence | Gap |
```
   Then list the **3 cheapest improvements**: the biggest score gain per hour, each with an estimate in hours and the files involved.
4. Ask the human whether to add them to `TASKS.md`. Don't add them on your own.
