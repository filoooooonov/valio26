# Demo verification - 14 November 2026

Verified against the already running gateway on :8787 and Vite on :5173, using Playwright's Chromium from video/node_modules. This records observed behavior, not a real Valio order submission.

## Browser run

A Node Playwright session opened a fresh buyer page, filled textarea, clicked the exact Send button, waited for /Review and confirm/, selected the first .chat button matching /^(Use |Order |Keep |Don't order)/ until no open choices remained, then reviewed and submitted. A second page opened ?view=mikko and clicked Approve and send for this request.

Observed output:

- Basket b_m4pyld: 50 guests, four dishes, 15 product lines; 74 candidate products checked in four Valio calls; seven automatic same-use swaps.
- Buyer explicitly chose Salmon fillet c-cut. Total EUR230.15 excluding VAT.
- Order o_8aatyr: pending_approval, then placed; decidedBy Mikko L.; apiCalls 4 across order/approval rechecks.
- Approval was required by the daily limit: previous orders EUR4146.64 + this EUR230.15 = EUR4376.79, above EUR1500.
- GET /api/orders/o_8aatyr/audit: request, plan, search, pick, stock, alternatives, swap, mandate, recheck, order, recheck, decision. Both rechecks covered 15 products/two calls and found no changes.
- Reloading /?b=b_m4pyld&o=o_8aatyr restored the placed order. Clicking /View order/ opened the Audit trail dialog with the named buyer choice and approver decision.

Screenshots: [placed](demo-evidence/placed.png), [audit dialog](demo-evidence/audit.png).

## Outside agent

Command from video/: node record/agent-milk.ts

Observed transcript:

- tools/list: search_products, check_stock, build_basket, place_order, get_order.
- build_basket: 1000 L lactose-free milk for 2026-11-16.
- 1000 x 1 L Valio lactose-free UHT milk; EUR1560; two Valio calls.
- place_order: pending_approval, o_gttfrc; EUR1060 above the per-order limit.
- POST decision as agent:kaleva-procurement: HTTP403, only Mikko L. can approve or reject orders over the mandate.

## Build and checks

Command: bun run build

Output: TypeScript build passed; Vite 6.4.6 transformed 43 modules and built successfully in 859ms. CSS 41.78 kB, JS 307.04 kB before gzip.

Command: node scripts/test.mjs --fast

Output: 38 pass, 0 fail, 141 assertions across four files (1.68s).

## Boundaries and unresolved issues

Legacy claims held by aleksei-claude prevented edits to app/web/ and app/server/. Existing WIP was preserved. Current UI says 'Approved and sent to Valio Aimo' and 'prices and stock held'; the backend only writes an in-memory local order and rechecks availability. No sponsor order API, reservation or guaranteed change window exists here. State these limits in narration.

The hero run showed '40 gluten-free' without such a guest request. Do not present that count as verified input. Candidate counts, dish choices and number of manual swap cards vary with the live planner. No claim was verified about carbon ranking or exactly three alternatives.
