# DEMO.md: the exact demo script

The stage demo is three minutes; the pitch video must be at most two minutes.

## Setup

1. Install dependencies and provide the existing local .env credentials and data/raw/valio/ sponsor data. Run bun run dev; open http://localhost:5173 and http://localhost:5173/?view=mikko in separate tabs.
2. The current buyer is Anna at Hotelli Kaleva. Delivery defaults to Friday 20 November 2026; the event is Saturday 21 November. Override delivery with ?date=YYYY-MM-DD only when the sponsor data supports it.
3. The gateway enforces a EUR500 per-order and EUR1500 daily limit. Same-use swaps can be automatic under the gateway rule; other substitutions require the buyer's choice. An over-limit order requires Mikko L.'s approval.
4. Repeated takes share today's pending and placed totals. A basket below EUR500 may therefore still require daily-limit approval. Restarting the gateway clears its in-memory baskets/orders; preserve evidence before restarting.
5. This is a prototype webshop and local order ledger. Valio's sponsor API supplies real price/availability responses but has NO order endpoint. An approved order is recorded locally; it is not transmitted to Valio Aimo. State this aloud despite the existing UI's misleading 'sent to Valio Aimo' wording.

## Try it yourself

Open http://localhost:5173. If unavailable, run `bun run dev` from the repository root and leave the terminal running.

1. Select **New request** if an earlier basket is shown.
2. Enter **Ingredients for a catering event for 50 people on Saturday, one vegan option** and press **Send**.
3. Review the suggested menu in chat. Select or remove categories, use **Edit** to adjust one, and add **Fruits** with the category field or by typing **add fruit** in chat. No products, prices or stock are fetched at this stage.
4. Select **Find products for this menu** to approve the menu and fetch the real basket.
5. Resolve any substitution choices, then select **Review and confirm**. Select **Place order** or **Send to Mikko for approval**, as offered.
6. If needed, open http://localhost:5173/?view=mikko, identify your order by its identifier and total, and select **Approve and send**. Return to the buyer tab and select **View order** for the audit trail.

Product rows show concise delivery, quantity and total. **Product details** reveals the calculation and product history. Swap controls appear only on problem items. The chat still scrolls while its scrollbar is hidden.

Repeated demos share pending and placed spending, so even a basket below EUR500 may need approval under the EUR1500 daily limit. Orders are local prototype records, not sent to the sponsor. Restarting the gateway clears its in-memory baskets and orders.

The verified script below records the earlier direct-basket run; the app now adds menu approval before that flow. Per user instruction, the video has not been re-recorded for these UI changes.
## Script

| # | Say | Do | Expected | Verified |
|---|---|---|---|---|
| 1 | Anna plans a catering event inside her wholesaler's webshop. | Show the empty assistant and draft. | Aimo branding, delivery slot, location. | Yes, 14 Nov 10:28 local |
| 2 | One request becomes a priced, stock-checked order draft. | Enter 'Ingredients for a catering event for 50 people on Saturday, one vegan option'; press Send. | Dishes, quantities, customer prices and stock. Planner output varies; this take had 15 lines and four dishes. | Yes, 10:29 |
| 3 | Only candidate products are checked, never the whole catalogue. | Show the checked-products summary and per-line quantity reasoning. | This take: 74 candidate products, four price/availability calls, seven same-use swaps. | Yes, 10:29 |
| 4 | A fish substitution needs Anna's choice. | Choose the available salmon option in the assistant; resolve any further open cards before review. | Choice recorded, total updated. This take: EUR230.15. | Yes, 10:29 |
| 5 | The gateway checks both order and daily limits. | Review and confirm; click Send to Mikko for approval if required, otherwise Place order. | This take exceeded today's daily total, so order o_8aatyr became pending_approval. | Yes, 10:29 |
| 6 | Mikko approves after a fresh price and stock check. | In ?view=mikko select this request and Approve and send; return to Anna and View order. | Local status placed, fixed snapshot, named approver and complete audit trail. No real sponsor order submission. | Yes, 10:29-10:32 |
| 7 | An outside agent uses the same gateway and cannot approve itself. | In video/: node record/agent-milk.ts. | Five MCP tools; 1000 one-litre lactose-free milk packs at EUR1560; pending approval; self-approval HTTP403. | Yes, 10:30 |

## Four pillars: where each one shows (spec: TRUST.md)

| Pillar (brief) | Demo moment | Say |
|---|---|---|
| **Trust protocol** | Step 7: the outside agent runs `check_stock`, then `verify_receipt`. The real receipt verifies; a copy forged at half price is rejected. | "Every price and stock fact is a signed receipt. Any agent can check it against our public key at /.well-known." |
| **Guardrails model** | Footer link **Who decides what**: the gateway, buyer and approver columns. Step 5: the limits trigger. Step 7: self-approval gets HTTP 403. | "The rules live in the gateway, not in a prompt. Same rules for the webshop and for any agent." |
| **Response logic** | Step 4: the issue card shows **Best / Better / Good** with a one-line reason (allergens, on-time %, price, CO₂). Short lines offer "Take the N available". | "Ranked inside Valio's own assortment: safety first, then reliability, price and CO₂." |
| **Audit trail** | Step 6: **View order**. Switch **Buyer view** / **Valio view**; "Record intact" badge; **Download audit record (JSON)**. | "Every step is hash-chained. Valio and the buyer read the same record, and any change is detected." |

Check before recording: `node video/record/agent-milk.ts` output includes "signature valid" and "forged copy … rejected".

## Evidence and remaining limits

See [demo-verification](docs/demo-verification.md) for commands, identifiers and screenshots.
The UI now says an approved order is recorded locally and shows the order cut-off instead of a stock hold (fixed 14 Nov evening). The header can show a gluten-free count inferred from planned dishes although that diet was not requested; do not describe that as a verified guest requirement. Sustainability ranking and three consistently ranked alternatives were not established in this run.

## Fallback

Play [the recorded demo](artifacts/demo-video/final.mp4): 50.70 seconds, 1920 x 1080 H.264, with captions and no voiceover. Re-record/render/check instructions: [tools/demo-video/README.md](tools/demo-video/README.md). The final cut includes buyer approval, the audit trail, the real external MCP request, denied self-approval and human approval. Orders are local prototype records.

## Sample Minun Aimo context

Before menu review, missing guest count and dietary requirements appear in the anchored event-details popup. Use the guest counter and dietary/allergy checkboxes (or explicitly choose no restrictions); budget and additional notes are optional. Delivery is selected in the navbar or via the event popup: choose one of the labelled sample places, inspect the interactive map, and confirm date/time. Already supplied guest/diet details and a navbar-selected delivery are reused. No product lookup runs until menu approval. Confirmed people, dietary needs, notes, budget and delivery context are passed to planning; the selected date is sent to stock checking.

Delivery places and time choices are prototype selections, not live account addresses or reserved sponsor slots. Apple Maps is optional: set a domain-scoped MapKit JS token in `app/web/.env.local` as `VITE_APPLE_MAPS_TOKEN` and restart Vite. See `app/web/.env.example`. Without the token, OpenStreetMap remains interactive and a selected place has an Open in Apple Maps link. No live Apple token is included or verified.

Start a new request, review the menu, and enable **Use sample profile** under **Plan with your menu margins**. The optional profile details show synthetic Restaurant Kaleva data: EUR12.50 net selling price per guest, EUR4.60 historical ingredient cost, a30% food-cost target (EUR3.75 per guest), and illustrative monthly operating EBITDA. No Minun Aimo account or reports API is connected.

Approve with **Find products for this menu**. The order shows actual gateway-priced basket cost per guest against the sample target. Where a backend-checked cheaper alternative exists, **Review product option** opens the normal substitution review. Menu/diet changes remain buyer choices. Provisional totals and already-included savings are labelled. No saving is presented as a verified EBITDA increase.

Order completion now has its own summary with collapsed products; live confirmation shows a dismissible green popup and a persistent chat card. Product details retain original catalogue identity and keep the image aligned. The chat follows new messages without pulling readers away from older messages. All recordings remain as previously saved.
