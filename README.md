# Helmi: trusted ordering agents for Valio Aimo

An AI ordering assistant in the Valio Aimo webshop that builds priced, stock-checked orders and sends anything outside
the customer's rules to a manager.

Junction 2026 · Valio Aimo challenge "Trusted Trade Agents".

**Live demo:** https://aimo.alekseifilonov.com (each browser gets its own private demo session)

## What it does

A chef asks Helmi, inside the webshop, for *"my usual weekly order"* or *"ingredients for a catering event for 50 people
on Saturday"*. Helmi returns a cart with the customer's prices, stock for the delivery date and quantities rounded to
whole packs. Every line explains why it was chosen: purchase history, a cut-off it would miss, a cheaper pack size.

Behind Helmi is an open gateway (MCP + REST) that any buyer's agent can use. The customer's rules are enforced on the
server, not in a prompt:

- **Spending limits:** €500 per order, €1,500 per day. Above that, the order goes to the named approver (Mikko).
- **Safety:** a declared allergen the customer excludes blocks the product. Allergen or diet status the catalogue
  can't prove goes to the approver; it is never presented as safe.
- **Substitutions:** an unavailable product gets a checked replacement; anything beyond the customer's allowance waits
  for a person.
- **No self-approval:** an agent that tries to approve its own order gets HTTP 403.
- **Audit trail:** every decision is recorded with its evidence, in plain language.

Prices and stock come from Valio's mock API, and only for shortlisted products, never the whole catalogue.

## Try it

On the live demo, pick a starter scenario: the usual weekly order, lasagna for 40, a dinner with a nut allergy,
1,000 litres of lactose-free milk, or an unclear catering request. Open **Mikko's approvals** to approve or send back
orders, and change the customer's rules under **Purchasing policy**.

An outside agent, over MCP:

```bash
node scripts/aimo-agent.mjs order "1000 litres of lactose-free milk by Monday"
node scripts/aimo-agent.mjs approve <orderId>      # the agent can't approve its own order: 403
```

Against the live demo, set `GATEWAY=https://aimo.alekseifilonov.com` and pass `--session <id>`, shown in Mikko's view,
so the order lands in your browser's approval queue.

## How it works

```text
Webshop assistant (React) ──┐
Outside agents (MCP) ───────┼── gateway (Bun + Hono)
REST API (OpenAPI 3.1) ─────┘     intent → plan → catalogue search → Valio price/stock (shortlist only)
                                  → validation (lots, delivery, allergens) → policy (limits, sign-offs)
                                  → order or approval → audit trail
```

Claude handles language and ranks a shortlist; it can't invent products or grant approval. Quantities, pack rounding,
validation and policy are deterministic code. The OpenAPI document is at `/api/v1/openapi.json`; the MCP endpoint is
`/mcp` with five tools (`search_products`, `check_stock`, `build_basket`, `place_order`, `get_order`).

## Run locally

Needs [Bun](https://bun.sh) and the challenge data files (not in this repo).

```bash
bun install && (cd app/server && bun install) && (cd app/web && bun install)
cp .env.example .env          # VALIO_API_KEY (Junction challenge page), ANTHROPIC_API_KEY
# put the Valio challenge files in data/raw/valio/, then:
bun run explore:prep          # builds data/raw/valio/catalog.slim.json
bun run dev                   # gateway :8787, webshop http://localhost:5173
bun run test                  # 146 tests, Valio API and LLM mocked
```

## Limits

- Orders are simulated and stored locally: Valio's API has no order endpoint, so nothing is sent to Valio.
- The hosted demo keeps state in memory, so a long idle period resets it.
- The customer account, purchase history and approver are synthetic demo data.

## Repository

`app/server` gateway · `app/web` webshop assistant · `scripts/aimo-agent.mjs` outside agent · `CONTRACT.md` API and
rule decisions · `challenges/valio-trade-agents` brief and sponsor notes.

## License

MIT
