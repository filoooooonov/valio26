# DEMO.md: the exact demo script

The live demo is 3 min on stage (Top 5), and the video is 2:00 max. Every step must work from a fresh start.
`/demo-check` walks through this file and marks broken steps.
Rubric weights (HANDOUT.md): end-to-end demo 30 · user need 20 · guardrails 20 · exceptions 15 · openness 15.

## Setup (before going on stage)
1. `.env` has `VALIO_API_KEY` and `ANTHROPIC_API_KEY`, and `data/raw/valio/` is downloaded. Run `bun run dev`, then open the webshop with the assistant at http://localhost:5173.
2. Logged-in demo customer: "Ravintola Demo", with customer-specific prices (`netPriceFound`). The mandate is ≤ €500 per order, no milk allergen in
   substitutes, and approval is needed for any substitution.
3. A second screen is ready for the "external agent" step (terminal with `bun app/agent/run.ts`).

## Script
| # | Say (one line) | Do | Expected on screen | Rubric | Status |
|---|---|---|---|---|---|
| 1 | "A chef at a catering company is in the Valio Aimo webshop on a Thursday night." | Show the Aimo-branded webshop with the assistant panel open | Real Aimo look, customer name, mandate summary | user need | ⬜ |
| 2 | "She just says what she needs, in one line, no chat." | Type *"Ingredients for a catering event for 50 people on Saturday, one vegan option"* | A structured basket of 8–12 lines with quantities scaled to 50, her prices, and per-line stock and delivery date | demo, user need | ⬜ |
| 3 | "We only ask Valio's APIs about what's in this basket, never the whole catalogue." | Open the "why" drawer on one line | Reasoning: matched product, quantity maths, price/availability call for just these SKUs, delivery reliability, CO₂ label | openness, explain | ⬜ |
| 4 | "Cream is short for Saturday. The agent doesn't fail, it proposes good / better / best." | Point at the flagged line | Partial stock shown, with three substitutes ranked on allergens → delivery → price → CO₂ | exceptions | ⬜ |
| 5 | "Within her mandate, the agent can place it. A substitution and a total over €500 need her sign-off." | Click "Send for approval" | Approval card listing the violations in plain language; total vs limit | guardrails | ⬜ |
| 6 | "One click, and it's an order at fixed prices, with a full audit trail." | Approve | Order confirmed; audit log shows request → lookup → order → approval, with who and why | demo, explain | ⬜ |
| 7 | "Same gateway, open standard: an outside agent ordering 1,000 L of lactose-free milk gets the same rules." | Run the external agent over MCP | It gets a quote, its order escalates on the same mandate, and the request shows in the same approval queue | openness, guardrails | ⬜ |

Status: ✅ verified (with time) · ❌ broken · ⬜ untested

Stretch (only if steps 1–7 are ✅): photo upload ("snap the fridge / a menu") → basket.

## Fallback
If the live demo fails, play the recorded video at `<link>`.
