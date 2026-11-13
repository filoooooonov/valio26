# CONTRACT.md: interfaces between our parts

Changes need a PR approved by the other owner. Keep the shapes exact; agents code against this file.

## Owners
- `app/web/` (aleksei) consumes the API below (console: approvals + audit log).
- `app/server/` (ayaan) implements it, plus the same core calls as **MCP tools** for buyer agents.
- Base: `http://localhost:8787` (console uses `/api` via the Vite proxy). All bodies are JSON. Money is EUR, numbers not strings.

## API (v0, lock-in draft)
```
GET  /api/health                         -> { ok: true, service: "valio-gateway" }

POST /api/quote                          -> Quote          # MCP tool: request_quote
  { agentId: string, need: string,              # "1000 L lactose-free milk"
    qty: number, unit: "L"|"KG"|"PCS",
    deliverBy: "YYYY-MM-DD", query?: string }

POST /api/orders                         -> Order          # MCP tool: place_order
  { agentId: string, offerId: string, lines?: { productId: string, salesUnitQty: number }[] }
  # gateway checks mandate: within -> status "placed"; outside -> status "pending_approval"

GET  /api/orders?status=pending_approval -> Order[]        # console queue
POST /api/orders/:id/decision            -> Order          # console approve/deny
  { decision: "approve"|"deny", by: string, note?: string }

GET  /api/audit?since=<iso>              -> AuditEvent[]   # console live log (poll every 2s)
GET  /api/mandates/:agentId              -> Mandate
```
Also MCP-only: `search_products(query, limit?) -> Product[]` (thin: id, name, unit, allergens, labels).

## Data schemas
```ts
type Offer = {
  offerId: string; rank: "good"|"better"|"best"|"primary";
  productId: string; name: string; supplier: "Stock"|"Terminal";
  lines: { productId: string; salesUnit: string; salesUnitQty: number; baseQty: number }[];
  coveredQty: number;                // in requested unit; < qty => partial
  unitPrice: number; comparisonPrice: number; total: number;
  deliveryDate: string; closingTime: string;
  why: string[];                     // human-readable reasons (substitution, allergen-safe, CO2...)
  co2KgPerKg?: number; labels: string[]; allergens: string[];
  provenance: Provenance;
};
type Provenance = {                  // the "trust protocol"
  source: "valio-mock-api"; fetchedAt: string;   // stock/price snapshot time
  validUntil: string; payloadHash: string;       // sha256 of the offer body
  signature: string; keyId: string;              // ed25519 over payloadHash; pubkey at GET /.well-known/gateway-key
};
type Quote = { quoteId: string; request: object; offers: Offer[]; warnings: string[] };  // e.g. "cut-off passed"
type Mandate = {
  agentId: string; maxOrderEur: number; maxDailyEur: number;
  allowSubstitutes: boolean; forbiddenAllergens: string[]; requiredClaims: string[];  // e.g. ["FREE_FROM_LACTOSE"]
  originAllow?: string[];            // e.g. EU country codes
};
type Order = {
  orderId: string; agentId: string; offerId: string; total: number;
  status: "placed"|"pending_approval"|"approved"|"denied";
  violations: string[];              // why it escalated, e.g. "total 1012 > maxOrderEur 500"
  createdAt: string; decidedBy?: string; decidedAt?: string;
};
type AuditEvent = {
  id: string; at: string; actor: string;          // agentId | human name | "gateway"
  kind: "quote"|"order_placed"|"escalated"|"approved"|"denied"|"mandate_check";
  summary: string;                                // one plain-English line for the console
  refs: { quoteId?: string; offerId?: string; orderId?: string };
};
```

## Env vars
Every var is listed in `.env.example`. Add new ones there in the same PR.
