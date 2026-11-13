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

Auth: header `X-API-Key: $VALIO_API_KEY` on everything under `/api`.
Price/availability body: `{"customer":"123","requestedDate":"2026-11-16","products":["463335", ...]}` (1–1000 ids; customer is ignored).

## Spike results (Fri 13 Nov, 21:52)
Example request "1,000 L lactose-free milk by Monday (2026-11-16)": 92 products match by name, priced and available.

- **Availability has real behaviour.** `Stock` items show real quantities (51, 192, 698, 4493 units). Some show placeholder "infinite"
  values (9999999999, 666666666). `Terminal` items (supplier warehouse) always return 999999, which means unknown, not unlimited.
  Some products return empty `scheduleLines`, which means they can't be delivered on any date.
- **Cut-off times matter.** Stock items close Sun 15 Nov 17:00. Terminal items show `closingTime` **Thu 12 Nov 15:00**, which had
  already passed when we queried, yet they still listed `availableDate` 16 Nov. ⚠️ Ask a mentor whether a passed closingTime means we
  can't order for that date. Either way it's a good trap for the agent to catch.
- **Prices:** `catalogPrice` per sales unit, `comparisonPrice` per L/KG (great for ranking), `netPriceFound` = customer-specific price.
  Cheapest lactose-free milk was ~€1.01/L (464306, Stock); a 10 L Novobox was €1.57/L (463038, Terminal).
- **Units:** `salesUnit` codes (ST piece, KI case, PRK, PAK, RAS) plus `units[]` with `sizeInBaseUnits` and `allowedLotSize`. Converting
  "1,000 L" into order lines needs unit maths, so do it in the gateway rather than the LLM.
- **Rich product data for guardrails and substitution** in `synkkaData.classifications[]`:
  - `allergen` (e.g. `AM` = milk, `CONTAINS`/`MAY_CONTAIN`), `nonAllergen`
  - `nutritionalClaim` (e.g. `FREE_FROM_LACTOSE`, `FREE_FROM_ADDITIVES`)
  - `packagingMarkedLabel` (e.g. `GOODS_FROM_FINLAND_BLUE_SWAN`, organic labels): the sustainability and certificate labels
  - `nutritionFact`, `gda`, plus `ingredients[]` with origins, `countryOfOrigin`, `vendorName`, `category`, `temperatureCondition`
  - Coverage: classifications on 17,535 of 17,546 products; ingredients only on 3,746.
- Names come in en/fi/sv (`synkkaData.names`). Search should cover all three.

**Verdict:** rich enough for "find → compare → order within mandate → escalate" plus allergen-safe substitution. The SPIKE kill criteria are not met.
