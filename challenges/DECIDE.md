# DECIDE: which challenge?

Scores run from 1 to 5, and **higher is better on every row**. For competition, 5 means few rival teams. For risk, 5 means low risk.
Team: aleksei on frontend, demo and pitch; ayaan on backend and ML. Both use Claude Code, and Ayaan also uses Codex.

| | MariaDB: Wikipedia Through Time | Valio Aimo: Trusted Trade Agents | Bahn: Spread |
|---|---|---|---|
| Fit with our skills | **5**: visual time-travel UI (aleksei) plus RAG and embeddings (ayaan) | 4: approval console (aleksei) plus gateway and policy (ayaan) | 3: mostly an algorithm job (ayaan), and the frontend is only a dashboard |
| Demo strength | **5**: year slider, diffs, cited answers; very visual | 4: an agent orders, hits a limit and escalates live; clear but text-heavy | 3: a margin number and charts; the win is decided by slides about the approach |
| Competition | 3: RAG is common, but SVT and Finnish data thin the field | 2: "agents + MCP" is this year's most crowded idea | **4**: hard and quantitative, so fewer teams commit seriously |
| Prize value | ? (TBC) | ? (TBC) | ? (TBC) |
| Technical risk | 3: MariaDB 11.7+ setup (no Docker on Windows), and real revision history for SVT | **4**: mock API provided; the main risk is a thin API | 2: need 20%+ margin to make the top 10; tuning could stall |
| **Total** (without prize) | **16** | 14 | 12 |

Prizes are TBC everywhere. Re-check the challenge pages and the opening on Friday, and update the table.

## Recommendation
**MariaDB, idea 1 ("Then vs Now": time-travel Q&A on both tracks).** It plays to aleksei's frontend strength for the demo,
targets the "extra recognition for both tracks" line directly, and produces the strongest 2-minute video.
Run the **SPIKE first**. If historical timestamps can't be backfilled into system-versioned tables, it becomes RAG-first
with idea 3, and Valio Aimo becomes a close alternative.

**Your decision.** Then run `/lock-challenge <slug>`.
