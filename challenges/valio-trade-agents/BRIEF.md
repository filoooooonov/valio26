# Trusted Trade Agents (Valio Aimo, track 106)

**Problem:** Valio Aimo (a food-service wholesaler with 20k+ professional kitchens and 25k products) needs to let **external
autonomous purchasing agents** find products, compare offers and place orders without exposing real systems, confidential
data or its roadmap. Prototype the **interface and operating model**, built on open, verifiable standards. This is **not** a chatbot in place of the webshop.

**Core requirements:**
1. Product, price and availability lookup.
2. Request price and availability, then **place an order** (fixed prices, no negotiation).
3. **Permissions and human approval:** what the agent decides alone vs what needs human sign-off.

**Optional:** delivery-time and sustainability comparison (certificates, category CO₂ ranges), substitution and exception handling,
traceability and explainability.

**Example:** "1,000 L lactose-free milk by Monday, best on price and availability." The system returns structured offers, then the agent orders within its authority or escalates.

**Judging:** _no explicit rubric in the brief._ Infer it from the "problems to tackle": a **trust protocol** (minimum verification so
the agent can trust stock, price and origin), a **guardrails model** (spend thresholds, substitutions), **response logic** (partial
availability, good-better-best substitution), and an **audit trail** (human-readable log). ⚠️ Ask the mentors for the actual criteria on Friday.

**Resources:** synthetic catalog, simulated suppliers, and mock APIs (prices, availability behaviour, lead times, sustainability
certs). Nice to have: agentic payments (x402, Nevermined) and verifiable credentials.
**Mentors:** Hanna Forsström, Pirjo Kaartinen, Minni Ruhtinas, Tommi Nurmi-Aro, Ville Takanen, Riku Tapper.
**Prizes:** TBC. **Deadlines:** event-wide.

Note: the `valio_aimo_*_junction_2025` files in Downloads are from **last year's** challenge. They may resemble this year's data, but don't assume it's the same.
