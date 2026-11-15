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
  qty: number; pack: string; why: string; total: number; stock: StockLine; contains: string[]; frozen?: boolean };
type BasketLine = { id: string; dishId: string | null; needIds: string[]; sku: string; name: string; brand: string;
  qty: number; pack: string;                 // pack: "2.5 kg" | "1 l" | "by kg"
  why: string;                               // "50 × 140 g = 7 kg → 3 × 2.5 kg"
  stock: StockLine; total: number; contains: string[]; claims: string[]; frozen?: boolean; reliability?: number; co2?: number; image?: string;
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

## Cart line undo (S39)
Line edits also accept `{included: boolean}` as a standalone operation. Excluding an available/resolved line stores its previous sales quantity in `BasketLine.excludedQty` and sets `qty`/`total` to zero. Including restores that saved quantity. Explicit quantity edits or replacement/removal decisions clear `excludedQty`. Excluded rows stay visible after reload; ordinary removed rows stay hidden.
POST /api/basket/:id/undo {by?: string} returns {basket: Basket, canUndo: boolean}. The server keeps up to 30 successful web line edits (quantity, removal, replacement) per in-memory basket, using server-owned snapshots. Undo restores the previous line and recomputes totals and mandate, with an audit event; no product lookup is needed. Missing baskets return 404. Empty history, intervening basket changes, and pending/placed orders return 409. Menu/recipe changes, guest rescaling and chat actions are outside this line-edit history. Unchecked cart items remain visible with quantity zero and can be included again; the explicit remove action hides them.

## Env vars
Every var is listed in `.env.example`. Add new ones there in the same PR.

Frozen metadata (additive): BasketLine.frozen and Option.frozen indicate freezer storage from catalogue freezeTemperature labels, with explicit frozen/deepfrozen/deepfrost/FRO name fallback. Numeric storage codes are not interpreted. Absent fields mean unknown for older clients.

## Additive replacement/recipe review routes (S32)
POST /api/basket/:id/lines/:lineId/replacements/check refreshes the original SKU and its shortlisted same-use options; returns Basket. POST /api/basket/:id/lines/:lineId/recipe-change prepares a stock-checked single-dish alternative without changing the source basket; returns {id, from, to, before, after, totalBefore, totalAfter}. POST /api/basket/:id/recipe-change/:proposalId/apply applies only that reviewed dish and affected ingredient quantities to the same basket, rejecting stale or locked baskets (409). Recipe proposals are ephemeral; all orders retain existing mandate and approval rules.

## Additive menu suggestion route (S35)
POST /api/menu {request: string, current?: MenuItem[], instruction?: string} returns {items: MenuItem[], reply: string, planner: "llm" | "fallback"} where MenuItem = {title, description, course: "starter" | "main" | "dessert" | "drinks" | "side" | "snack" | "other"}. Without `current` it proposes a menu that follows the request's own structure (courses, theme, guest count, diet). With `current` + `instruction` it returns the whole edited menu, keeping untouched items verbatim. Language work only: no catalogue, price or stock calls. Without ANTHROPIC_API_KEY a labelled deterministic fallback derives courses from the request words.

## Additive chat action: add_product (S37)
POST /api/basket/:id/chat may run a new action kind `add_product` for plain products the buyer asks for by name ("add 2 bottles of Pepsi as a drink"). The gateway searches the local catalogue, ranks candidates (Claude when configured), stock-checks the top few in ONE call and prefers a deliverable SKU, then appends a basket line with `dishId: null` (or adds to an existing line of the same SKU). Counted units ("2 bottles", "3 packs") mean that many sales units; kg/l amounts are converted with the pack size like any need. The line follows the normal issue, swap and mandate rules. ChatAction gains `kind: "add_product"` and optional `lineId` (the added/updated line). The assistant's `chat` audit event carries `data.added: {lineId, label}[]` so clients can render an "Added …" card from the thread.

## Trusted commerce extension (S45)
Existing shapes and layouts remain compatible. Orders are explicitly `simulated: true`; placed means a persisted local confirmation, never sponsor fulfillment. A SHA256 revision binds customer, delivery date, SKUs, quantities, prices and totals. Approval after material changes returns409 and requires review again.

Versioned routes use server-configured bearer credentials (COMMERCE_PRINCIPALS_JSON: array of {token, actor, customer, role: buyer|agent|approver|admin}). Customer and role are never accepted from a request body. In configured mode legacy REST and MCP are protected with the same context. Unconfigured legacy routes are LOCAL DEMO ONLY; v1 always requires authentication. GET /api/v1/openapi.json publishes OpenAPI3.1 plus JSON schemas. POST /api/v1/session exchanges a bearer credential for an HttpOnly same-site browser cookie.

POST /api/v1/purchase-requests accepts {request, date, people?, items?: [{query, quantity, unit: l|kg|pcs}], forbiddenAllergens?: string[]}. Items explicitly mean DIRECT_PURCHASE; event prose means MENU_PLANNING. Returns {id, intent, state, revision, simulated, basket, order?, checks}. GET /api/v1/purchase-requests/:id and /:id/audit are customer-scoped. POST /:id/submit rechecks facts, enforces server mandate, and safely replays an existing order. POST /:id/approve requires a distinct authorized approver and {revision, decision: approve|reject, note?}. GET /api/v1/policies and PUT /api/v1/policies (admin only) manage the server policy. Scheduled purchasing is deferred after sponsor clarification; the existing scheduled-menu page is unchanged. No new schedule/worker endpoints are added.

Errors use {error: {code, message, details?}} on v1. Unverifiable quantities, absent customer price, missing delivery evidence and unverified/restricted allergens fail closed. Unknown stock (Valio placeholder availability, e.g. >= 999999) never places autonomously: it is a sign-off guardrail. The order can be submitted, the mandate becomes needs_approval with a stock reason naming the products, the approver is notified, and the approver's approval is the recorded stock confirmation (audited). It never downgrades a needs_your_ok verdict. Constraints are retained on baskets and checked again on submit/approval. New policy fields are additive: forbiddenAllergens, allowedCategories, requireApproval, maxSubstituteIncreasePct, substitutionsPermitted, allowedDeliveryWeekdays. The default autonomous threshold remains EUR500.

Purchase responses also include `decisions` with per-product selection reasons, package calculation and overbuy, source-labelled pricing/availability evidence, substitution trade-offs and authorization/intervention reasons. `delivery?: {placeId,address,time}` is user-supplied sample context included in the exact revision, not a verified reservation. Product contents now prefer sponsor volume/net-weight and unit conversions; minimum lot rounding is enforced. Order states in the versioned adapter are DRAFT, VALIDATED, PENDING_APPROVAL, REJECTED and CONFIRMED; legacy placed means a persisted local simulation. See docs/TRUSTED_COMMERCE.md.


## S46 single-product comparisons
A DIRECT_PURCHASE with one structured need gets a bounded catalogue shortlist (maximum 30 products, quoted in one batched price + availability call) quoted together for the authenticated customer/date. Its BasketLine.comparison records query, local match count, shortlisted/checked counts, timestamp/source, ranking criteria, recommended SKU and candidates with package quantity, physical quantity/overbuy, normalized unit price, requested-order total and validation/rejection reasons. It never claims to compare the entire store's prices. Fully validated candidates rank before unknown-stock provisional candidates; unsuitable/unavailable candidates cannot be selected. Among valid candidates rank actual rounded order total, overbuy, delivery reliability, then SKU for deterministic ties. No category/product-ID list is hardcoded for the new single-product route.

POST /api/basket/:id/lines/:lineId additionally accepts {selectCandidate:sku,by?}. Only server-stored compared candidates can be chosen, current policy is re-evaluated, pending/placed baskets stay locked, and submit still refreshes stock/prices. Quantity edits recalculate the comparison's package maths at the recorded quote timestamp. Selection changes the same line, never adds all alternatives to the cart. Menu and multi-product flows retain the existing compact behavior and exception-only replacements. Comparison facts/reasons also appear in versioned purchase responses and audit decisions.

## S48 purchase memory, preferences vs permissions, exception-first cart
**Synthetic profile.** Account `123` is **Bistro Kallio**, a fictional independent Helsinki restaurant, always labelled `synthetic: true` ("synthetic demo profile") wherever shown. Its history is deterministic: 8 weekly orders (Fridays 2026-09-25 … 2026-11-13), 10–15 lines each, real catalogue SKUs, synthetic historical prices (never used for current decisions). History lives in `app/server/src/history.ts` (generated from a fixed seed list) and is never mixed into Valio API responses. It contains: a usual cooking cream A, three accepted substitutions A→B, one rejected suggestion A→C, modest price drift. Cream A is chosen so the real mock API cannot deliver it for 2026-11-16 (passed cut-off): Scenario B needs no simulation.

GET /api/profile → `{customer, name, synthetic:true, weeklyOrders:number, typicalOrderEur:number, permissions:SubstitutionPermission[]}`.

**Preference memory** (`preferences.ts`, deterministic, no confidence percentages). Events (ledger `preferences`, append-only): `{customer, at, kind:'purchased'|'substitution_accepted'|'substitution_rejected'|'stated_preference'|'prohibited', sku, forSku?, qty?, source:'synthetic_history'|'live', basketId?}`.
`preferenceOf(customer, sku, forSku?) → Preference = {status:'usual'|'accepted_alternative'|'unfamiliar'|'rejected'|'prohibited', reason:string, orders:number, of:number, accepted?:number, rejected?:number}`. Reasons are plain facts: "Purchased in 7 of your last 8 orders", "You've accepted this instead of <A> 3 times", "You previously declined this option", "New to your restaurant".
Ranking order everywhere a product is chosen (planner pick, single-product comparison, replacement options): 1 hard requirements/safety → 2 availability for the date → 3 explicit customer instruction → 4 established preference (usual < accepted_alternative < unfamiliar < rejected) → 5 price/overbuy/reliability. Prohibited products are never auto-selected. Rejected products stay proposable (emergency alternative, needs review). History never establishes stock, price, allergen or delivery facts; current API data always validates.

**Permissions are separate.** `Mandate.substitutionPermissions: SubstitutionPermission[] = {id, customer, fromSku, toSku, maxIncreasePct, grantedBy, grantedAt, expiresAt?, revokedAt?}`. Only an active permission (or the existing account-wide `autoSwapSameUse`, which is `false` for Bistro Kallio) lets the agent substitute without asking; then `issue.decidedBy = 'policy:<id>'`. Preference events never create, widen or extend permissions. Routes: POST /api/permissions `{fromSku,toSku,maxIncreasePct}` (explicit user opt-in, audited), DELETE /api/permissions/:id (revoke, audited), GET via /api/profile.

**S51 best replacement (aleksei, 15 Nov).** `Mandate.autoPickReplacement: boolean` (default `true`). When a line is unavailable or past cut-off and no permission or same-use rule applied, the gateway picks the top-ranked option that (a) has a price (contract-priced options first; a list price keeps its price check in validation), known stock covering the quantity and a deliverable date, (b) breaks no hard rule (`breaksHardRule`: no forbidden allergen, explicit free-from evidence, line diet), (c) was not rejected before, and (d) costs at most `maxSubstituteIncreasePct` % or 25 EUR more than the original line, whichever is larger (as the same-use rule). Then `issue.decidedBy = 'gateway (best replacement)'`; it counts as adjusted, is audited, and the buyer can change or undo it. Otherwise the line waits for the buyer. Short stock is never auto-decided. Final validation and the mandate still apply.

**S51 prices (aleksei, 15 Nov).** Valio's `catalogPrice` is the price this customer pays today and is a valid order price. `netPriceFound=false` only means there is no negotiated contract price: the line is labelled "List price" and is not blocked. `price_unverified` now means Valio returned no valid price (missing or ≤ 0).

**S52 safety sign-off (aleksei, 15 Nov).** `allergen_unknown` (no explicit free-from evidence for an excluded allergen) and `diet_unverified` (no catalogue claim for a requested diet) are sign-off checks like `stock_unknown`: they never block the buyer and are never presented as safe; the order goes to the approver, whose approval is recorded as "dietary safety confirmed by <approver>" for the named products. `allergen_forbidden` (contains or may contain an excluded allergen) and `substitution_unverified` still block. The best-replacement rule never picks a substitute that declares an allergen the original did not. A litre-for-kilogram conversion ("1 l counted as 1 kg") is an approximation note, not a blocking quantity check.

**Learning.** Choosing a replacement option (`chooseOption`) records `substitution_accepted` (sku=chosen, forSku=original, source live). Choosing a different option than the first-ranked proposal records `substitution_rejected` for the proposal. Accepting never places the order and never changes the mandate. When accepted count for a pair reaches 3 and no active permission exists, the line carries `offerPermission:{fromSku,fromName,toSku,toName,accepted:number}`.

**Usual order.** `purchasingIntent` adds `'REORDER'` for "my usual …", "same as last week", "regular/normal order", optional category ("dairy"), optional scaling ("30% more customers" → ×1.3, stated as an assumption in `basket.notes`), optional extras ("but add 10 litres of milk" → extra direct item). Items = SKUs present in ≥ half of the 8 orders (or last week's order for "same as last week"); qty = median historical sales units (scaled, rounded to sales lots). Current price/stock is then checked through the normal planner; unavailable usual products become issues whose options are ranked by preference. Result is a normal editable basket (`intent:'REORDER'`).

**Basket additions.** `BasketLine.preference?: Preference` (for the selected SKU; for issue options `Option.preference?: Preference`). `BasketLine.offerPermission?` as above. `Basket.summary: {usual:number; adjusted:number; attention:number; items:{lineId?:string; kind:'unavailable'|'substitution'|'price_increase'|'late'|'pack_rounding'|'over_limit'|'stock_signoff'|'needs_choice'; text:string}[]}` computed in recompute from the basket's own records: attention = open issues + lines with blocking checks (+1 grouped order-level item when any line has unknown stock needing sign-off, +1 if over the spending limit; unknown stock is Valio's placeholder on most Stock items, so it is never flagged per line); adjusted = decided substitutions + lines whose pack rounding or scaling changed the quantity; usual = remaining lines with preference status `usual`. Counts always equal the cart contents.

**Dev-only reset.** POST /api/dev/reset (only when `DEV_TOOLS=1`; 404 otherwise) restores baskets/orders/preference events/permissions to the synthetic baseline. `bun run demo:reset` calls it. No public scenario selectors.

Additive (S48): POST /api/basket/:id/refresh `{by?}` re-checks price/stock for the draft's live lines, stores them and `checkedAt` on the basket, audits a `recheck` event and returns `{basket, changes}`. 409 once the basket was sent (approval re-checks anyway).
