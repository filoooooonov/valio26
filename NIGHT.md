# NIGHT.md: overnight brief (Sat 14 Nov 2026, ~01:00 → morning)

aleksei is asleep. Work autonomously from this file. Don't ask questions: decide, log the decision in `NIGHT-LOG.md`, continue.

## Goal by morning
1. **The best-looking, easiest order-builder design** for Valio Aimo, ready to show them in the morning (pen.dev, 1440×900 screens).
2. **A working UI** of that design in `app/web`, running against the real gateway in `app/server` (`bun run dev`).
3. `MORNING.md`: what changed, reviewer scores, the recommendation, open decisions for aleksei, and a script for the Valio meeting.

## What Valio wants (source of truth, read these)
- `challenges/valio-trade-agents/HANDOUT.md`: official brief + rubric (demo 30 · user need 20 · guardrails 20 · exceptions 15 · openness 15).
- `challenges/valio-trade-agents/MEETING-2026-11-13.md`: Valio's own words, at least as important as the handout.
- In short: an **assistant inside the existing Aimo webshop**. A chef describes the need ("ingredients for a catering event for 50 people on Saturday"), or uploads a menu photo. The result is a **structured basket**, not a chat transcript: products, quantities, the customer's own prices and live stock. The chef fixes issues **in the cart** and approves. Spend rules and swaps are enforced by the gateway, not by the LLM. Outside agents (a hotel chain's procurement system) use the same gateway over MCP: that's one short demo beat (~15%).
- aleksei's own feedback: the earlier mockups had **too much going on and were not easy to use**. Simplicity wins. Fewer things on screen, one obvious next action.

## Design rules
- **Valio Aimo brand, exact:** `docs/design/valio-inspo.md` + `app/web/src/theme.css`. Teal `#005670`, lime `#c0e021` only for the main CTA, lavender `#eee8f5` / light-blue `#f2f7f8` canvases. Fonts: National (headings, condensed, bold) and Matter (body). Both are available in pen.dev in `valio.pen`. Square-cornered uppercase buttons on valioaimo.fi; the B2 mockups use rounded pills. Either is fine if it's consistent.
- **Screens are 1440×900.** Long lists (the cart) scroll inside their panel: clip it, add a thin scrollbar and a bottom fade.
- The pen document is `file:///C:/Users/alexf/.pencil/documents/f3de8354-7221-4004-b7a5-a6665154b3b5/valio.pen`. **Never edit or delete existing frames.** Only add new top-level frames at the coordinates you're given. Existing references worth looking at: `B2 Order draft from chat` (EYXAt, aleksei's layout), `B2 v2` (icO2b, reviewer fixes), the captured `www.valioaimo.fi` page (LHQsi; the real Aimo logo is node HNO8b, copy it).
- Product photos: real valioaimo.fi photo URLs are allowed (mentors said yes). See `data/raw/valio/images.cache.json` (gtin → img). Stock photos are fine for mockups.

## Facts from the live API (use them, don't invent the opposite)
- For delivery Fri 20 Nov: **salmon fillet (461814), potatoes (460478), blueberries (461154) have NO delivery date**, so real substitutes are needed. Lactose-free vanilla sauce 462524 is a Terminal item with a **passed order cut-off**.
- Food VAT is **13.5 %**. Show totals "excl. VAT".
- Only some products have a customer-specific price (`netPriceFound`).
- Stock items often report placeholder "infinite" amounts. Terminal = supplier warehouse, quantity unknown.

## Code rules
- Branch **`night/2026-11-14`** only. Commit small (`area: what changed`) and push this branch. Never touch `main`, never force-push.
- Server: `app/server` (Bun + Hono). Already built: `catalog.ts` (local search, diets) and `valio.ts` (price/availability for shortlisted SKUs, cached, call log). Shapes: `CONTRACT.md` v1. You may update CONTRACT.md on this branch.
- LLM: use the Claude API (read the `claude-api` skill first). Check whether `ANTHROPIC_API_KEY` is set **without printing it** (`bun --env-file=.env -e "console.log(process.env.ANTHROPIC_API_KEY ? 'set' : 'missing')"`). If it's missing, build the LLM path anyway, plus a clearly labelled deterministic fallback planner (recipe templates) so the demo runs.
- Tests: `node scripts/test.mjs --fast` must stay under 10 s and green. Run the app and verify it in the browser (gstack `/browse`, never the claude-in-chrome tools). Never claim something works without running it.
- Don't message Valio, Ayaan or the team board. Don't change settings, permissions or CLAUDE.md. Don't read or print `.env`.

## Output locations
- Design screenshots: `docs/design/night/<direction>/*.png` (pen `Export`).
- Log: `NIGHT-LOG.md` (append: time-less is fine, `[phase] what · why`).
- Morning brief: `MORNING.md`.
