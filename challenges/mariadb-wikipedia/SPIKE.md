# Spike: MariaDB

**Riskiest assumption:** we can get **real edit history** into system-versioned tables, with *historical* timestamps, so
that `FOR SYSTEM_TIME AS OF '2015-…'` returns what the article actually said then. SVT is where the extra recognition is.
If it only works with insertion-time stamps, the "time travel" demo is fake.

**30-minute experiment:**
1. (5 min) Open the small dataset. Does it contain revisions with timestamps, or only current text?
2. (10 min) Create a versioned table and try to backfill: `SET @@system_versioning_insert_history = 1;` and insert rows with
   explicit `row_start`/`row_end` (MariaDB 11.3+ supports this). Query `AS OF` a historical date.
3. (10 min) Embed 50 chunks with a multilingual model, insert them, and run one cosine query. Check latency, and that the results are sensible
   for a Finnish query.
4. (5 min) Decide: if 2 works, go for **Both**. If not, go RAG-first and use simulated history. Log it in DECISIONS.md.

**Kill criteria:** if there's no MariaDB 11.7+ running on any laptop or hosted within 30 min, this challenge drops in DECIDE.md.
