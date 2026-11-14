# Valio Aimo trusted purchasing

The existing Aimo assistant now shares its purchasing logic with independent HTTP/MCP clients. A chef can approve a menu and prepare ingredients; a purchasing agent can request a specific product and amount without creating a menu. Backend code checks the products, packaging, customer price, known stock, delivery evidence and customer policy before any simulated order is confirmed.

**Scope after the sponsor discussion:** scheduled menus are not a core differentiator: Valio already provides them. This pivot leaves the existing scheduled-menu page unchanged and adds no scheduler. The demo focuses on decisions and exceptions.

## Single-product price comparisons

Start a **New order** and send `I need 1,000 litres of lactose-free milk delivered 2026-11-16`. The cart now displays **Compare product options**, with two alternatives, unit prices, total cost for the requested quantity, price differences and pack overbuy. Select an alternative to replace the same cart line; the normal cart undo restores the previous choice. Existing drafts retain their original quotes; create a new request to get the new comparison.

The gateway searches the actual local catalogue, respects the product type/diet, and quotes up to12 candidates in one pricing/availability batch. Retrieval mixes relevant products and larger packs. It does not claim to quote every milk in the store. Candidates are ranked by full deterministic validation, rounded total cost, overbuy, delivery reliability and SKU. A cheaper unknown-stock product never outranks verified fulfillment. If stock is unknown for every otherwise suitable product, the price recommendation is explicitly provisional and ordering stays blocked. Products that fail delivery, allergen or quantity checks carry exclusion reasons and cannot be selected. The expandable **Why this choice?** shows every quoted candidate, timestamp, scope and source.

Menu and multi-product orders stay compact: the agent chooses products through the existing planner and surfaces exceptions instead of showing a comparison for each ingredient. Comparisons and selections are recorded in the same audit trail and exposed in the existing API response. Quotes are rechecked at order submission; no stock or price is reserved. Candidate selection uses `POST /api/basket/{id}/lines/{lineId}` with `{selectCandidate: sku}` and the same authenticated customer scope. Only server-quoted candidates are accepted; pending/confirmed orders remain locked.

## Run and verify

Prerequisites: Bun, installed repository dependencies, sponsor `data/raw/valio/catalog.slim.json` (prepare with `bun run explore:prep` after downloading the challenge files). Existing development command:

```powershell
bun run dev
```

Open `http://localhost:5173`. The menu, chat, cart, replacement review and brand kit retain their existing layouts and styling. Enter `20 litres of lactose-free milk delivered 2026-11-16` to skip menu/guest collection. Inspect **Product details** and **View order and audit trail**. Purchasing policy settings are inside the existing approver screen, `/?view=mikko`, under **Purchasing policy**.

Run reproducible scenarios without sponsor or Claude network calls:

```powershell
bun scripts/commerce-demo.mjs
node scripts/test.mjs --fast
bun run build
```

The demo reads **actual sponsor catalogue IDs and attributes** and uses an explicitly labelled local **synthetic price/availability fixture**. It starts an isolated loopback HTTP gateway, generates temporary credentials without printing them, asserts outcomes, prints the reasons, and persists a separate ledger under ignored `data/commerce/` for each take.

For current sponsor mock price/availability responses instead of the deterministic fixture:

```powershell
bun --env-file=.env scripts/commerce-demo.mjs --live
```

This uses the configured Claude planner if available. Live stock/cutoffs can require intervention: no successful order is fabricated. Never point `VALIO_API_URL` at a production webshop.

## Demo scenarios and why

1. **Catering for 50, no peanuts, EUR500 budget.** Menu suggestion → menu approval → ingredient calculations → catalogue products. Explain quantities and sales lots (for example, 7 kg required does not justify ignoring a 10 kg minimum lot). In the current dataset many products have no explicit peanut-free evidence. The request remains a draft requiring intervention; a manager cannot override a hard safety constraint. This is an intentional demonstrated trust boundary, not a claim that an empty allergen list proves safety.
2. **External agent: 1,000 litres of lactose-free milk.** Structured request → actual product identifiers → package maths → current quote → policy. In the synthetic fixture, EUR1,000 exceeds the EUR500 autonomous limit, so it requires approval. Self-approval receives403. The designated human approves the exact revision, producing a persisted `SIM-...` confirmation. Retrying submission returns the same order. The API response includes `decisions`: product selection, quantities/overbuy, source and timestamp, policy result and any intervention reasons.
3. **Unavailable candidate.** The fixture makes the previous recommendation unavailable. The next request quotes the catalogue shortlist again, excludes that candidate with a recorded reason and selects the lowest valid rounded total among the remaining products. It prints the comparison evidence and authorization result. No successful outcome or winning product ID is hardcoded. Menu exceptions continue using the existing governed substitution flow.

Suggested video (under two minutes): 0–30s chef/menu/cart; 30–55s unavailable product and **Why the agent made these choices**; 55–95s independent milk request, denied self-approval and human approval; 95–115s exact revision, saved simulated confirmation and readable evidence. State aloud: the sponsor has no order endpoint; confirmations are local simulations. Emphasize buyer need, guardrails, exception handling and openness rather than a scheduling feature.

## Architecture and data provenance

```text
Existing React website ─┐
Versioned REST API ─────┼─ intent.ts → plan.ts/catalog.ts/valio.ts
Existing MCP tools ────┘                 ↓
                           validation.ts + policy.ts
                                        ↓
                    orders.ts → exact revision / human approval
                                        ↓
                     persisted simulated confirmation + audit.ts
```

`plan.ts` remains the shared purchasing engine. Claude handles language and shortlist ranking; it cannot invent permitted SKUs or grant authority. Direct structured items bypass both menu generation and Claude. Deterministic code performs sales-unit/lot rounding and final validation. `explain.ts` constructs explanations from recorded facts, preserving the distinction between an AI suggestion and verified evidence. The API never implements a separate mock purchasing flow.

Verified facts come from sponsor catalogue attributes and pricing/availability responses. Customer requirements and sample delivery addresses are user supplied. Product names remain display/search material, not a free-from certification. Packaging prefers authoritative catalogue volume/net-weight and unit conversions; pricing comparison ratios are the secondary source. Unconvertible units require intervention. Unknown/placeholder stock is not unlimited stock. Safety validation requires explicit free-from evidence for forbidden allergens, checks both `contains` and `mayContain`, and does not assume absent attributes mean safe.

The sponsor mock ignores customer IDs. Its `netPriceFound` flag is mock customer-price evidence, not a production account integration. Delivery dates/cutoffs are sponsor mock facts; sample addresses/time slots are not verified reservations. No stock or price hold is promised.

## Authentication and external clients

Set `COMMERCE_PRINCIPALS_JSON` server-side before exposing the gateway. It is an array of `{token, actor, customer, role}`. Issue distinct random tokens (at least24 characters) to a buyer/agent, the designated approver (`Mikko L.` by default), and an optional account administrator. Supported roles: `buyer`, `agent`, `approver`, `admin`. Credentials belong in environment variables; never put them in `VITE_*`, request URLs, screenshots or audit records. All roles are scoped to one configured customer; the client cannot assign its customer, identity, role or policy limits.

With credentials configured, legacy REST and MCP paths are protected too. The approver role must match the customer's server-designated approver, and the requester cannot approve their own order. An agent's cart review is not financial approval.

The existing unauthenticated development mode is **local demonstration only**, binds to loopback by default, and is labelled in policy settings. Versioned purchasing routes always require credentials. It is not a secure internet deployment configuration.

Set `COMMERCE_URL` and `COMMERCE_TOKEN` privately, then use the independent standard HTTP client:

```powershell
node scripts/commerce-client.mjs milk 2026-11-16
node scripts/commerce-client.mjs get REQUEST_ID
node scripts/commerce-client.mjs submit REQUEST_ID
node scripts/commerce-client.mjs audit REQUEST_ID
# Run with the separate approver credential and the revision returned for review:
node scripts/commerce-client.mjs approve REQUEST_ID REVISION_SHA256
```

HTTP operations:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/openapi.json` | OpenAPI3.1 and generated JSON Schemas |
| POST | `/api/v1/purchase-requests` | Prepare a menu or direct structured products |
| GET | `/api/v1/purchase-requests/{id}` | Current state, revision, facts and explanations |
| POST | `/api/v1/purchase-requests/{id}/submit` | Fresh validation, policy, approval or simulated confirmation |
| POST | `/api/v1/purchase-requests/{id}/approve` | Authorized human decision on the exact revision |
| GET | `/api/v1/purchase-requests/{id}/audit` | Timestamped human-readable decisions and evidence |
| GET/PUT | `/api/v1/policies` | Read policy; only an administrator may update it |
| POST | `/api/v1/session` | Bearer-to-HttpOnly browser cookie exchange |

Example request (with an `Authorization: Bearer ...` header supplied privately):

```json
{
  "request": "1000 litres lactose-free milk delivered Monday",
  "date": "2026-11-16",
  "items": [{"query": "lactose-free milk", "quantity": 1000, "unit": "l"}]
}
```

Optional `forbiddenAllergens` adds restrictions; it cannot remove server restrictions. Optional `delivery` carries `{placeId,address,time}` as unverified user details included in the revision. The schema rejects extra identity/policy fields and invalid quantities/dates. Errors use `{error:{code,message,details?}}` on v1. HTTP409 means intervention, changed evidence or stale review; HTTP403 means insufficient delegated authority. Obtain the latest revision and review it before approving again.

For an authenticated browser demo, exchange its credential through `POST /api/v1/session` with the bearer header. The returned HttpOnly, SameSite=Strict cookie allows the existing website to use the same scoped handlers. Cookie mutations require the configured `COMMERCE_BROWSER_ORIGIN`. Use separate browser profiles for buyer and approver; cookies are shared across tabs. There is no production sign-in/SSO screen in this hackathon prototype.

## Authorization, revisions and storage

The demo default is EUR500 per order and EUR1,500 per day; both are configurable server policy. Policies also support allowed catalogue categories, forbidden allergens, substitution permission, automatic same-use rules, substitute price-increase allowance, allowed delivery weekdays and mandatory human approval. Read-only approvers cannot raise limits. The existing approver screen's collapsed policy editor enables administrators (or local demo mode) to change the main settings without adding a new visual system.

`DRAFT` requests require clarification or missing evidence; `VALIDATED` requests can proceed under policy; `PENDING_APPROVAL` requests require a human; rejected orders expose `REJECTED`; persisted simulated orders expose `CONFIRMED`. Legacy `placed` remains for frontend compatibility. Submission/approval rechecks current facts. A SHA256 revision covers customer, date/address/time, restrictions/budget, selected products, quantities, net/gross prices and totals. Changed prices refresh the pending record and return409 so the human reviews again. Changed basket contents require resubmission. A pending basket is locked; a submitting basket is protected from concurrent edits.

Order mutations are serialized in one process, including daily-limit and duplicate checks. Repeated submission safely returns the existing order. `COMMERCE_LEDGER_PATH` stores baskets, policy overrides, simulated orders and audit snapshots through atomic file replacement. Restart persistence and safe replay are tested. Credentials are never persisted there. Back up the ledger if retaining demo history; use a separate path for independent takes instead of deleting someone else's records.

Standards: HTTP/JSON, OpenAPI3.1, JSON Schema, bearer credentials, HttpOnly/SameSite browser cookies and the existing MCP Streamable HTTP interface. No blockchain/x402 or additional framework was introduced.

Production work remains: real identity/delegation/SSO and credential lifecycle, account/address validation, a transactional multi-process database and spend reservations, stronger product equivalence/attribute coverage, rate-limit backoff, real fulfillment integration, monitoring and retention/access controls for audit data. Local file persistence and a configured demo approver are deliberately limited hackathon infrastructure. All confirmations remain simulated because the sponsor API has no order-creation contract.
