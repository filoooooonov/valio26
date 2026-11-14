# CONTRACT.md: interfaces between our parts

Change it in its own commit, before the code that depends on it. Keep the shapes exact; agents code against this file.

## Owners
- `app/web/` (aleksei) consumes the API below (console: approvals + audit log).
- `app/server/` (aleksei) implements it, plus the same core calls as **MCP tools** for buyer agents.
- Base: `http://localhost:8787` (console uses `/api` via the Vite proxy). All bodies are JSON. Money is EUR, numbers not strings.

## Principles
- **The product is the in-webshop order builder; the gateway is how it's built.** The webshop UI is client #1; outside agents (MCP) are client #2. Same functions, same rules.
- **Rules are enforced server-side in the gateway, never in an LLM prompt.** Mandate checks run on every order, whoever sends it.
- **Query Valio's APIs only for shortlisted products, never the catalogue.** Every call is logged with its SKU count.
- Prices and stock on screen must come from a real API call; `checkedAt` is that call's time.

## API (v1.1, solo build; night/2026-11-14)
```
GET  /api/health                              -> { ok: true, service: "valio-gateway", catalog: number }
GET  /api/products/search?q=&limit=&diet=     -> ProductHit[]        # local catalogue only, no Valio API call
POST /api/stock    { skus: string[], date }   -> StockCheck          # price + availability for these SKUs only
POST /api/basket   { request: string, people?: number, date: "YYYY-MM-DD", customer? }  -> Basket   # planner
GET  /api/basket/:id                          -> Basket
GET  /api/basket/:id/audit                    -> AuditEvent[]
POST /api/basket/:id/lines/:lineId  { qty?, chooseOption?: string, by? }  -> Basket
       # chooseOption: an option sku | "keep" (short lines: order what is available) | "remove"
       # by: who decided. A swap decided by an id starting with "agent" does NOT count as the buyer's OK.
POST /api/basket/:id/order  { by: string }    -> 201 Order (placed) | 202 Order (pending_approval)
       | 409 { error: "needs_your_ok", mandate: MandateResult, changes: Change[] }   # open swaps: nothing ordered
       | 409 { error }                                                              # already ordered / empty
POST /api/orders/:id/decision { decision: "approve"|"reject", by, note? } -> Order
       # only Mandate.approver may decide (403 otherwise); approve re-checks price+stock (409 if stock broke)
GET  /api/orders?status=                      -> Order[]   (newest first)
GET  /api/orders/:id                          -> Order
GET  /api/orders/:id/audit                    -> AuditEvent[]  (the whole basket + order record)
GET  /api/mandate/:customer                   -> Mandate
GET  /api/calls                               -> last 100 Valio API calls { at, endpoint, skus, ms, status }
# v1.2 (Sat 14 Nov, V2 chat-left demo)
POST /api/basket/:id/guests { people: number, by? }  -> Basket
       # deterministic rescale, no LLM: every per-portion line is recomputed for `people` and re-rounded to
       # whole sales units; ONE stock call for the changed SKUs; lines that no longer fit stock get an issue.
       # Decided swaps are kept. Non-per-portion lines (e.g. "1 kg bouillon") keep their qty unless they scale.
POST /api/basket/:id/chat   { text: string, by? }    -> ChatReply
       # Claude maps the text to gateway actions ONLY (set_guests, set_qty, choose_option, remove_line, replan).
       # The gateway runs them through the same handlers and rules; Claude never edits prices or the mandate.
       # "replan" (e.g. "add a vegan main") builds a NEW basket from request + change; reply.basket.id differs.
GET  /api/products/:sku/image                 -> { url: string | null }
       # one EAN lookup on valioaimo.fi product search per SKU, only when the UI shows that product; cached on disk
       # (data/raw/valio/images.cache.json). Mentors OK'd using valioaimo.fi images.
```
```ts
type ChatReply = { reply: string;            // 1-3 plain sentences, what changed and why
  actions: { kind: "set_guests"|"set_qty"|"choose_option"|"remove_line"|"replan"; summary: string }[];
  basket: Basket;                            // the basket after the actions (new id if replanned)
  question?: string };                       // set when the text was ambiguous; no actions taken
```
MCP tools (thin wrapper, same handlers): `search_products`, `check_stock`, `build_basket`, `place_order`, `get_order`.

Planner pipeline (POST /api/basket): Claude (`claude-opus-5-5`) turns the request into dishes + needs ->
the server searches the local catalogue (diet filter per dish, non-food excluded, max 12 candidates per need) ->
Claude ranks the candidates per need -> ONE price/stock call for all chosen SKUs -> sales-unit maths ->
lines with an issue get up to 3 alternatives, stock-checked in ONE extra call, ranked allergen safety ->
deliverable -> on-time reliability -> price -> CO2. Without `ANTHROPIC_API_KEY` (or if Claude fails) a deterministic
demo planner (salmon soup / rye bread / blueberry pie; "N L lactose-free milk") runs and `planner` is `"fallback"`.

## Data schemas
```ts
type ProductHit = { id: string; name: string; brand: string; unit: string; size?: { qty: number; unit: "L"|"KG"|"PCS" };
  claims: string[]; contains: string[]; labels: string[]; co2?: number; reliability?: number; image?: string };
type StockLine = { sku: string; price: number; priceWithTax: number; taxRate: number; comparisonPrice?: number; comparisonUnit?: string;
  customerPrice: boolean; listPrice?: number; available: number | null;      // null = unknown (Terminal / placeholder)
  availableDate?: string; closingTime?: string; cutoffPassed: boolean; logistic?: string; deliverable: boolean; salesUnit: string; error?: string };
type StockCheck = { checkedAt: string; date: string; calls: number; skus: number; lines: StockLine[] };
type Dish = { id: string; name: string; portions: number; basis: string; diet: string[] };   // basis: "2.5 dl soup, 140 g salmon each"
type Option = { sku: string; name: string; reason: string; delta: number;    // reason: "no new allergens · in stock, available from Mon 16 Nov · 96 % on time · €14.11/kg"
  qty: number; pack: string; why: string; total: number; stock: StockLine; contains: string[] };
type BasketLine = { id: string; dishId: string | null; needIds: string[]; sku: string; name: string; brand: string;
  qty: number; pack: string;                 // pack: "2.5 kg" | "1 l" | "by kg"
  why: string;                               // "50 × 140 g = 7 kg → 3 × 2.5 kg"
  stock: StockLine; total: number; contains: string[]; claims: string[]; reliability?: number; co2?: number; image?: string;
  issue?: { kind: "short"|"unavailable"|"cutoff"; text: string; options: Option[]; decided?: string; decidedBy?: string };
  replaced?: { sku: string; name: string };  // set after a swap
  usedIn?: string[] };                       // one SKU serving several dishes
type Basket = { id: string; customer: string; request: string; people: number; date: string;
  planner: "llm"|"fallback"; plannerNote?: string; dishes: Dish[]; lines: BasketLine[];
  assumed: string[];                         // pantry items not ordered
  notes: string[];                           // unmatched needs, unit assumptions
  checkedAt: string; apiCalls: number;
  total: number; totalWithVat: number;       // orderable lines only (no open issue), EUR
  openIssues: number; totalIfAccepted: number; // total if every open issue takes its first option
  pricesHeldUntil: string | null;            // earliest future order cut-off of the lines
  rules: Mandate; mandate: MandateResult; createdAt: string };
type Mandate = { customer: string; maxOrderEur: number; maxDailyEur: number; swapsNeedOk: true; approver: string };  // 500 / 1500 / "Mikko L."
type MandateResult = { state: "agent_may_order"|"needs_your_ok"|"needs_approval"; reasons: string[] };   // plain language
type Change = { sku: string; name: string; kind: "price"|"stock"; was: string; now: string };
type Order = { id: string; basketId: string; customer: string; by: string; total: number; totalWithVat: number;
  status: "placed"|"pending_approval"|"rejected"; pricesHeldUntil: string | null; createdAt: string;
  mandate: MandateResult; lines: { sku: string; name: string; qty: number; pack: string; price: number; total: number }[];
  changes: Change[]; apiCalls: number; decidedBy?: string; decidedAt?: string; note?: string };
type AuditEvent = { at: string; actor: string; kind: string; summary: string; data?: object };
// kinds: request plan search pick stock alternatives edit swap mandate recheck order decision
```
Daily limit = placed + pending orders today for the customer, so splitting one order into several small ones is caught.
State is in memory: restarting the server clears baskets and orders.

## Env vars
Every var is listed in `.env.example`. Add new ones there in the same PR.
