# TRUST.md: how an agent can trust the Valio Aimo gateway

The open gateway (REST at `/api`, MCP at `/mcp`) lets any buyer agent, including the shopping assistant in the Aimo webshop, turn a request into a priced, stock-checked order within a **mandate**. This page answers the four questions in the challenge brief:

1. **Trust protocol**: the minimum data and verification an agent needs to accept a claim about stock, price or origin without checking it by hand.
2. **Guardrails model**: which decisions the gateway makes on its own, which need the buyer, and which need the approver.
3. **Response logic**: how partial stock and substitutions are handled and ranked (Best, Better, Good).
4. **Audit trail**: a log of every decision that both the buyer and Valio Aimo can read, and that shows if it has been changed.

> **Prototype scope:** Price and availability come from Valio's sponsor API, live and per customer. Valio has no order API, so an approved order is a **local record** in this gateway; it is not sent to Valio Aimo. All state is in memory.

---

## 1. Trust protocol: signed offer receipts

Every price and stock fact handed to an agent comes with an **offer receipt**. The receipt holds the claims, signed by the gateway with Ed25519.

### Minimum standard

| Claim | Field(s) | Source | Freshness rule | How an agent verifies |
|---|---|---|---|---|
| Customer price | `price`, `priceWithTax`, `currency`, `customerPrice` | Valio API `/api/price`, per customer (`customerPrice` = a negotiated net price was found) | `validUntil` = whichever comes first: `checkedAt` + 15 min, or `orderCutoff` | Ed25519 signature over the claims |
| Stock | `available`, `availableDate`, `deliverable`, `status` | Valio API `/api/availability` for the requested `deliveryDate` | same | same |
| Order cut-off | `orderCutoff` | Valio `closingTime` for that delivery date | fixed for the date | same |
| Origin and labels | `origin`, `labels` | Valio product catalogue (country of origin, Finnish-origin and organic labels) | catalogue snapshot | same |
| Provenance | `source`, `checkedAt`, `kid` | the gateway | n/a | `kid` must match the published key |

### How to verify
1. Fetch `GET /.well-known/aimo-gateway.json` to get `kid`, `alg: "Ed25519"` and `publicKeyJwk`.
2. Serialise `claims` as JSON with object keys sorted recursively and no whitespace.
3. Check `sig`, which is base64url, against that string with the public key. You can do this offline, or call `POST /api/receipts/verify` (MCP tool: `verify_receipt`).
4. If `now > validUntil`, the receipt is still authentic but **stale**. Re-check before relying on it.

### What the receipt does *not* promise
- **Nothing is reserved.** A receipt is evidence of what Valio's API said at `checkedAt`, not a hold on stock.
- **Approval always re-checks** price and stock. If stock has broken, the approval fails with HTTP 409 and nothing is ordered.
- Without `GATEWAY_SIGNING_KEY`, a new key is generated each time the gateway starts, so receipts from before a restart no longer verify.

### Path to production
- Sign with a key held by Valio and rotate it with `kid`.
- Issue receipts as **W3C Verifiable Credentials** so they fit **AP2**-style Intent and Cart mandates.
- Map `sku` to the GS1 GTIN and Digital Link.
- Bind the agent's identity to the order with a KYA-style delegation credential instead of the `by` string.

---

## 2. Guardrails model: who decides what

The gateway enforces these rules on every order, whoever sends it: the webshop or an outside agent over MCP. The rules are never left to an LLM prompt. Live version: `GET /api/mandate/:customer/matrix`, or the MCP tool `get_mandate`. In the webshop, open **Who decides what**.

| Gateway does it | Buyer confirms | Approver signs off |
|---|---|---|
| Looks up only the shortlisted products, never the whole catalogue | Any substitution other than a same-use swap (choose Best, Better or Good, keep what's available, or remove the line) | Orders over the per-order limit (default €500) |
| Same-use swaps: same product group, no new allergens, never fish or meat, at most +20 % or +€25. Logged | A swap chosen by an outside agent, which never counts as the buyer's OK | Today's orders over the daily limit (default €1,500), which catches split orders |
| Re-checks price and stock at approval | Orders within the limits | Only the named approver can approve. An agent approving its own order gets HTTP 403 |

**Autonomy is a setting, not the default.** Valio confirmed that agent orders need a human approval for now. Every agent-prepared order keeps a human confirmation; ordering fully autonomously within the mandate is on the roadmap.

---

## 3. Response logic: partial stock and substitutions

The gateway handles each line it cannot deliver as asked:

| Situation | What the gateway does |
|---|---|
| **Short**: less stock than needed | Offers *take the N available*, ranked replacements, or *don't order it* |
| **Unavailable** for the delivery date | Offers ranked replacements, or *don't order it* |
| **Cut-off passed** | Says so; nothing can be ordered for that date |

**Ranking.** Only orderable options are ranked, at most 3. They are sorted by:
1. **Allergen safety**: fewest allergens that the original product didn't have.
2. **On-time delivery reliability**: from Valio's delivery-reliability data, rounded to 5 %.
3. **Price** for the needed quantity.
4. **CO₂e** per kg for the product group: from Valio's carbon-footprint data.

The top option is labelled **Best** ("Closest safe match"). **Better** and **Good** each come with a one-line reason relative to Best, for example *"€3.20 cheaper than Best, less reliable delivery (85 % on time), lower CO₂."* Only the API calls needed are made: one price/stock call for the chosen products, and one more call for all the alternatives together.

---

## 4. Audit trail

- Every step is one plain-language event: request → plan → catalogue search → stock check → swaps → mandate check → order → re-check → decision. Each event records its **actor**: the assistant, the gateway, a named person, or an agent id.
- **Tamper-evident:** each event stores `prev`, the hash of the event before it, and its own `hash`, a SHA-256 over the event. `GET /api/basket/:id/audit/verify` recomputes the chain and reports `intact`, or the first broken event.
- **Two views of the same record:** the **Buyer view** shows what happened and why. The **Valio view** shows everything, including API calls, the actor or agent, and the raw data.
- **Export:** `GET /api/basket/:id/audit/export` returns a JSON file with the record, the chain status and the order.

**Why it matters:** this is the kind of automatic event log that EU AI Act Art. 12 describes, and it includes the **human approval event**, which generic agent telemetry (OpenTelemetry GenAI) has no event type for.

---

## Related standards and how this compares

| | Covers | Relation to this gateway |
|---|---|---|
| **ACP** (OpenAI and Stripe) | Consumer checkout call | We cover B2B ordering with customer prices, delivery cut-offs and approval chains |
| **UCP** (Google and partners) | Consumer shopping journey | Same layer for B2C. Our MCP tools could be exposed as a UCP-style capability |
| **AP2** (Google) | Signed Intent, Cart and Payment mandates (VCs) | Our mandate and receipts follow the same idea; VCs are the path to production |
| **KYA** (Skyfire, Experian, DIF's agent-identity work) | Agent identity and scoped delegation | Today an agent is an `agent:` id; production binds it with a credential |
| **Amazon Business** Guided Buying | Spend limits and approval routing for humans | Same controls, applied to agents and enforced by the supplier's gateway |
