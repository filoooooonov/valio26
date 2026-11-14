---
title: Smoke test (places no orders)
app: http://localhost:5173
viewport: 1600x900
---

# Title card
card "Catering for 50, prepared in one request" "Valio Aimo · Trusted trade agents"
hold 1.5s
> Say: This is a two-second check that cards render.

# The webshop
open /
hold 1s
hover "Try: catering for 50 on Saturday"
type "Ingredients for a catering event for 50 people on Saturday" into "Describe what you need…"
zoom on "Helmi" x1.3
hold 1s
zoom out
> Say: We type a request but never press Send, so nothing is created.

# Terminal
run "node -e \"console.log('hello from a real command'); console.log('403 self-approval rejected (example line)')\"" as terminal
hold 1.5s
