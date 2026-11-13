# Valio Aimo printed handout (Fri 13 Nov): transcribed

Photo provided by aleksei. This is the **official** brief and overrides anything inferred in BRIEF.md.

**Valio Aimo | Junction 2026 Challenge: Trusted Trade Agents.**
Build the prototype that lets an **AI purchasing agent** buy food from a wholesaler: safely, openly, and with the right human approval.

## The idea
Ordering is moving from people clicking through a webshop to **AI agents buying on their behalf**. Valio Aimo serves 20,000+
professional kitchens with 25,000 products from 700 suppliers. We want to define **how an outside agent can work with our
systems** on open standards, not inside someone else's black box.

## The flow your solution must run
1. **Request**: the agent asks for what the buyer needs.
2. **Lookup**: find products, prices and availability.
3. **Order**: commit at a fixed price.
4. **Approval**: the agent decides, or a human signs off.

Example: a hotel chain's agent asks, *"I need 1,000 litres of lactose-free milk by Monday. Find an option that meets our
requirements based on price and availability."*

## Must build (core)
1. **Lookup**: structured search of products, prices and availability.
2. **Request and order**: from inquiry to commitment at fixed prices.
3. **Permissions and approval**: what the agent decides alone, and what a human signs off.

## Bonus ideas (optional)
- **Compare more than price**: delivery reliability and sustainability labels.
- **Handle exceptions**: partial availability and substitutions when the exact request cannot be met.
- **Explain decisions**: a human-readable record of what the agent did and why.

## How we judge
| Criterion | Weight |
|---|---|
| Working end-to-end demo | **30%** |
| Solving the user's need | 20% |
| Autonomy and controls (guardrails) | 20% |
| Robustness to exceptions | 15% |
| Openness and path to production | 15% |

"Trust and openness by design: a full flow that works, a clear model for human sign-off, and open, well-documented choices.
**Not** a production-ready system in 48 hours."

## You get
Pricing and availability mock APIs. Product data, delivery reliability and carbon footprint files. Mentors for AI, wholesale and data governance.

## Good to know
- We mock today's webshop, **not** the marketplace.
- It is **not a chatbot**.
- **Query the APIs only when needed, never for all products.**

## Prizes
1st: EUR 4,000 · 2nd: EUR 2,000 · 3rd: EUR 1,000.
