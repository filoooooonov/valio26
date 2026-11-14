# Morning brief: Sat 14 Nov (written 07:20)

## 1. TL;DR

```
git switch night/2026-11-14 && bun run demos
```

- **None of the three demo apps exist.** A-split (:5175), B-cartfirst (:5174) and C-eventplan (:5176) were never built: the build runs stalled from about 03:00 to 07:00 and missed the 06:40 deadline. There are no `demos/` folders and no `night/demo-*` branches. `bun run demos` starts only the gateway and the console.
- **What works:** the **gateway on http://localhost:8787**. It does the full flow against the live Valio API: request, basket (Claude planner), stock check with substitutes, mandate, order, approval by Mikko L., and audit. There is also an MCP endpoint at `/mcp`. 30 tests pass, 0 fail.
- **Console http://localhost:5173:** only a stub of the approvals page. It has no request box and no basket.
- **Show Valio B-cartfirst:** the polished W3 mockups (`docs/design/night/W3/`), then the same flow run live against the gateway. **Why:** it got the most design work (3 polish rounds, W1 to W3) and matches the in-webshop "review and confirm" cart Valio asked for. The live API run proves the mockup's numbers are real, not invented.
- **One thing to check first:** at 07:18 another session was writing a real web UI in `app/web/src` (RequestBox, Cart, Summary, api.ts; not committed). If it builds and works by 08:30, show that on :5173 instead of the mockups.

## 2. Comparison

All live scores are 0 to 20 per lens. Every reviewer found the app port dead and scored the console stub or the 404 API (that was before the 07:19 gateway restart). The scores measure "nothing there", not the design.

| Demo | URL | Live score (valio / chef-qa) | Works end to end (verified) | Biggest weakness |
|---|---|---|---|---|
| A-split | :5175 (dead) | 12 / 0 | No. Never built | Exists only as 3 mockup PNGs (`docs/design/night/A-split/`) |
| B-cartfirst | :5174 (dead) | 8 / 0 | No. Never built | No working UI. Mockups only, though polished to W3 |
| C-eventplan | :5176 (dead) | 12 / 5 | No. Never built | Exists only as 3 mockup PNGs (`docs/design/night/C-eventplan/`) |
| Gateway (API/MCP) | :8787 | not re-scored after the fix | **Yes, by API**: the catering basket, then the order placed (o_cslnp7). 1000 L milk goes to needs_approval, the agent's own approval gets 403, Mikko's approval places it | No UI drives it yet |
| Console | :5173 | n/a | No. Approvals stub only | No request box or basket |

## 3. Real vs fallback

- **Planner:** real Claude, `claude-opus-5-5` (effort low) via `@anthropic-ai/sdk` with structured output. The LLM only parses the request and ranks at most 12 candidates per need. Search, diet filter, unit maths, stock calls and all mandate rules run in server code. If the LLM fails, a code-only fallback planner takes over (proven live: 12 lines, 4 calls).
- **Speed:** one full catering basket takes about 21 s and 4 Valio calls. Plan the meeting around that wait or pre-run it.
- **LLM spend:** not metered in code. About 5 live planner runs at effort low, which should be well under $1 of the ~24 USD key. Check the Anthropic console before relying on that number.
- **Valio API:** real for price, stock and delivery date. Stock amounts from the API are placeholders, so partial-stock cases are not demonstrated.
- **Mocked / in-memory:** orders, approvals and audit live in an in-memory store (`store.ts`), so a gateway restart wipes them. Placing an order does not send anything to Valio; it is our record only. The approver "Mikko L." and buyer "Anna K." are fixed names. The mandate is €500 per order and €1500 per day.
- **CONTRACT.md:** still v1. The server added routes and fields (`/api/mandate`, `/api/audit`, `/mcp`, `StockLine.status`), which need a PR (see the decisions below).

## 4. Remaining problems

**All three demos:** no app exists. To show any of them live, someone has to build the UI against the now-working gateway.

**Gateway:**
- 21 s basket latency with no streaming or progress feedback.
- State is lost on restart (in-memory store).
- `/api/stock` used to return 200 with zeros for unknown SKUs. This is fixed to `not_found` / 404, but no UI has exercised it yet.
- English search depends on a small hand-tuned group boost (milk, cream, butter, salmon). Other English ingredient words may rank badly.
- Blueberries (465273/461154) have no delivery date for Fri 20 Nov and no deliverable substitute. Expect that line to stay an open issue.

**Console / web WIP:** uncommitted files in `app/web/src` from another session (api.ts, format.ts, icons.tsx, components/), untested by me. CLAUDE.md is also modified and uncommitted.

## 5. Decisions only you can make

1. **What to show at 09:00.** I recommend the W3 B-cartfirst mockups plus a live gateway run (curl, or the web WIP if it works). Don't show the console stub on its own.
2. **Whether to keep the web WIP in `app/web/src`.** I recommend building it now (`bun run build`) and clicking through. If the request-to-basket flow works, commit it and make it the demo. If not, park it on a branch.
3. **Whether to merge CONTRACT v1.1.** I recommend yes, since the changes are additive. The other owner needs to approve the PR.
4. **Model choice.** I recommend keeping `claude-opus-5-5` at effort low for quality. Switch to Haiku only if the 21 s wait hurts the demo.

## 6. Valio meeting script (10 min, B-cartfirst)

1. **(1 min) Frame it.** "An assistant inside the Aimo webshop. It turns a request into a priced, stock-checked basket and orders only within a mandate. Everything else waits for a human, with a readable record."
2. **(3 min) The chef's flow (W3 mockups 1 to 3).** The request is "catering for 50 on Friday, salmon soup, rye bread, blueberry pie, lactose-free". Show:
   - the per-guest basis for each line (50 × 120 g = 6 kg)
   - the swaps the chef has to decide, with on-time history and CO₂ (salmon fillet has no Friday delivery, so suggest the C-cut)
   - the honest total and the price hold
   - "review and confirm", then "order placed", grouped by dish
3. **(3 min) Live proof that it's real.** Run the same request against the gateway (or show the logged run: basket b_4dcrue, 14 lines, 4 Valio calls, order o_cslnp7 placed after a fresh re-check). Then the hotel-chain agent asks for 1000 L lactose-free milk (€1,640): the order goes to needs_approval, the agent's own approval gets 403, and Mikko L. approves. Show the audit trail.
4. **(1 min) Openness.** The same handlers are exposed over REST and MCP (`/mcp`). The rules live in the gateway, not the prompt.
5. **(2 min) Ask (TASKS.md S5):**
   - Is photo upload (menu or recipe photo) a must-have?
   - Who approves: the chef or the purchasing manager?
   - Does a passed closing time block that delivery date, or can it roll to the next one?
   - Do big accounts already order system-to-system (EDI/API)?

## 7. Notes

- **Codex CLI could not write files on this machine.** The Windows unelevated sandbox refuses split writable roots, and it needs the elevated Windows sandbox set up once by an admin. So the night's implementation was done by Claude agents, not Codex.
- **Night timeline:**
  - 3 design directions with mockups
  - W1 to W3 polish of B-cartfirst
  - a ~4 h stall (03:00 to 07:00) killed the three demo builds
  - after 07:00: server S2+S3 built and proven live (`738c0d9`), routes wired (`1d12636`), `bun run demos` launcher added (`c865c3e`)
- **Screenshots:**
  - live reviewer runs: `docs/design/night/demos/*/live-*`
  - final console shot: `docs/design/night/demos/console/final/01-request.png`
  - mockups: `docs/design/night/{A-split,B-cartfirst,C-eventplan,W1,W2,W3}/`
- **Merge when ready:** `git switch main && git merge night/2026-11-14`
