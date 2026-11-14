# HANDOFF.md

Newest first. Write one when you finish anything someone else depends on, or before you sleep.
Format:

```
## 2026-11-14 03:10 · aleksei-claude-api
Done: T4 /api/search returns ranked results (see CONTRACT.md).
State: works locally with `bun run dev`; not deployed.
Next / blocked: needs UI wiring (T5).
Gotchas: embeddings take ~20s cold start.
```

---

## Fri 13 Nov 22:30 · aleksei-claude → next session (in valio26/)
State: repo moved to valio26. Data explorer works (`bun run explore`, http://localhost:4321). Challenge not formally locked yet. Run `/lock-challenge valio-trade-agents`.

Open threads:
1. **Product images.** The data has media IDs only (13,375 products), with no files and no URLs.
   - Open Food Facts by GTIN: ~11% hit rate in a 47-product sample (consumer Valio milks yes; foodservice packs, meat, disposables no). License CC-BY-SA, so attribution is needed.
   - Ask the Valio mentors whether the media IDs resolve to an image URL (Synkka/webshop CDN) and whether we may use them. That is the best fix.
   - Fallback: one generated or stock image per category, labelled "illustrative". Hand-pick real photos for the ~30 demo-path products.
   - Do NOT scrape the Valio webshop without mentor permission.
2. **Category names.** The data has codes only. The first 2 digits are a department (10 dairy, 17 meat products, 18 fish, 21 bakery/dry,
   22 baking/sweet, 41 fresh meat, 52 confectionery, 63 hygiene, 64 disposables, 84/85 drinks, 90 office). Plan: name the 349 categories
   and ~18 departments from sample product names (LLM pass), save to `data/categories.json` (committed, labelled "inferred"), and ask the
   mentors for real names.

S30 recurring-order UI: new Scheduled menus navigation and separate editor; device-local storage only (aimo.scheduled-menus.v1), no scheduler/backend contract changes. Prepare next draft uses existing menu/event review and approval flow; saving/pausing/skipping makes no API calls. Purchasing versus delivery dates use Helsinki time; monthly projections exclude paused/skipped/past purchasing slots. Previous orders reads placed gateway orders and their baskets only. Saved menus reuses local schedule contents. Future integration: durable per-account schedules, worker execution with server-side mandates, campaign service and issue notifications. Automatic purchasing/notifications explicitly marked unconnected in UI. Browser checks: desktop1440x1000, phone390x844, create/edit/reload/pause/resume/skip/delete/repeat/reuse, no API writes, no overflow or page errors, storage and order-load failure handling. No video recorded; screenshots stay in local Temp.

S32: replacement check POST /basket/:id/lines/:lineId/replacements/check refreshes the current SKU and shortlisted pool. No full draft replanning from replacement dialogs. Opt-in recipe proposal plans just one replacement dish (blueberry pie -> apple pie prompt), validates delivery/diets/guest count, and applies to the same basket only after user review. Existing untouched lines and manual quantities stay unchanged; shared ingredients retain other dishes' quantities; stale/locked/expired/replayed proposals reject. LLM failure leaves original unavailable. Repeat order is a Recipe-adjacent pill and native popup with inline calendar/time/location choices. All schedules remain device-local/manual as labelled. Build +62tests pass including5recipe tests; desktop/phone intercepted browser checks confirm no /api/basket replan, no nested dialogs, one stock recheck per open, reduced-motion flow. Gateway currently PID43524 on8787 runs old routes and holds1order; do not restart without the user's pending explicit approval because store.ts is in-memory. No video, no real order mutation.


## S45 trusted purchasing pivot
Preserved the Valio Aimo layouts/assets/tokens and existing scheduled-menu page. Sponsor clarification removed scheduling from the pivot. Added shared direct-product intent, strict scoped REST/OpenAPI and protected MCP/legacy routes in configured auth mode; deterministic safety/price/stock/delivery/lot checks; exact approval revisions; serialized, persisted, explicitly simulated orders; policy settings inside the existing approver view; readable per-product choice evidence in the existing audit dialog.

Run `bun scripts/commerce-demo.mjs` for catering, external milk purchase with denied self-approval, and an unavailable-product substitution. Facts are explicitly synthetic price/stock fixtures over real sponsor catalogue IDs. The CLI prints why each decision occurred. `docs/TRUSTED_COMMERCE.md` contains authentication setup, independent client commands, source distinctions, limitations and the proposed two-minute video sequence. Missing explicit allergen evidence correctly stops catering completion; no hard safety override exists. All orders are local simulations because the sponsor has no order endpoint. Secure sharing requires COMMERCE_PRINCIPALS_JSON; default legacy mode remains loopback-only demo infrastructure.

Validation: 106 tests passed / 0 failed, frontend build passed, desktop1440 and phone390 browser checks passed (direct bypass, no guest prompts, simulated completion, existing scheduled page, no overflow/page errors). Evidence: artifacts/commerce-verification/results.json and screenshots. Existing artifacts/scheduled-redesign were left untouched. Live sponsor re-verification was not completed in this pass; reproducible demos use the labelled fixture.
