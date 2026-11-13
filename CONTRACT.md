# CONTRACT.md: interfaces between our parts

Changes need a PR approved by the other owner. Keep the shapes exact; agents code against this file.

## Owners
- `app/web/` (aleksei) consumes the API below (console: approvals + audit log).
- `app/server/` (ayaan) implements it, plus the same core calls as **MCP tools** for buyer agents.
- Base: `http://localhost:8787` (console uses `/api` via the Vite proxy). All bodies are JSON. Money is EUR, numbers not strings.

## Principles
- **The product is the in-webshop order builder; the gateway is how it's built.** The webshop UI is client #1; outside agents (MCP) are client #2. Same functions, same rules.
- **Rules are enforced server-side in the gateway, never in an LLM prompt.** Mandate checks run on every order, whoever sends it.
- **Query Valio's APIs only for shortlisted products, never the catalogue.** Every call is logged with its SKU count.
- Prices and stock on screen must come from a real API call; `checkedAt` is that call's time.

## API (v1, solo build)
```
GET  /api/health                              -> { ok: true, service: "valio-gateway", catalog: number }
GET  /api/products/search?q=&limit=&diet=     -> ProductHit[]        # local catalogue only, no Valio API call
POST /api/stock    { skus: string[], date }   -> StockCheck          # price + availability for these SKUs only
POST /api/basket   { request: string, people?: number, date: "YYYY-MM-DD", customer }  -> Basket   # planner
POST /api/basket/:id/lines/:lineId  { qty? , chooseOption?: string }  -> Basket            # edits / swap decision
POST /api/basket/:id/order  { by: string }    -> Order               # mandate check -> placed | needs_ok | needs_approval
POST /api/orders/:id/decision { decision: "approve"|"reject", by, note? } -> Order
GET  /api/orders?status=                      -> Order[]
GET  /api/orders/:id/audit                    -> AuditEvent[]
```
MCP tools (thin wrapper, same handlers): `search_products`, `check_stock`, `build_basket`, `place_order`, `get_order`.

## Data schemas
```ts
type ProductHit = { id: string; name: string; brand: string; unit: string; size?: { qty: number; unit: "L"|"KG"|"PCS" };
  claims: string[]; contains: string[]; labels: string[]; co2?: number; reliability?: number; image?: string };
type StockLine = { sku: string; price: number; priceWithTax: number; comparisonPrice?: number; comparisonUnit?: string;
  customerPrice: boolean; available: number | null;      // null = unknown (Terminal)
  availableDate?: string; closingTime?: string; cutoffPassed: boolean; deliverable: boolean; salesUnit: string };
type StockCheck = { checkedAt: string; date: string; calls: number; skus: number; lines: StockLine[] };
type Dish = { id: string; name: string; portions: number; basis: string; diet: string[] };   // basis: "140 g salmon, 2 dl soup each"
type BasketLine = { id: string; dishId: string | null; sku: string; name: string; qty: number; why: string;  // "50 × 140 g = 7 kg"
  stock: StockLine; total: number;
  issue?: { kind: "short"|"unavailable"|"cutoff"; text: string; options: { sku: string; name: string; reason: string; delta: number }[];
            decided?: string };                                     // a swap needs a human choice
  usedIn?: string[] };
type Basket = { id: string; request: string; people: number; date: string; dishes: Dish[]; lines: BasketLine[];
  assumed: string[];                                                // pantry items not ordered
  checkedAt: string; apiCalls: number; total: number; mandate: MandateResult };
type Mandate = { customer: string; maxOrderEur: number; maxDailyEur: number; swapsNeedOk: true; approver: string };
type MandateResult = { state: "agent_may_order"|"needs_your_ok"|"needs_approval"; reasons: string[] };
type Order = { id: string; basketId: string; total: number; status: "placed"|"pending_approval"|"rejected";
  pricesHeldUntil: string; createdAt: string; decidedBy?: string };
type AuditEvent = { at: string; actor: string; kind: string; summary: string; data?: object };
```

## Env vars
Every var is listed in `.env.example`. Add new ones there in the same PR.
