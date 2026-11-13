# Category names and product images: where they come from

Checked 2026-11-13 (aleksei-claude). The sponsor data has category codes (e.g. `17301`) and media ids
(`synkkaData.medias[].id`) only, with no names and no files. The mock API has no category or image
endpoints. The portal https://junction26.valioaimo.fi/ is login-only (redirects to `/login`).

## Source: the public valioaimo.fi product search (WordPress)

- **Product ids don't match.** Our ids (`460000`...) are synthetic. On valioaimo.fi product 460000
  (Forssan Perunasalaatti 400 g) has wholesale number (Tukkutuotenumero) `100727`. **The EAN/GTIN
  matches** (`6409460002724`), so EAN is the join key.
- **EAN lookup:**
  `GET https://www.valioaimo.fi/valio-search-client/products-aimo/?account=valioaimo&search=<EAN>`
  returns `{count, items:[{title, url, image}], facets:[{value:"tuoteryhma=<slug>"}...]}`. This is
  the endpoint the site's own search box calls.
- **Group tree (names):** `GET https://www.valioaimo.fi/wp-json/valio/search/v1/configuration/products`,
  filter "Tuoteryhmät": 410 groups in 3 levels (7 top: Hedelmät ja vihannekset, Juomat, Nonfood,
  Pakasteet, Teolliset elintarvikkeet, Tuore liha ja kala, Tuoretuotteet).
- Product pages: `https://www.valioaimo.fi/toimitustukku/<slug>/` (webshop:
  `https://toimitustukku.valioaimo.fi/<name>/p/<wholesale no>`).

## Categories

Our codes line up with the valioaimo.fi product groups. In the sample, every code with 2 hits
gave the same group for both products (0 conflicts). Examples: `10412` → Tuoretuotteet >
Maitotaloustuotteet > Jogurtit, `41763` → Pakasteet > Leipomopakasteet > Kakut, kakkupohjat ja
leivokset, `63235` → Nonfood > Kattaus, tarjoilu ja somistus > Lautasliinat 34 cm ja isompi.

There is no public code→name table, so names come from a **sample**: 72 EAN lookups (2 per code
for 12 departments, then 1–2 for each of the 40 largest codes), about 1 request/second.

| | Codes | Products |
|---|---|---|
| Real name from valioaimo.fi | 49 / 349 | 7,727 / 17,546 (44%) |
| Inferred, with a likely department (longest code prefix whose verified siblings agree) | 277 | — |
| Inferred, words only | 23 | — |

Inferred labels are the most distinctive en/fi words in the category's product names (count × idf,
brand names removed). The explorer shows them in italics with an "inferred" tag. Department guesses
are wrong in places (e.g. `21991` tortilla chips "likely under Keitot ja kastikkeet").
Mapping saved in `tools/catalog-explorer/aimo-categories.json` (codes + evidence EANs + full tree).

To get 100% real names: ask the Valio mentors for the code→group table, or for permission to run
one EAN lookup per remaining code (~300 requests).

## Images

- **No URL pattern.** Image URLs are SAP Commerce media links with a signed context, e.g.
  `https://imgfly.scarabresearch.com/w_500/https://api.valioaimo.fi/medias/?context=<base64>`,
  where the base64 decodes to `master|root|<size>|image/png|<path>|<sha256>`. It can't be built
  from our media id (52633) or the EAN. You need a lookup per product.
- **Hit rate in the sample:** 57/72 EANs found (79%); 56/72 had a real photo (1 used the default
  image). Misses were office supplies, GN containers and some seasonal bakery items. All 5 photo
  URLs we tested returned HTTP 200 (image/png or image/jpeg).
- **What the explorer does:** when you open a product, the server makes one EAN lookup (throttled
  to about 2/s, cached in `data/raw/valio/images.cache.json`) and hotlinks the returned URL. The
  grid shows photos only for products already in the cache. It never loops over the catalogue.
  If an image fails to load, the emoji tile shows instead. Set `EXPLORER_IMAGES=0` to turn lookups off.
- Usage rights: **mentors confirmed (Fri 13 Nov) we may use images from valioaimo.fi** in the app, demo and pitch.
