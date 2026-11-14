---
title: Valio Aimo trusted purchasing
app: http://localhost:5173
viewport: 1600x900
camera: auto
---

<!--
  The real demo. It creates a simulated local order and an approval, so run it on purpose.
  Edit holds, zoom factors, "zoom out", ", cut" and the > Say lines freely, then re-render with --render-only.
  Planner output varies between takes; ", optional" steps are skipped when the app doesn't show them.
-->

# Intro
card "Catering for 50, prepared in one request" "Valio Aimo · Trusted trade agents"
hold 2s
> Say: You run a hotel kitchen. On Saturday you're catering for fifty people, and you order everything from Valio Aimo.

# You ask in the webshop you already use
open /
hold 0.5s
type "Ingredients for a catering event for 50 people on Saturday, one vegan option" into "Message the assistant"
click "Send"
> Say: You ask the assistant inside the Aimo webshop in plain words.

# The assistant only asks what is missing
wait for "Continue to menu" or "Your menu" up to 60s, cut
click "No dietary restrictions", optional
hold 0.8s
click "Continue to menu", optional
> Say: It already knows the guest count and the delivery slot, so it only asks about dietary needs.

# Agree on the menu before any lookup
wait for "Find products for this menu" up to 90s, cut
zoom on "Your menu" x1.25, optional
hold 2.5s
zoom out
click "Find products for this menu"
> Say: First you agree on a menu. Nothing has been priced or looked up yet, and you can edit any dish.

# Priced, stock-checked basket
wait for "Review and confirm" up to 150s, cut
hold 2s
zoom on "Product details" #1 x1.3, optional
hold 1.5s
zoom out
> Say: Only the shortlisted products are checked against Valio's price and stock API, never the whole catalogue. Every line has a customer price, a quantity and a delivery check.

# An unavailable product becomes a buyer decision
click "Review product option" or "Choose replacement" or "Review options", optional
wait for "Use replacement" or "Keep item", optional
hold 2s
click "Use replacement", optional
hold 1s
> Say: When a product can't be delivered, the gateway proposes a checked alternative. You decide; the agent never swaps silently outside its mandate.

# The spending mandate decides who signs
click "Review and confirm"
hold 1.5s
click "Place order" or "Send to Mikko for approval"
hold 2s
> Say: The order is checked against the mandate on the server: 500 euros per order and 1,500 per day. Anything outside it goes to Mikko.

# Mikko approves the exact revision
open /?view=mikko
wait for "Approve and send" up to 20s, optional
zoom on "Approve and send" #1 x1.2, optional
hold 1.5s
click "Approve and send" #1, optional
hold 2s
zoom out
> Say: Mikko sees the exact order and total. Price and stock are checked again when he approves.

# Why the agent made these choices
open /
click "View order and audit trail" or "View order", optional
wait for "Why the agent made these choices", optional
zoom on "Why the agent made these choices" x1.3, optional
hold 3s
zoom out
> Say: Every decision is explained from recorded facts: why this product, why this quantity, where the price came from, and who approved.

# Any agent, same rules
run "node --no-warnings video/record/agent-milk.ts" as terminal
hold 3s
> Say: An outside hotel procurement agent connects over open MCP. It orders a thousand litres of milk, tries to approve its own order and gets a 403. Only a human can sign.

# Outro
card "Request → Lookup → Order → Approval" "One open MCP + REST gateway"
hold 3s
> Say: One open gateway for the webshop and for any agent, with the mandate enforced by the server and every decision in a readable audit trail. Orders in this prototype are simulated locally; Valio's API has no order endpoint yet.
