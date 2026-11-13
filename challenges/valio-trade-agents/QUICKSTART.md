# Quickstart: Valio Aimo

**Stack:** TypeScript and Bun. `app/server` is the wholesaler-side "agent gateway" (an MCP server plus REST with OpenAPI). `app/web` is the human
approval console and audit log. A demo buyer agent uses the Claude API with tool use against the gateway.

## Get access
- Mock API base URL, docs and synthetic catalog: from the Valio Aimo mentors or the challenge page on Friday. Save them to `docs/sponsors/valio/`.
- An LLM key for the buyer agent.
- `.env.example` additions: `VALIO_API_URL=`, `VALIO_API_KEY=` (if any), `ANTHROPIC_API_KEY=`, `APPROVAL_SPEND_LIMIT_EUR=500`.

## SDK
```bash
cd app/server && bun add @modelcontextprotocol/sdk zod hono
cd app/web && bun create vite . --template react-ts
```

## MCP
Our gateway **is** an MCP server. That's the "open standard" story. Sponsor MCP: none announced.

## Hello world
```bash
curl "$VALIO_API_URL/products?q=lactose-free%20milk"    # shape TBD, so read their docs first
```
Then wrap it as an MCP tool, `search_products(query, qty, deliver_by)`, that returns structured offers and a provenance block
(source, timestamp, signature).
