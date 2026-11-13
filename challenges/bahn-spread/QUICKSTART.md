# Quickstart: Spread

**Stack:** TypeScript and Bun, matching their kit. `app/server` is the dispatcher bot plus an experiment runner. `app/web` is a live
dashboard (margin, on-time %, quotes won/lost, fee curves) for the presentation and for debugging.

## Get access
- `SPREAD_URL` and `SPREAD_KEY` (team key) come from the organisers on Friday.
- The kit lives at `$SPREAD_URL/kit/` (TS needs Bun or Node 22.18+, and Python 3.9+ also works). The API spec is at `/openapi.json` (HTTP plus a WebSocket event stream),
  and there's a viewer at `/viewer/` and a map at `/v1/map`.
- Save `HANDBOOK.md` and `openapi.json` to `docs/sponsors/bahn/` **first**. Every event type is documented there.
- `.env.example` additions: `SPREAD_URL=`, `SPREAD_KEY=`.

## Run the starter
```bash
# copy the TS kit into app/server/kit/
bun starter.ts --seed spread-1          # one practice week, ~1s
bun reveal-csv.ts <world id>            # dump what a dispatcher learns after the week
```

## MCP
None announced.

## First harness to build (hour 1)
`bun run sim --seeds spread-1..spread-50 --level 5` should print the mean and p10 margin and the on-time % for each strategy version.
Same seed means an identical result, so it gives a true A/B test on every change.
