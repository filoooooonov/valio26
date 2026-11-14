# Trusted commerce pivot

## Verified starting point — 14 November 2026

The stack is Bun/Hono/TypeScript, not Python. React/Vite in `app/web` provides the existing Valio Aimo kit, tokens, assets, chat, menu approval, cart, replacement dialogs and scheduled-menu screens. Preserve these as the visual source of truth. No framework replacement is needed.

`menu.ts`/`llm.ts` handle Claude language work. `plan.ts` already separates candidate lookup, SKU allowlisting, package maths, basket edits, independent additions and same-use substitutions. `catalog.ts` searches local sponsor data. `valio.ts` calls shortlisted pricing/availability endpoints. `orders.ts` rechecks prices/stock and applies `policy.ts`; `audit.ts` feeds the existing audit dialog. REST (`app.ts`) and MCP (`mcp.ts`) reuse these handlers.

Sponsor contracts: `docs/sponsors/valio/openapi.json`, product schema and README. The portal is password protected; public browser fetch was unavailable. The checked-in contract has pricing, availability and downloads, **no order endpoint**. The README records sponsor confirmation on 14 November. Existing `placed` is a local simulation, never sponsor acceptance. Never place production orders.

## Gaps and minimum changes

- The website starts with menu/guest clarification for explicit products. Route product quantities directly, preserving event menu planning.
- The milk fallback exists; structured direct requests need a deterministic path independent of Claude.
- Caller-provided customer and `by` currently act as identity. Add configured bearer principals, customer scoping and separate approver authority; protect legacy paths in authenticated mode. Existing unauthenticated local demo mode must be labelled and documented.
- Approval currently accepts changed prices. Bind it to a revision of customer, delivery, SKUs, quantities and prices; changes require renewed review.
- Unknown availability or allergen evidence must require intervention. Retain explicit negative-allergen evidence from the sponsor slim dataset; empty arrays do not prove safety.
- Persist local simulated orders and audit evidence, serialize order mutations, and handle duplicate retries.
- Scheduled menus are currently device-local projections and manual draft preparation. Add backend recurring execution with fresh lookup, without claiming an unattended worker exists.
- Add versioned validated REST/OpenAPI, an external client, focused tests and reproducible demos.

## Phases

1. P0: structured direct flow, final deterministic validation, scoped API authentication, exact approval revisions and persistent labelled simulation. Run focused tests after changes.
2. P1: recurring execution with fresh data, substitution evidence, readable audit and policy configuration using existing patterns. Synthetic fixtures must be labelled.
3. Demo documentation, fast suite and frontend build. Keep all styles/assets/tokens unchanged; inspect existing screenshots and capture current UI when practical.

## Assumptions and risks

The mock ignores customer IDs; customer-price flags are mock evidence, not a production account integration. Dates/cutoffs are fixed demo data. Unknown stock is not verified unlimited stock. Explicit allergen-free coverage may be sparse and correctly cause escalation. Local persistence is single-process hackathon storage, not a production database. Credentials stay server-side. Unauthenticated local demo mode is unsuitable for internet deployment. No fulfillment, reservation, price hold or delivery-slot guarantee is implied.

## Validation

Test menu bypass, packaging, backend limits, scoped credentials/denied self-approval, allergens and missing data, substitution/escalation, revision changes, duplicate/concurrent submission and recurring price refresh. Run existing fast tests and frontend build.
