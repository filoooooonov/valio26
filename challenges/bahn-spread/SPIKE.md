# Spike: Spread

**Riskiest assumption:** two people can get from the starter's 6.6% to the **20%+ needed for the top 10** within about 24h, using
only what a dispatcher can observe. That means learning competitor prices and driver acceptance from feedback, while staying above 90% on time.

**30-minute experiment:**
1. (5 min) Run the starter on 10 seeds at level 5 and record the baseline margin and on-time %.
2. (15 min) Make the two "obvious fixes": raise fees early before `deadline_close`, and skip quoting for routes we can't staff.
   Re-run the same 10 seeds.
3. (10 min) Run reveal-csv on one week. Can we see enough (dealer accept/reject per quote, who looked at gigs) to fit a
   simple price-acceptance model per dealer and route?

**Kill criteria:** if the obvious fixes don't get close to about 15% in 30 min, or the kit and server aren't available early on Friday,
deprioritise. Ranking rounds reward an early start.
