# TASKS.md: claim before starting

How to use it: change `[ ]` to `[~] @owner` and **commit + push** before you start. Mark `[x]` when done and
merged. Keep tasks to 2h or less, and split anything bigger.

Format: `- [ ] T<n> <task> (rubric: <line>) — files: <paths>`

## Now: first 6 hours (Fri 22:45 → Sat ~05:00, sleep as needed)

### ayaan: gateway, policy, data
- [ ] T1 SPIKE follow-up: ask a mentor for the real judging criteria and whether a passed `closingTime` blocks ordering; write the answers into BRIEF.md (rubric: all) — files: challenges/valio-trade-agents/BRIEF.md
- [ ] T2 Catalog loader + `search_products` (en/fi/sv names, allergens, claims, labels from `data/raw/valio`) (rubric: core req 1) — files: app/server/src/catalog.ts
- [ ] T3 Valio client: `/api/price` + `/api/availability` wrapper, unit maths (L/KG → sales units, lot sizes), cut-off check (rubric: core req 1–2, response logic) — files: app/server/src/valio.ts
- [ ] T4 `POST /api/quote` → offers incl. partial availability + good/better/best substitutes with `why[]` (rubric: response logic, explainability) — files: app/server/src/quote.ts
- [ ] T5 Mandates + `POST /api/orders` policy check → placed / pending_approval with `violations[]`; audit events (rubric: guardrails, audit trail) — files: app/server/src/policy.ts, app/server/src/orders.ts, app/server/src/audit.ts
- [ ] T6 Signed offers: ed25519 over payloadHash + `/.well-known/gateway-key`; MCP server exposing request_quote/place_order/search_products (rubric: trust protocol, innovation) — files: app/server/src/sign.ts, app/server/src/mcp.ts

### aleksei: console, demo, pitch
- [ ] T7 Console shell + design pass: layout with Approvals queue, Audit log, Mandate panel (mock data matching CONTRACT, labelled) (rubric: implementation, demo) — files: app/web/src/
- [ ] T8 Approvals queue: list pending orders, show violations + offer provenance, approve/deny → `POST /api/orders/:id/decision` (rubric: core req 3, guardrails) — files: app/web/src/Approvals.tsx
- [ ] T9 Live audit log: poll `/api/audit`, plain-English timeline, filter by agent (rubric: audit trail, explainability) — files: app/web/src/Audit.tsx
- [ ] T10 Offer card: good/better/best compare (price/L, delivery date, CO₂, labels), "signature verified" badge (rubric: trust protocol, response logic) — files: app/web/src/OfferCard.tsx
- [ ] T11 Demo buyer agent script (Claude API tool use against the MCP gateway) that runs DEMO.md step 2–4 end to end (rubric: core req 2, demo) — files: app/agent/
- [ ] T12 Pitch skeleton: problem/solution/trust-protocol slide outline + 2-min video shot list from DEMO.md (rubric: innovation, impact) — files: docs/pitch.md

## Next
- [ ] Sustainability compare (category CO₂ ranges, labels) in offers
- [ ] Mandate editor in console (change spend limit live during the demo)
- [ ] Verifiable credential format for the mandate (W3C VC JSON) and agentic payments (x402) stretch

## Done
- [x] T0 Pick challenge and lock in `valio-trade-agents` (Fri 22:45)
