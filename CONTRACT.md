# CONTRACT.md: interfaces between our parts

Changes need a PR approved by the other owner. Keep the shapes exact; agents code against this file.

## Owners
- `app/web/` (aleksei) consumes the API below.
- `app/server/` (ayaan) implements it.

## API
_Defined at lock-in._ Template:

```
GET  /api/health                       -> { ok: true }
POST /api/<thing>   { ...request }     -> { ...response }
```

## Data schemas
_Defined at lock-in._

## Env vars
Every var is listed in `.env.example`. Add new ones there in the same PR.
