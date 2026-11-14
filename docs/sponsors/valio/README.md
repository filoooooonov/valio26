# Valio Aimo: sponsor resources (Junction 2026)

Portal: https://junction26.valioaimo.fi/ (password and API key are in the challenge text on the Junction platform; **never commit them**).
Put the key in `.env` as `VALIO_API_KEY`. All data is synthetic and may only be used for this challenge.

## What they give us
| Thing | Where |
|---|---|
| Mock **Pricing** API: `POST /api/price` | `openapi.json` |
| Mock **Availability** API: `POST /api/availability` | `openapi.json` |
| `GET /api/ping` → `{"status":"ok"}` | |
| Product data (17,546 products, 87 MB JSON) | `data/raw/valio/` (gitignored; download from the portal or `GET /api/products/download`) |
| Product data JSON Schema | `product_data_schema.json` |
| Delivery reliability (0–1 per product, CSV) | `data/raw/valio/` (`/api/delivery-reliability/download`) |
| Carbon footprint (avg kg CO2-eq/kg, **per product group**, CSV) | `data/raw/valio/` (`/api/carbon-footprint/download`) |

**There is no search endpoint and no order endpoint.** Search, quote → order, approval and audit are ours to build.
Valio confirmed (Tommi, Sat 14 Nov 09:35): there is no order API for this challenge. It is enough that the solution produces
orders for human approval; they don't need to be sent anywhere. A webshop account is available at the booth, but it is
production, so orders can't be placed there.

Auth: header `X-API-Key: $VALIO_API_KEY` on everything under `/api`.
Price/availability body: `{"customer":"123","requestedDate":"2026-11-16","products":["463335", ...]}` (1–1000 ids; customer is ignored).

## Spike results (Fri 13 Nov, 21:52)
Example request "1,000 L lactose-free milk by Monday (2026-11-16)": 92 products match by name, priced and available.

- **Availability has real behaviour.** `Stock` items show real quantities (51, 192, 698, 4493 units). Some show placeholder "infinite"
  values (9999999999, 666666666). `Terminal` items (supplier warehouse) always return 999999.
  **Confirmed by Valio (Tommi, Sat 14 Nov):** any availability **≥ 999999 means "availability unknown"**, and their current
  logic **allows ordering any quantity**. These values typically appear on Terminal products that Valio doesn't stock itself.
  **Empty availability = not available** (some products return empty `scheduleLines`: no deliverable date).
- **Cut-off times matter.** Stock items close Sun 15 Nov 17:00. Terminal items show `closingTime` **Thu 12 Nov 15:00**, which had
  already passed when we queried, yet they still listed `availableDate` 16 Nov.
  **Confirmed by Valio (Tommi, Sat 14 Nov):** `closingTime` is the order cut-off for that line's `availableDate`. The mock data
  (dates and cut-offs) **stays the same all weekend**; in real life it would shift. So the passed Terminal cut-offs are
  permanent in the demo data: treat them as real "ordering closed for that date" exceptions (the gateway already does).
- **Prices:** `catalogPrice` per sales unit, `comparisonPrice` per L/KG (great for ranking), `netPriceFound` = customer-specific price.
  Cheapest lactose-free milk was ~€1.01/L (464306, Stock); a 10 L Novobox was €1.57/L (463038, Terminal).
- **Units:** `salesUnit` codes (ST piece, KI case, PRK, PAK, RAS) plus `units[]` with `sizeInBaseUnits` and `allowedLotSize`. Converting
  "1,000 L" into order lines needs unit maths, so do it in the gateway rather than the LLM.
  **Confirmed by Valio (Tommi, Sat 14 Nov):** `allowedLotSize = 0.01` (e.g. on boxes) must be **treated as 1**. Fractional
  boxes are not orderable; always round to whole sales units.
- **Rate limits (Tommi, Sat 14 Nov):** limits may be adjusted during the weekend. Hitting the limit returns **HTTP 429 and
  blocks the key for 30 seconds**; implement something that honours 429. A few hundred calls per minute is fine; that many
  within 10 seconds is not.
- **Rich product data for guardrails and substitution** in `synkkaData.classifications[]`:
  - `allergen` (e.g. `AM` = milk, `CONTAINS`/`MAY_CONTAIN`), `nonAllergen`
  - `nutritionalClaim` (e.g. `FREE_FROM_LACTOSE`, `FREE_FROM_ADDITIVES`)
  - `packagingMarkedLabel` (e.g. `GOODS_FROM_FINLAND_BLUE_SWAN`, organic labels): the sustainability and certificate labels
  - `nutritionFact`, `gda`, plus `ingredients[]` with origins, `countryOfOrigin`, `vendorName`, `category`, `temperatureCondition`
  - Coverage: classifications on 17,535 of 17,546 products; ingredients only on 3,746.
- Names come in en/fi/sv (`synkkaData.names`). Search should cover all three.

**Verdict:** rich enough for "find → compare → order within mandate → escalate" plus allergen-safe substitution. The SPIKE kill criteria are not met.
