# DECISIONS.md

One line per decision: `YYYY-MM-DD HH:MM · who · decision — why`

- 2026-11-13 13:30 · aleksei · Shortlist MariaDB / Valio Aimo / Bahn Spread. Final pick pending.
- 2026-11-13 13:30 · aleksei · Agents coordinate through a Convex-backed team board MCP plus hooks, because we need real-time file claims and @mentions across two laptops.
- 2026-11-13 13:30 · aleksei · Stack is chosen per challenge at lock-in, because each challenge favours a different stack.
- 2026-11-13 22:45 · aleksei · Locked valio-trade-agents — spike passed (real stock/cut-off behaviour + allergen data), clearest fit for gateway + approval console; differentiate on the trust layer (signed offers + mandates) since agents+MCP is crowded.
- 2026-11-13 23:30 · aleksei · Mentors OK'd using product images from valioaimo.fi in the app, demo and pitch — removes the usage-rights blocker for EAN-matched photos.
- 2026-11-13 23:45 · aleksei · Re-plan on the official rubric (demo 30 / need 20 / guardrails 20 / exceptions 15 / openness 15) + mentor meeting: hero demo is "catering for 50 on Saturday" in an Aimo-branded webshop assistant → basket → approval; the 1,000 L milk external-agent order is the openness/guardrails step. The in-site assistant is one client of the open MCP gateway, so "assistant in our website" and "not a chatbot / outside agents" both hold.
- 2026-11-13 23:45 · aleksei · Signed offers / VC mandates moved to Next: openness is 15% and is better served by MCP + OpenAPI + audit export; user need + working demo are 50%.
- 2026-11-13 23:45 · aleksei · Web app uses Valio Aimo's brand 1:1 (fonts hotlinked from valioaimo.fi, not committed, as the repo goes MIT) because they asked for an assistant inside their existing site.
- 2026-11-14 08:50 · aleksei · Solo build: aleksei owns everything (web, server, contract), with Claude agents doing the work (Codex retired 14 Nov). Ayaan is not on this project — removes the cross-owner PR step and the server hand-offs.
- 2026-11-14 10:30 · aleksei · Orders stay in our gateway's record and are never sent to Valio — Tommi (Valio) confirmed there is no order API and that producing orders for human approval is enough.
- 2026-11-14 10:30 · aleksei · Pitch the mandate as new value: Valio's systems enforce no approval gates today (customers rely on internal instructions or manager-only ordering), and Tommi said agent orders need a human approval for now. Every agent-prepared order keeps a human confirmation; autonomy within the mandate is a roadmap setting, not the default.
- 2026-11-14 10:30 · aleksei · Same-use swaps (same product group, no new allergen, never fish/meat, at most +20 % or +€25) are made by the gateway under a mandate rule (`autoSwapSameUse`) and logged; every other swap waits for the buyer. Without it the hero request asked the chef 6 questions; now about 3.
