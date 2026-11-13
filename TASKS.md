# TASKS.md: claim before starting

How to use it: change `[ ]` to `[~] @owner` and **commit + push** before you start. Mark `[x]` when done and
merged. Keep tasks to 2h or less, and split anything bigger.

Format: `- [ ] T<n> <task> (rubric: <line>) — files: <paths>`

## Now: first 6 hours (Fri 23:45 → Sat ~06:00). Re-planned after the official rubric + mentor meeting
Rubric: demo 30 · user need 20 · guardrails 20 · exceptions 15 · openness 15 (see CLAUDE.md). Hero flow = DEMO.md (catering for 50).

### ayaan: gateway, policy, data
- [ ] T2 Catalog loader + local `search_products` (en/fi/sv names, allergens, claims, labels; no API calls) (rubric: demo, user need) — files: app/server/src/catalog.ts
- [ ] T3 Valio client: `/api/price` + `/api/availability` for **shortlisted SKUs only**, customer price (`netPriceFound`), unit maths, cut-off check (rubric: demo, openness "query only when needed") — files: app/server/src/valio.ts
- [ ] T4 **Basket planner**: request text ("catering for 50, Saturday, one vegan option") → LLM picks dishes/ingredients → per-person quantities × N → catalog matches → priced, stock-checked basket lines with `why[]` (rubric: user need, demo) — files: app/server/src/plan.ts
- [ ] T5 Exceptions: partial stock / cut-off passed → good-better-best substitutes ranked allergens → delivery reliability → price → CO₂ (rubric: exceptions) — files: app/server/src/substitute.ts
- [ ] T6 Mandates + orders: policy check (spend, substitutions, allergens) → placed / pending_approval with plain-language `violations[]`; audit events (rubric: guardrails, explain) — files: app/server/src/policy.ts, app/server/src/orders.ts, app/server/src/audit.ts
- [ ] T7 MCP server + OpenAPI doc for the same calls (search, plan/quote, order, status), so an external agent can run the milk example (rubric: openness) — files: app/server/src/mcp.ts, app/server/openapi.yaml
- ⚠️ CONTRACT.md v0 assumes a single-item quote; needs a `POST /api/basket` (plan) shape. ayaan proposes the PR, aleksei approves.

### aleksei: webshop assistant, demo, pitch
- [x] T8a Aimo brand 1:1 in the web app (real fonts, tokens, header, buttons) (rubric: user need: "integrated into existing website") — files: app/web/src/theme.css
- [ ] T8 Webshop shell in Aimo style + **assistant panel**: one request box (+ photo button, stubbed), not a chat transcript (rubric: user need, demo) — files: app/web/src/
- [ ] T9 Basket view: lines with qty, customer price, stock/delivery badge, "why" drawer; flagged lines show good/better/best picker (rubric: exceptions, explain) — files: app/web/src/Basket.tsx
- [ ] T10 Approval card + mandate panel: violations in plain language, approve/deny → order (rubric: guardrails) — files: app/web/src/Approval.tsx
- [ ] T11 Audit timeline: request → lookup → order → approval, who/why, export JSON (rubric: explain, openness) — files: app/web/src/Audit.tsx
- [ ] T12 External agent script (Claude API + MCP) running the 1,000 L milk example into the same approval queue (rubric: openness, guardrails) — files: app/agent/
- [ ] T13 Prep for the **Sat 14 Nov follow-up with Valio** (10–21): 3 questions (not-a-chatbot vs in-site assistant; passed `closingTime`; photo priority) + show a click-through (rubric: user need) — files: challenges/valio-trade-agents/MEETING-2026-11-13.md
- [ ] T14 Pitch skeleton + 2-min video shot list from DEMO.md (rubric: all) — files: docs/pitch.md

## Next
- [ ] Photo → basket (vision: menu / fridge photo → products), stretch from the meeting
- [ ] Sustainability compare (category CO₂ ranges, labels) in basket lines
- [ ] Signed offers (ed25519 provenance) + mandate as W3C VC; agentic payments (x402) stretch
- [ ] Mandate editor (change the spend limit live during the demo)

## Done
- [x] T1 Real judging criteria: official handout transcribed in `challenges/valio-trade-agents/HANDOUT.md` (Fri 23:40)
- [x] T0 Pick challenge and lock in `valio-trade-agents` (Fri 22:45)
