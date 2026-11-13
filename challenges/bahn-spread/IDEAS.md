# Ideas: Spread

Team fit: Ayaan's backend and ML skills are the core here (pricing and fee policy). aleksei's frontend work becomes the dashboard and the
presentation, which decide the win once we're in the top 10. Weakest fit for the frontend overall.

1. **Learned bid-shading plus a fee escalation ladder**
   - Pricing: per dealer and route, estimate the competitor's price from wins and losses (a bandit or logistic model), then quote just under it.
     Skip unprofitable cars.
   - Fees: start low and raise the fee on a schedule tied to time-to-deadline and driver supply in the origin town.
   Rubric: margin, plus elegance and clarity in the presentation.

2. **Route batching**
   Combine nearby cars into one gig ("a second car costs only extra time"), and make direct offers to drivers who live nearby.
   Rubric: margin and creativity. Stack it on top of 1.

3. **Robustness layer**
   An LLM parses the fi/sv/en dealer notes into constraints (earliest pickup, site close, plates). Reconnect and catch up cleanly
   after a restart.
   Rubric: robustness, which matters at level 5.

**Pick:** 1, then 3 (cheap with an LLM), then 2 if time allows. A live dashboard throughout.
