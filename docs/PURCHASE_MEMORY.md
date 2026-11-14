# Purchase memory, preferences vs permissions (S48)

Spec: `CONTRACT.md` § S48. Server code: `app/server/src/history.ts`, `preferences.ts`, `reorder.ts`, `summary.ts`,
`policy.ts` (permissions).

- **Synthetic profile.** Account `123` is *Bistro Kallio*, a fictional restaurant. Its 8 weekly orders
  (Fri 2026-09-25 … 2026-11-13) are generated from a fixed seed list of real catalogue SKUs with synthetic prices.
  History only orders choices. It never supplies price, stock, allergen or delivery facts.
- **Creams.** A `476880` (10 l novobox, Terminal, cut-off passed for 2026-11-16 in the real mock API), B `464249`
  (1 l, accepted 3× instead of A), C `469162` (cooking cream alternative, declined once). Evidence is in `history.ts`.
- **Why the usual items are Valio products.** For account 123 the mock API returns a customer price (`netPriceFound`)
  almost only for Valio's own range. Meat, vegetables and dry goods appear as occasional purchases, so the usual
  order is not blocked by unverified prices.
- **Ranking everywhere:** safety → availability → explicit instruction → preference
  (usual < accepted alternative < unfamiliar < declined) → price/overbuy/reliability. Prohibited products are never
  proposed or auto-selected.
- **Learning ≠ permission.** Choosing a replacement records `substitution_accepted` (and `substitution_rejected` for
  a skipped first proposal). After 3 accepts the line offers a permission; only `POST /api/permissions` creates one.
  Policy swaps are logged as `policy:<id>` and don't count as preferences. Undoing a choice retracts its events.
- **Usual order:** "Prepare my usual weekend order." → intent `REORDER` → products in ≥ 4 of the last 8 orders,
  median quantity, current price/stock checked by the normal planner. Also: "same as last week", "my usual dairy
  order", "30% more customers", "… but add 10 litres of milk".
- **Reset:** run the gateway with `DEV_TOOLS=1`, then `bun run demo:reset` (`POST /api/dev/reset`).
