# Valio Aimo brand: taken exactly from valioaimo.fi

Source of truth: the live theme CSS `https://www.valioaimo.fi/wp-content/themes/aimo/dist/frontend.413d511b910b9737b923.css`
(`:root` variables, `.wp-block-button__link`, `.site-header*`) plus the pen.dev capture `valio.pen` (cards, tiles).
Implemented in `app/web/src/theme.css` with **their variable names**, so values can be diffed against the site.
Rule: don't invent brand values. If something isn't on valioaimo.fi, use their nearest token.

## Fonts (exact)
| Role | Family | File on valioaimo.fi |
|---|---|---|
| Headings, buttons | **National** (Klim "National 2 Compressed Bold", one weight 700; CSS asks 900 → same file) | `/wp-content/themes/aimo/dist/3469f3281682a16d1d10.woff2` |
| Body | **Matter** 400 | `.../935bdebfee65ae201c7f.woff2` |
| Body bold | **Matter** 700 | `.../69d4f8cacb3bf995a496.woff2` |

Loaded at runtime from valioaimo.fi (`Access-Control-Allow-Origin: *`). **Never commit the font files**: they're commercial
and the repo goes MIT at submission. Offline fallback is helvetica/arial (their own fallback stack).

## Colours (their `:root`)
`--color-brand-aimo #005670` · `--color-brand-aimo-dark #003747` · `--color-green-aimo #c0e021` (hover `#abc80b`) ·
`--color-light-blueberry-aimo #eee8f5` · `--color-light-blue-aimo #f2f7f8` · `--color-blueberry-aimo #c7b2de` ·
`--color-violet #3f1f6b` · `--color-yellow-aimo #fddb32` · `--color-red-aimo #f9423a` / light `#ffc9c6` ·
`--color-light-green-aimo #ecf5c5` · `--color-black #23282d` (text).

## Type scale (desktop / ≤781px)
h1 50/37px lh .9 · h2 65/40 (h2-small 40/34, lh .95) · h3 35/30 · h4 32/30 (800) · body 17px lh 1.28 · lead 20 ·
headings are National, weight 900 and colour brand-aimo, in **sentence case**. Only buttons are uppercase.

## Components
- **Header:** a teal top-nav strip (49px) with white-topped tabs (`radius 4 4 0 0`, Matter 15/700), then a white bar (112px; 65px on mobile)
  with the Aimo logo centred at 96px wide. Logo: `https://cdn-wp.valio.fi/valio-wp-network/sites/2/2025/06/Valio_Aimo_logo_petrooli_RGB-1.svg`.
- **Button** (`.wp-block-button__link`): **square corners**, 2px border, National 19px, letter-spacing .5px, uppercase,
  padding 10px 20px. Variants:
  - default: teal fill, white text
  - green: lime fill, teal text (the shop CTA)
  - outline: teal border, fills dark teal on hover
  - secondary: white fill, teal text
- **Pill:** `#002f6d14` background, radius 20px, Matter 15/700.
- **Card:** white, `radius 4 4 0 0`, an 84px icon tile with radius 4 on top, placed on a lavender (`#eee8f5`) section.
- **Sections:** full-bleed colour bands (lavender, light blue, teal) with 60px vertical padding, content max 1180px, gutter 20px.

## Status colours for the console (from their palette, not invented)
ok = light-green-aimo bg + brand text · pending = yellow-aimo · denied = light-red-aimo.
