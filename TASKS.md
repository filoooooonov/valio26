# TASKS.md: claim before starting

How to use it: change `[ ]` to `[~] @owner` and **commit + push** before you start. Mark `[x]` when done and
merged. Keep tasks to 2h or less, and split anything bigger.

Format: `- [ ] T<n> <task> (rubric: <line>) — files: <paths>`

## Now: Sat 14 Nov, solo build (aleksei + agents)
Rubric: demo 30 · user need 20 · guardrails 20 · exceptions 15 · openness 15. Design: **W3 cart-first** (`docs/design/night/W3/`, reviews + open fixes in MORNING.md §2b). Shapes: CONTRACT.md v1 (server has additive v1.1 routes). Night results: MORNING.md.

**Checkpoint A (target ~17:00):** request → basket → resolve swap → approve → order, live.
- [x] S1 Catalogue search (local, en/fi/sv, diet filters) + Valio client (price/availability for shortlisted SKUs only, customer price, cut-off, unit maths) (rubric: demo, openness) — files: app/server/src/catalog.ts, app/server/src/valio.ts
- [x] S2 Planner: request → dishes (portion basis, diet per dish) → quantities → catalogue matches → stock check → lines with `why`; pantry assumptions; issues with options (rubric: user need, exceptions) — files: app/server/src/plan.ts
- [x] S3 Mandate + orders + audit, enforced server-side (per-order + daily limit, swaps need OK, re-check price/stock at approval, prices held until) (rubric: guardrails) — files: app/server/src/policy.ts, orders.ts, audit.ts
- [~] @aleksei-codex-demo S4 **NEXT.** Working UI per W3 on the live gateway: request box → basket by dish with inline swap cards → review & send to Mikko → placed + audit. Apply the W3 review fixes (MORNING.md §2b). Check the uncommitted `app/web/src` WIP (api.ts, format.ts, icons.tsx, components/) from another session first and build on it (rubric: demo, user need) — files: app/web/src/
- [ ] S5 Valio follow-up today (10–21): show the V2 UI on the live gateway. **Answered on Discord by Tommi (09:35/09:40, see MEETING-2026-11-13.md):** approval (no gates in Valio's systems; customers use internal instructions or manager-only ordering; agent orders need a human approval for now), passed closingTime (it is the cut-off for that availableDate; mock data is fixed all weekend), no order API (orders for human approval are enough). **Still ask:** photo must-have? do big accounts already order system-to-system (EDI/API)? (rubric: user need) — files: challenges/valio-trade-agents/MEETING-2026-11-13.md

**Then:**
- [ ] S6 Photo → basket (menu/recipe photo → same planner) (rubric: user need)
- [~] @aleksei-codex-demo S7 Approval card + order confirmation with readable audit trail; make approval feel like "review and confirm" (rubric: guardrails, explain)
- [ ] S8 Substitution options ranked by delivery reliability + CO₂ (rubric: exceptions, compare beyond price)
- [~] S9 MCP wrapper + OpenAPI; hotel-chain agent orders 1,000 L lactose-free milk → same approval queue (rubric: openness). Done on the server: `/mcp` (stateless HTTP, 5 tools) + milk → needs_approval → Mikko proven live. Left: OpenAPI doc + making it visible in the UI
- [ ] S11 Valio API rules from Tommi (Sat 14 Nov): honour HTTP 429 (30 s block: back off and retry once, show a "Valio asked us to slow down" state, never hammer); treat availability ≥ 999999 as unknown but orderable in any quantity (valio.ts checks `=== 999999 || >= 666666666`; change to `>= 999999`); treat allowedLotSize 0.01 as 1 wherever lot size is used (rubric: robustness) — files: app/server/src/valio.ts, plan.ts
- [ ] S12 Approver per customer + an "autonomy level" setting on the mandate (today: every agent order needs a human; roadmap: auto within the mandate once reliable), shown on the rules panel (rubric: guardrails, openness) — files: app/server/src/policy.ts, app/web/
- [~] @aleksei-codex-video S10 Record 2-min video as soon as Checkpoint A works; run `valio-voice` on it; pitch (rubric: all)

## Done
- [x] T1 Real judging criteria: official handout transcribed in `challenges/valio-trade-agents/HANDOUT.md` (Fri 23:40)
- [x] T0 Pick challenge and lock in `valio-trade-agents` (Fri 22:45)
