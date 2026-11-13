# Spread (Bahn Express, track 106)

**Problem:** build a system that does a Bahn **dispatcher's** job for one simulated week in Finland. It quotes dealers for
car deliveries against a competitor, posts the won deliveries as gigs for freelance drivers, and sets and raises the fees.

**Goal:** **highest gross margin** (dealer revenue minus driver fees). **Hard constraint:** at least 90% of cars delivered on time, or you're out of the ranking.

**The world:** 30 towns, about 1,000 price requests a week, up to 3 delivery options per request, a competitor whose prices adapt (it undercuts
dealers you win often), drivers with hidden costs who sometimes wait for a raise, and dealer notes in fi/sv/en (ready at 14:00, plates needed). Late refunds: 10% if 2h late or less, 25% if 24h or less, 50% if 2 business days or less, otherwise the full price.

**Loop:** `price_request` → quote (within 15 min) → `order_won` → post gig or offer it to a driver → `gig_booked` → `picked_up` →
`delivered`. You also have to handle `gig_dropped`, `no_show`, `driver_late`, `gig_expired`, `deadline_close` and `order_changed`.

**How it's judged:**
1. The final is one secret level-5 week, about 32 min of real time, ranked by margin €. It only has to put you in the **top 10**.
2. The top 10 then present (5–6 slides or a short video), judged on **elegance, clarity, creativity and robustness** of the approach.

**Reference results (level 5):**
- Starter: 6.6%, about €2.3k a week
- Starter with fixes: 17.5%, about €6k
- Bahn's best: **38%, about €16.6k**
- Cheating oracle: 55%

**Practice:** deterministic seeds, unlimited weeks of about 1 second each, and 5 levels. Ranking rounds and test finals run during the event.
**Prizes:** TBC. **Deadlines:** the final's start time is set by the organisers. The event-wide submission is still needed.
