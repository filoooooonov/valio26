---
title: Bistro Kallio's usual weekend order
app: http://localhost:5173
viewport: 1600x900
camera: auto
---

<!--
  Walkthrough: usual order from purchase history → learned preferences explained → an unavailable product becomes the
  buyer's decision → Mikko approves the exact revision → confirmed (simulated) → an outside agent hits the same rules.
  Creates a simulated local order and approval, and runs video/record/agent-milk.ts (one more pending agent order).
  The app's state drifts between takes (each placed order joins the purchase history), so steps that depend on it are
  ", optional". agent-milk.ts picks "next Monday" via toISOString(): between 00:00 and 02:00/03:00 local time it picks
  today's date and the order is refused (409) instead of pending, so record outside that window.
-->

# Intro
card "Your usual weekend order, in one sentence" "Valio Aimo · Trusted trade agents"
hold 5s
> Say: You run Bistro Kallio. Every weekend you order much the same from Valio Aimo.

# Your usual weekend order
open /
hold 0.5s
type "Prepare my usual weekend order." into "Message the assistant"
click "Send"
wait for "Review and confirm" or "Resolve 1 product issue" #1 up to 150s, cut
hold 4s
> Say: You ask the assistant in the webshop you already use. It builds the cart from your purchase history, with today's prices and Friday's stock. No menu step.

# It knows what you usually buy
zoom on "needs you" or "need you" x1.5
hold 3.5s
zoom out
click "Why Helmi chose this" #3
wait for "Purchased in"
zoom on "Purchased in" x1.4, optional
hold 5s
zoom out
press Escape
hold 0.5s
> Say: The summary shows what's usual, what was adjusted and what needs you. Every line explains itself: this butter was in all of your last eight orders, converted into whole packs.

# A switch you made becomes your usual
click "Why Helmi chose this" #1
wait for "Purchased in"
zoom on "Purchased in" x1.4, optional
hold 10s
zoom out
press Escape
hold 1s
> Say: Your ten-litre cooking cream kept missing Friday's cut-off, so recently you took one-litre packs instead. Helmi learned that from your history: they're now part of your usual, with the reason one tap away.

# Review before anything is sent
click "Review and confirm"
hold 3s
click "Send to Mikko for approval" or "Place order"
wait for "Remind Mikko" up to 20s, cut
hold 4.5s
> Say: Valio can't confirm stock for some lines, so instead of placing the order, the server routes it to Mikko, your purchasing approver.

# Mikko approves the exact revision
open /?view=mikko
wait for "Approve and send" #1 up to 20s, cut
zoom on "Approve and send" #1 x1.2, optional
hold 4s
click "Approve and send" #1
hold 3.5s
zoom out
> Say: Mikko sees the exact order and total. His approval is tied to this exact revision, and prices and stock are re-checked when he approves.

# The order is confirmed
open back
wait for "Order confirmed" or "Order complete" up to 20s, cut
zoom on "Order complete" x1.3, optional
hold 5.5s
zoom on "Local prototype order" x1.6, optional
hold 5.5s
zoom out
> Say: Back in your webshop, the order is confirmed at fixed prices. To be clear, it's a local simulation: Valio's API has no order endpoint, so nothing is sent to Valio.

# Any agent, same rules
run "node --no-warnings video/record/agent-milk.ts" as terminal
hold 13s
> Say: Your own purchasing agent can use the same engine over open MCP. It asks for a thousand litres of lactose-free milk, gets your prices and stock, and lands in Mikko's queue. When it tries to approve its own order, the server says 403.

# Outro
card "Your usual order, your rules, your sign-off" "One open MCP + REST gateway"
hold 7s
> Say: Your usual order in one sentence, every choice explained, and a human sign-off whenever an order goes outside your rules.
