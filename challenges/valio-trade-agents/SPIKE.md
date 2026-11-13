# Spike: Valio Aimo

**Riskiest assumption:** the mock API is rich enough for a compelling **"order within authority → escalate"** demo:
partial availability, lead times, and substitutable products. It also has to allow a differentiated idea, since we expect **many** teams to
build "LLM agent + MCP tools" here.

**30-minute experiment:**
1. (10 min) Read the mock API docs and hit every endpoint. List what's real and what we'd have to simulate.
2. (10 min) Run the example query ("1,000 L lactose-free milk by Monday") by hand. Does any supplier come up short? Are
   there substitutes? Are there sustainability certs?
3. (10 min) Ask a mentor: "What would make you say *this is how we'd actually do it*?" Write the answer into BRIEF.md.

**Kill criteria:** if the API is just a static product list with no availability or lead-time behaviour, the demo is thin, so deprioritise.

## Result (Fri 13 Nov 21:52): PASS
See `docs/sponsors/valio/README.md`. The API is price and availability only, so search, order, approval and audit are ours to build.
Availability shows real limited stock, cut-off times, Terminal (unknown qty) vs Stock, and undeliverable items. Product data has
structured allergens, FREE_FROM claims and labels, which is enough for mandates and allergen-safe substitution.
Open mentor question: does a `closingTime` in the past mean the date can't be ordered?
