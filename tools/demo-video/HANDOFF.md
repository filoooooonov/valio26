# Video handoff — 14 Nov 2026

Completed local captioned movie: `artifacts/demo-video/final.mp4`.

Validation: `node tools/demo-video/check.mjs` → PASS: 50.70s, 1920×1080 H.264, buyer audit, real MCP and human approval. Captioned; no voiceover.

Syntax checks passed for record.mjs, render.mjs and check.mjs. `node scripts/test.mjs --fast` → 38 pass, 0 fail, 141 expect calls.

The actual successful recording used the live LLM planner, a 16-line buyer basket, a chosen salmon substitution and explicit removal of two unavailable products. Buyer order o_e43ty9 was approved by Mikko and placed locally. The outside MCP agent built 1,000 L milk, created o_iuepn4, received HTTP 403 on self-approval, and then Mikko approved that exact order. Both audit trails are saved in local evidence.json.

Decoded frames from intro, buyer, external transcript, manager and outro were visually inspected. The movie labels local prototype orders and the lack of a sponsor order API. No API mocking, shared-state reset or claimed legacy source changes were used.

Legacy video/ and package.json remained held by aleksei-claude, so the complete pipeline is in separately claimed tools/demo-video/. Raw captures and private order evidence remain local; no push was attempted after parent advised an automatic review had rejected publishing other demo evidence.

Run commands and dependency requirements are in README.md. All three commands run from repository root. Generated artifacts are untracked: do not stage or push them with source.
