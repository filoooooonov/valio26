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

## Demo verification follow-up (14 Nov)
- [ ] S13 @aleksei Remove false sponsor-submission, stock-reservation and guaranteed change-window copy; orders are local because sponsor has no order API (rubric: openness, guardrails) - files: app/web/src/components/OrderPanel.tsx, Mikko.tsx, Chat.tsx, thread.ts
- [ ] S14 @aleksei Check unrequested gluten-free guest count in the hero basket header; do not infer guest dietary requirements from planned dishes (rubric: user need) - files: app/web/src/format.ts, components/OrderPanel.tsx

S4/S7 browser flow verified live on 14 Nov; detailed evidence: docs/demo-verification.md. Existing app claims prevented these wording fixes.

Video setup and captioned demo completed locally by the second agent: artifacts/demo-video/final.mp4 (50.70s, 1080p H.264); checker passed buyer placement/audit, real MCP self-approval rejection and human approval. Reusable commands: tools/demo-video/README.md. S10 remains open for valio-voice/pitch; app copy follow-ups S13/S14 remain blocked by existing claims. Evidence publication was rejected by automatic approval review; files remain local.

- [x] @aleksei-codex S15 Smooth demo video: larger cursor, eased mouse travel, click feedback, eased camera zooms, transitions and readable pacing; hands-on demo instructions (rubric: demo) - files: tools/demo-video/, DEMO.md. Local-only revision; evidence publication remains blocked by automatic review.

- [x] @aleksei-codex S16 Product-list cleanup requested by user: compact details disclosure, calmer brand status colors, hide chat scrollbar, alternatives only for problem items. User explicitly authorized app/web takeover from earlier Claude session. Files: app/web/src/components/OrderPanel.tsx, app/web/src/app.css.

- [x] @aleksei-codex S17 Menu-first chat: suggest editable food categories/descriptions, let buyer select/remove/add fruit or other categories, require explicit menu approval before any basket/product/price/stock fetch; approved categories constrain the live planner. Files: app/web/src/App.tsx, components/Chat.tsx, MenuProposal.tsx, menu.ts, app.css.

S15-S17 complete locally: smooth preview 107.05s preserved; no re-recording after user stop. Compact cart desktop/mobile verified; menu edits make zero lookup requests before approval. Approved live basket b_n7xiqe includes croissants, soft drinks and fruit; removed chips/candies absent. Build passed and fast suite 38/38. No generated evidence published.

- [x] @aleksei-codex S18 Reject incomplete menu plans before catalogue/API calls, retry once with missing-dish feedback. Audited user regression b_0izcss: three dishes but one ingredient and no warnings. Files: app/server/src/plan.ts, llm.ts, menu-completeness.test.ts. Local-only work.

S18 verified live using the exact user event request: HTTP200 basket b_hw3qny has all three menu groups and13 product lines, including tomato, cucumber, fillings, chips, candy and Pepsi. Regression suite41pass0fail. New request needed after backend watch reload.

- [x] @aleksei-codex S19 UI polish: gentle fetched-product entries, stable images on disclosure, cleaner catalogue display names with originals retained, dedicated local-order confirmation and green chat success, respectful smooth scrolling and immediate own messages. Desktop/mobile/reduced-motion checked; build and41tests pass.
- [x] @aleksei-codex S20 Labelled synthetic Minun Aimo profile opt-in: sample selling price, recipe-package cost target and operating EBITDA; approved planner context plus live basket food-cost comparison and verified cheaper options. Live b_ikq9jc9products, zero lookup before approval, cost3.97/guest vs sampletarget3.75. Source is sample data, no account integration; savings already included in proposed estimate are labelled. No video recorded.

- [x] @aleksei-codex S21 Frozen product indicator: accessible muted snowflake beside product names, catalogue storage metadata with explicit-name fallback only when labels absent, follows substitution SKU, ambiguous storage stays unmarked. CONTRACT own localcommit f09640a before code; build passes,43tests pass. No video recorded.

- [x] @aleksei-codex S22 Menu editor design pass:32px roundcheckboxes, whole-rowselectionwithdishicons, accurateAdddishoritemcopy, smoothnativeEditpopupwithSave/Cancel/Escape/focusreturn/reducedmotion, mobilefit andzeroAPIbeforeapprovalverified.
- [x] @aleksei-codex S23 Deliveryissues: compactoriginalproblem with restrainedredicon, Nov20date, unboxedrealproductimage+replacementfacts+relativeprice andtruck; no QuestionN headings. Findanother performsrealreplanwithreviewbeforereplacingbasketandexplicitnoresult/errorfeedback.
- [x] @aleksei-codex S24 Demo brand assets/typography:officialAimo32pxfavicon, self-hostedGeistfonts+OFLlicense, cleanedproductnamesdisplayCAPS, month-firstdates andtruckdeliveryicons. No video recorded; generatedscreenshots/evidence remainlocal.

S22/S23 final refinements: menu white against lavender; whole-row selection and32px circles verified; menu icons subsequently removed per user request. Edit popup has300ms easedentry and reducedmotion. Live Findanotherreplan producedreviewabledraft while original b_tzpfc4 remainedunchanged. Favicon andselfhostedGeistloaded, capsproductnames/month-firstdates/truckicons checked. No recording or credentialstorage.

- [x] @aleksei-codex S25 Menu review floats above the composer, dims/inerts chat history, contains scrolling, preserves chat edits, and closes/reopens with focus return. Desktop1600x1000, mobile390x844 and short1366x700 verified; zero product requests before approval. Menu icons removed, row alignment fixed, progress track uses blueberry. Thinking mark loops a continuous eased draw/erase mask with static reduced-motion fallback.
- [x] @aleksei-codex S26 Chat only announces missing items and links to a separate native replacement popup. Cart missing rows retain original products and open the same popup. Explicit radio selection, checked stock/quantity/cutoff, product photos and relative price; no selection accepted on open. Find another is connected; revised whole-draft choices also move into their own popup. Read-only live-basket checks plus intercepted revised-draft response verified; no basket/order mutation or new video recording. Shared delivery summary under confirm; product dividers removed while dish dividers remain. Build and43fast tests pass.

- [x] @aleksei-codex S27 Unavailable cart rows hide product details and disabled steppers; visible Choose replacement/Review options actions replace the icon-only swap control and redundant status pill. Hover affordance and keyboard-focus action; live read-only desktop/mobile checked. Menu review, menu editor, replacement and revised-draft popups retain their DOM through200ms eased dismissal, with reduced-motion immediate closure. Escape/backdrop/action timing checked; no live basket/order changes or video recordings.

- [x] @aleksei-codex S28 Issue CTA now resolves counted product issues before review/order; no Nothing is ordered yet footer. Replacement popup compares original photo/name/quantity/total -> selected photo/name/quantity/total with explicit price difference; no choice on open. Initial yellow experiment superseded by Pen concept C5KNi: photo-led white chat rows, restrained attention dot, lavender cart rail and plum issue CTA. Product issues remain linked to the same native popup.
- [x] @aleksei-codex S29 Anchored event-details popup asks only missing guest count and dietary/allergy requirements, with counter/checklists/explicit none; optional budget and notes. Delivery picker and navbar share selected sample place, interactive map, future date and time. Known answers reuse navbar context; confirmed constraints and date reach the real planning API only after menu approval. Desktop/mobile/no-lookup-before-approval and intercepted request assertions pass. Optional Apple MapKit JS ready via domain-scoped VITE_APPLE_MAPS_TOKEN; no live token supplied/verified, working OSM fallback retained. No recording or push.

- [x] @aleksei-codex S30 Scheduled menus overview and separate create/edit screen: weekly weekdays, purchasing lead/time versus delivery, guest/diet/location details, review threshold, monthly estimates, pause/resume/skip/delete, Repeat this order, saved-menu reuse and gateway previous-order entry. Device-local persistence and manual draft preparation are explicit; unattended scheduling, account sync, campaign pricing and notifications remain unconnected. Desktop/mobile workflows and failure states verified; build and calendar tests pass.

S28/S29 verification: build passes;46fast tests pass with186assertions. Pen C5KNi saved with live desktop/phone previews. Actual issue-photo hook uses exact SKU images when available; b_5gzrni's two unavailable originals have no sponsor image URLs and retain honest icon fallbacks. No new recording or push.

- [~] @aleksei-codex S31 Redesign recurring-order editor as narrow, compact form with inherited-menu summary, clear delivery/purchasing groups, optional cost disclosure and inline date preview. (rubric: user need)
