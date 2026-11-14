# Helmi: prioritized QA report

## Latest verification: existing commerce workflows and preference corrections

Executed the requested `bun scripts/commerce-demo.mjs` before and after the preference fix. Both runs passed. Latest synthetic take uses the separate ledger `data/commerce/demo-1794696788501.json`:

| Scenario | Verified result | Human intervention |
| --- | --- | --- |
| Direct structured purchase, 1,000 l milk | DIRECT_PURCHASE, no dishes; EUR1,000; PENDING_APPROVAL then CONFIRMED, `SIM-o_sdq1nz` | Separate approver required above EUR500; purchasing-agent self-approval refused with HTTP403 |
| Unavailable milk candidate | Excluded candidate; next valid quoted product selected; 20 x 1 l; EUR20; CONFIRMED, `SIM-o_zndogd` | No extra approval for this synthetic, fully validated, within-policy take |
| Catering with peanut restriction | DRAFT; submission refused with HTTP409 for missing allergen/diet/quantity evidence | Resolve missing evidence or change requirements/products; financial approval cannot waive hard safety constraints |
| Historical cream preference | Existing tests pass: B accepted three times ranks above rejected C, rejected C remains reviewable, prohibitions remain hard constraints | Choosing a replacement is distinct from order approval; future substitution permission remains explicit |
| Current sponsor-backed milk (`bun --env-file=.env scripts/commerce-demo.mjs --live`) | DIRECT_PURCHASE; EUR1,010 for 1,000 l, unknown stock; DRAFT. Twenty-litre request EUR20.20, unknown stock | Human stock sign-off and, for the large order, financial approval. Existing live runner stops at these checks; no live confirmation was produced |

Targeted baseline tests: **73 pass, 0 fail** across commerce, preferences, orders, cartHistory, comparison and intent. Additional edge-case tests then reproduced two real preference defects: repeating a substitution inflated acceptance counts and could reset an edited quantity; changing an accepted alternative left the earlier acceptance effective.

Fixed these in `app/server/src/plan.ts`, `preferences.ts` and `cartHistory.ts`: retries are idempotent for the same actor; a human can still acknowledge an agent-selected alternative without resetting quantity; choice evidence is scoped to the cart line; changed/removed choices replace effective evidence; undo restores the previous line's evidence without affecting another line or synthetic history. Existing permissions are unchanged. Added four regressions in `choice-memory.test.ts`, including same-timestamp choices and removal/undo. An intermediate full run caught the human-acknowledgement regression introduced by the initial retry guard; corrected it and reran successfully.

Post-fix full suite: `node scripts/test.mjs --fast` **134 pass, 0 fail**, 756 assertions, 20 files. `bun run build` passed. All confirmations above are local simulations; synthetic price/stock fixture is explicitly labelled. No workflow was rebuilt and no purchasing feature was added.

User-requested visual follow-up: reused the existing kit `AimoLogo` in the empty right-hand workspace, centered at **180px wide / 10% opacity** after the requested size reduction. The mark ignores pointer input, is hidden from assistive technology and disappears when a cart is displayed. Changes: `OrderPanel.tsx`, `app.css`, two tokens in `tokens.css`. Browser checked at 1440x1000 and 390x844: centered in usable workspace, no overflow; absent on existing populated cart. Local screenshots: `artifacts/final-qa/empty-watermark-1440.png` and `empty-watermark-390.png`. Existing Vite process was unavailable; started the normal frontend development command for browser verification.

## Follow-up: usual-order routing fixed

After the inspection, the user authorized fixing the history-routing bug. Corrected the malformed reorder regex patterns in `app/server/src/intent.ts`: doubled escapes and invisible backspace characters used instead of word boundaries. Preserved the pre-existing shared last-week/scaling implementation and left `reorder.ts` untouched. Added `intent.test.ts` for the five exact requested reorder variants, additional history phrases, and unchanged menu/direct-product routing.

Verification after this fix:

- `bun test app/server/src/intent.test.ts app/server/src/preferences.test.ts`: **20 pass, 0 fail**.
- `node scripts/test.mjs --fast`: **130 pass, 0 fail**, 737 assertions across 19 files.
- `bun run build`: **pass**.
- Real Chromium desktop request `Prepare my usual weekend order.`: HTTP200 `/api/basket`, intent `REORDER`, 12 history-derived product lines, median milk quantity 21, no `/api/menu` request. Basket `b_nkvydc` uses sponsor mock quotes. Existing saved standing cream permission and daily spending were preserved, so this take correctly applied the permission and required existing-policy sign-off; no order was submitted.
- The existing gateway was unavailable during the first browser attempt. Started its normal `bun run dev` command in `app/server`, retaining configured persistent storage; no reset performed. Browser retry passed.

This follow-up resolves the P0 below and its 14 cascading test failures. The rest of this document records the earlier baseline; remaining summary/preference-history findings have not been changed by this targeted fix. UI/branding unchanged.

Inspection pass, 15 November 2026 (Europe/Kyiv). No application source changes made in this pass. This is a baseline report, not a final release certification.

## A. Test results

| Executed command/check | Result |
| --- | --- |
| `git status --short` | Pre-existing modifications: `app/server/src/intent.ts`, `app/server/src/reorder.ts`. Preserved. |
| `git pull` | Already up to date. |
| `node scripts/test.mjs --fast` | **114 pass, 14 fail**, 128 tests, 665 assertions. All failures in `preferences.test.ts`. |
| `bun test app/server/src/preferences.test.ts` | **4 pass, 14 fail**, independently reproduces purchase-memory failures. |
| `bun test app/server/src/commerce.test.ts` | **18 pass, 0 fail**, 101 assertions; authentication enabled with distinct test credentials. |
| `bun run build` | **Pass**: TypeScript and Vite production build, 78 modules. |
| `bun scripts/commerce-demo.mjs` | **Pass**, isolated authenticated HTTP gateway; actual catalogue, explicitly synthetic price/stock fixture; separate ledger `data/commerce/demo-1794695349130.json`. |
| `bun --env-file=.env scripts/commerce-demo.mjs --live` | Exit 0. Sponsor-backed menu remains DRAFT with missing evidence; 1,000 l milk DRAFT at EUR1,010 with unknown stock. Script skips submission/approval when any checks exist: this run does **not** verify live approval or confirmation. Separate ledger `data/commerce/demo-1794695360014.json`. |
| Existing Playwright installation, Chromium, initial page at 1440x1000 and 390x844 | No horizontal document overflow and no page JavaScript errors. Existing branding/layout retained. |
| Playwright desktop: send `Prepare my usual weekend order.` | **Fail**: POST `/api/menu`, no basket request. Assistant says it cannot see past orders and opens guest/diet/event collection. |
| POST `/api/stock`, account 123, SKUs 476880/464249/469162, dates 2026-11-16, 2026-11-20, 2026-11-23 | HTTP200 for all. Sponsor source preserved. A cutoff passed; B/C deliverable but stock unknown. Every date returned availability dated November 16. |

Browser checks used the existing `video/node_modules/playwright/index.mjs` installation through inline Node scripts; no dependencies added. One preliminary selector using a literal ellipsis was converted by the shell and timed out; rerunning with the textarea selector reproduced the application failure successfully.

Authenticated commerce tests cover below/above-limit decisions, self-approval refusal, customer scope, policy tampering, cookie-origin checks, unknown stock sign-off, missing price/cutoff, unavailable products, changed-price approval invalidation, revision contents, concurrent duplicate submissions, hard allergen/category/delivery restrictions, rejection, malformed JSON/calendar dates, simulation provenance and restart persistence. They use synthetic upstream responses; they do not prove production fulfillment or stock confirmation.

## B. Issues found, in priority order

### P0: Usual orders go to menu planning

- Reproduced by tests and real desktop browser with the exact requested prompt.
- `intent.ts` contains doubled escapes such as `\\s` and `\\w` inside regular-expression literals in `REORDER_RE`, `LAST_WEEK_RE` and `SCALED_TRADE_RE`. These match literal backslash sequences instead of whitespace/word classes.
- This breaks history-derived basket preparation and prevents meaningful end-to-end cream/preference verification. Fourteen current preference tests fail, mostly as consequences of this routing error; they are not fourteen independent root causes.
- Intended fix: correct escapes while preserving the existing intent hierarchy and the uncommitted work, then add exact-prompt regressions for usual weekend, same products as last week, dairy, extra milk and increased trade. Shared frontend/server import means this correction can repair both entry paths without a UI redesign.
- Files: `app/server/src/intent.ts`, `reorder.ts`, existing/new regression tests.

### P1: Summary mixes products and order-level approval conditions

- Source-confirmed: `summary.ts` increments `attention` once per unresolved/blocking product, again for grouped unknown-stock sign-off, and again for spending limits. `DecisionSummary.tsx` labels the resulting count “needs you / need you”.
- Thus one unresolved product plus a spending approval can appear as two peer items, without identifying that one is an order-wide condition. Stock sign-off can also overlap usual/adjusted product counts.
- Existing tests encode mixed semantics and must change alongside implementation, rather than merely changing their expected numbers to match a demo.
- Intended fix: retain product classification precedence, explicitly distinguish product review from order approvals, keep price information nonblocking, and assert counts against underlying records. Update existing kit component/callers only.
- Files: `summary.ts`, `preferences.test.ts`, `app/web/src/ui/DecisionSummary.tsx`, frontend API types and callers as needed.

### P1: Changing a substitution can duplicate preference evidence

- Source-level finding requiring an executable regression after intent repair: `plan.ts` appends `substitution_accepted` on every `chooseOption`, including repeat selection or changing an already decided option. It does not retract the previous decision on that line.
- Undo retracts the last accepted choice for the entire basket using its timestamp, rather than an explicit line/choice identifier. Changing a decided option and undoing it is not covered by the current undo condition, which only retracts when restoring an undecided issue.
- Intended fix: first reproduce same-option retry, B-to-C change, undo and multiple-line changes; then make recorded choices match effective decisions without modifying synthetic history or substitution permissions.
- Files to investigate: `plan.ts`, `preferences.ts`, `cartHistory.ts`, corresponding tests. This is not yet an observed live corruption incident.

### P1: Live demo runner does not demonstrate approval when stock is unknown

- Executed live runner prepares the correct direct-purchase intent and 1,000 x 1 l at EUR1,010, then skips submission because `stock_unknown` is present.
- Backend policy explicitly permits submitting unknown stock for authorized human sign-off. The existing live runner's green overall PASS must not be described as evidence that live approval/confirmation occurred.
- Intended fix: targeted runner assertion/branch adjustment to distinguish hard blockers from human-sign-off checks; preserve all backend policy checks. Alternatively demonstrate the already verified synthetic HTTP scenario with source disclosure.

### P1: Delivery evidence is fixed mock data, not exact-date fulfillment

- Real sponsor mock A: cutoff November 12 at 15:00 +02:00, November 16 availability, `cutoffPassed: true`, `deliverable: false`; its current quote is also not marked customer-specific.
- B/C: November 15 at 17:00 +02:00 cutoff, November 16 availability, customer-specific quote flags, unknown stock. B EUR2.63, C EUR1.79 per 1 l sales unit in this run.
- Later requested dates return the same schedule. `valio.ts` accepts a schedule on or before the requested date; it does not verify an exact November 20/23 delivery slot. The source documentation explicitly describes permanent mock cutoffs.
- Do not claim guaranteed delivery, invent stock failures, or change sponsor responses. Use November 16 for the documented scenario and disclose synthetic sponsor schedules. Recheck after any upstream changes.

### P2: Default empty-state guidance emphasizes menu planning

- Verified initial desktop/mobile copy asks what the customer is cooking; cart copy mentions “Friday stock”. This is confusing for direct buying/usual-order entry, although the usual-order quick action exists.
- Only consider a small wording correction after the routing fix. Preserve logo, colors, purple chat, workspace, controls and responsiveness.

### P2: Demo documentation contains obsolete instructions

- `DEMO.md` still names the older Kaleva account and mixes historical recordings with current instructions. `docs/TRUSTED_COMMERCE.md` comparison labels also differ from current `Compare alternatives` / `How Helmi decided` labels.
- Use current implementation and this report as evidence; do not present old recordings as verification of this working tree.

## C. Fixes implemented

None in application code, following the takeover instruction to inspect, explain intended changes and prepare a report first. Added this report only. No redesign, new dependencies, credential edits, reset, commits or publication. Existing uncommitted changes were not overwritten.

The team board still reports Claude's claims on intent/reorder/summary and related tests. File claims were respected. Takeover of those claims must be resolved before edits; the user reports Claude reached its usage limit.

Recommended implementation sequence: intent repair and exact-prompt tests; summary semantics; effective-choice preference regression/fix; live demo runner coverage; focused browser review of the repaired paths. Re-run fast suite and production build after targeted changes.

## D. Remaining limitations

- This inspection is not complete final QA. Usual-order cart, cream approval, alternative comparison, spending approval, confirmation, reset recovery and failure UX have not all been exercised interactively. The routing blocker prevents the intended starting flow.
- The five exact reorder variants are not all passing or browser-verified. Typical-quantity/package calculations must be retested after intent repair. Existing deterministic tests cover median quantities, extras and scaling but currently fail upstream of those assertions.
- No reset was run against the existing demo gateway. It clears baskets, orders, audit, live preferences, permissions and policy overrides; it is destructive to demo history. Use an isolated ledger for independent takes.
- `DEV_TOOLS=1` enables a global reset. In authenticated mode the route has no additional admin-role guard. Keep it disabled outside isolated local testing; its behavior is not a secure multi-account administration mechanism.
- Legacy unauthenticated localhost mode is preserved and is not evidence of secure delegated buying. V1 always requires credentials; security conclusions above come from authenticated tests.
- Sponsor APIs are challenge mocks, and the sponsor ignores customer IDs. `netPriceFound` is mock pricing evidence, not proof of production account integration. History is synthetic; it cannot establish allergens, stock or delivery.
- Sponsor has no order endpoint. All confirmations are local simulations. The successful authenticated synthetic run produced `SIM-...` records; nothing was ordered from Valio Aimo.
- Browser environment had the app already running. No production server or existing ledger was restarted/replaced. Read-only stock calls and one menu request were made to the existing app; isolated demo ledgers retain separate test artifacts.
- Backend error, impossible delivery, no-match, no verified substitute, quantity edit after substitution and changing preference choices still need additional focused coverage before final certification. Existing passing tests cover several policy failures, not all requested interactive recovery cases.
- Local ledger is single-process prototype storage, not a transactional production order database. Authentication is configured bearer/session delegation, without production identity lifecycle or SSO.

## E. Demo readiness and verified steps

### 1. Usual weekend order: currently blocked

Open `http://localhost:5173/?date=2026-11-16`, start New order, send `Prepare my usual weekend order.` Current verified outcome is incorrect menu/event collection. Do not present this as working until the P0 is fixed and the history-derived cart is verified.

### 2. Preferred cream unavailable to substitution approval: partial evidence only

The actual sponsor mock verifies cream A's cutoff exception and B/C's customer-price/delivery evidence for November 16. Baseline preference unit tests establish B accepted three times and C declined once. The combined customer flow is blocked by intent routing; no reliable end-to-end UI instructions can yet be certified. Stock remains unknown even for B, so accepting B must remain distinct from final stock/order sign-off.

### 3. External direct purchase: verified deterministic HTTP demonstration

From repository root, run `bun scripts/commerce-demo.mjs`. It starts its own loopback authenticated server, uses real catalogue attributes with explicitly synthetic price/stock facts, and a new isolated ledger. Scenario 2 requests 1,000 l lactose-free milk, bypasses menu generation, validates package maths and produces an approval-bound purchase. It also verifies duplicate submission replay. This command passed during this inspection.

For real sponsor quote evidence run `bun --env-file=.env scripts/commerce-demo.mjs --live`. This run verified a 1,000 l / EUR1,010 draft requiring stock sign-off. It did not demonstrate successful live submission or approval. Do not promise an automatic confirmed order.

### 4. Human approval above purchasing authority: verified deterministic HTTP demonstration

Use scenario 2 of `bun scripts/commerce-demo.mjs`: EUR1,000 exceeds EUR500 authority, purchasing-agent self-approval receives HTTP403, a separate designated approver approves the exact revision, and state becomes `CONFIRMED` with a `SIM-...` reference. The script asserts these transitions using the shared HTTP/backend engine. Disclose synthetic facts and local simulation aloud. No browser approval ceremony has been certified in this pass.

For manually configured authenticated clients, existing `scripts/commerce-client.mjs` supports `milk 2026-11-16`, `submit REQUEST_ID`, `get REQUEST_ID`, `audit REQUEST_ID`, and `approve REQUEST_ID REVISION_SHA256`; approval requires the separate configured approver token. These manual commands were inspected, not separately executed in this pass.
