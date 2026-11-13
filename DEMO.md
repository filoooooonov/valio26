# DEMO.md: the exact demo script

The live demo is 3 min on stage (Top 5), and the video is 2:00 max. Every step must work from a fresh start.
`/demo-check` walks through this file and marks broken steps.

## Setup (before going on stage)
1. `.env` has `VALIO_API_KEY`, `ANTHROPIC_API_KEY`; `data/raw/valio/` downloaded. `bun run dev` → console at http://localhost:5173.
2. Mandate for `kitchen-agent-1`: ≤ €500/order, lactose-free substitutes OK, no milk allergen in substitutes.
3. Terminal with the buyer agent ready (`bun app/agent/run.ts`), split screen next to the console.

## Script
| # | Say (one line) | Do | Expected on screen | Status |
|---|---|---|---|---|
| 1 | "Kitchens will soon send AI agents to buy for them. Valio needs to let them in without handing over the keys." | Show the console: empty queue, mandate panel | Mandate for kitchen-agent-1 visible | ⬜ |
| 2 | "A school kitchen's agent needs 1,000 L of lactose-free milk by Monday." | Run the agent with that request | Audit log: `quote` event; agent receives 3 offers | ⬜ |
| 3 | "Every offer is signed: stock snapshot time, origin, price. The agent verifies, not trusts." | Click an offer in the log | Offer card: good/better/best, partial stock on the cheapest, "signature verified" | ⬜ |
| 4 | "A small top-up order fits the mandate, so it goes straight through." | Agent orders a 40 L top-up | Audit: `order_placed` within mandate, no human needed | ⬜ |
| 5 | "The main order is over its €500 limit, so the gateway escalates instead of trusting the agent." | Agent orders the main offer | Approvals queue: pending order with violation "total > maxOrderEur 500" | ⬜ |
| 6 | "The buyer sees why, in plain language, and approves with one click." | Click Approve | Status → approved; audit log shows the full human-readable trail | ⬜ |
| 7 | "Open standards: MCP for agents, signed offers, and mandates as credentials. Any agent, same rules." | Show `/.well-known/gateway-key` + audit export | Public key + JSON trail | ⬜ |

Status: ✅ verified (with time) · ❌ broken · ⬜ untested

## Fallback
If the live demo fails, play the recorded video at `<link>`.
