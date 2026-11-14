# Ideas: Valio Aimo

Team fit: solo build (aleksei + agents). The approval console and live audit log are what judges see; the gateway, policy engine and substitution ranking sit behind them.

1. **Signed offers + policy mandates ("trust protocol")**
   The gateway returns offers signed with provenance (stock snapshot time, origin, certs). Each buyer agent carries a
   **mandate**, a verifiable credential such as "≤ €500/order, lactose-free substitutes OK, no origin outside the EU". In-mandate orders go through
   automatically, and anything outside escalates to a human on the console with a one-click approve or deny.
   Rubric: trust protocol, guardrails and audit trail all hit. It's distinctive because most teams will skip the trust layer.

2. **Good-better-best substitution engine**
   On a stock-out, rank in-assortment substitutes by allergen safety, then lead time, then price, then CO₂, and explain why.
   Rubric: response logic and explainability. Pairs well with idea 1.

3. **Standing-order drift detector**
   A proactive agent watches recurring orders and flags drift (price, availability, a better sustainable option).
   Rubric: optional directions. It's a nice add-on but a weaker core.

**Pick:** 1 as the core, with 2 as the response logic.
