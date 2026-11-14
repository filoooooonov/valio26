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
