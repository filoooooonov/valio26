# Ideas: MariaDB

Team fit: aleksei handles the frontend, so the timeline and diff visuals are the demo's wow moment. Ayaan handles backend and ML: ingest, embeddings, SQL.

1. **"Then vs Now": time-travel Q&A (Both tracks)**
   Ask "What did Wikipedia say about the Winter War?", then drag a year slider. You get answers grounded *as of* that date,
   with a diff of what changed and citations for each version.
   Rubric: hits both tracks (extra recognition), creative use of MariaDB, and a strong demo. aleksei builds the slider and diff UI; ayaan builds the AS-OF RAG.

2. **Edit-war radar (SVT)**
   Ranks articles and sections by revert churn and highlights contested sentences, with a timeline of who changed what.
   Rubric: SVT recognition and real usefulness for Wikipedians. Risk: it needs real revision data.

3. **Cited history tutor (RAG)**
   A research assistant for the history of Finland. Every claim links to its source chunk, and a "gap detector" flags questions
   that Wikipedia can't answer.
   Rubric: usefulness and execution. Safest to build, but the least distinctive.

**Pick:** 1, falling back to 3 if the spike fails.
