# Quickstart: MariaDB

**Stack:** TypeScript and Bun (`app/server`, with the `mariadb` npm driver) plus Vite/React (`app/web`). Python is fine for one-off ingest scripts.

## Get access
- Datasets (small, medium, large) and starter docs come from the MariaDB mentors or the challenge page. Save them to `data/raw/` (gitignored)
  and the docs to `docs/sponsors/mariadb/`.
- **Server: MariaDB 11.8 LTS or newer, which has vector search.** Docker isn't installed on aleksei's laptop. Options:
  - Ayaan's Mac: `brew install mariadb` (check that `mariadb --version` is 11.7 or newer), then `brew services start mariadb`.
  - Docker, if installed: `docker run -d -p 3306:3306 -e MARIADB_ROOT_PASSWORD=dev mariadb:11.8`.
  - Ask the mentors whether they provide a hosted instance (the best option for the demo).
- Embeddings and LLM: any provider. The model must be multilingual for Finnish text.
- `.env.example` additions: `MARIADB_URL=mariadb://user:pass@host:3306/wiki`, `EMBED_API_KEY=`, `LLM_API_KEY=`.

## SDK
```bash
cd app/server && bun add mariadb
```

## MCP
There's an official MariaDB MCP server (`github.com/MariaDB/mcp`) with SQL and vector tools. **Verify it exists and supports
vectors before adding it** to `.mcp.json`.

## Hello world (RAG plus SVT in one table)
```sql
CREATE TABLE chunks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  article VARCHAR(255), body TEXT,
  emb VECTOR(1024) NOT NULL,
  VECTOR INDEX (emb) M=8 DISTANCE=cosine
) WITH SYSTEM VERSIONING;

INSERT INTO chunks (article, body, emb) VALUES ('Talvisota', '...', VEC_FromText('[0.1, ...]'));

SELECT article, body FROM chunks
ORDER BY VEC_DISTANCE_COSINE(emb, VEC_FromText(?)) LIMIT 5;      -- RAG

SELECT body FROM chunks FOR SYSTEM_TIME AS OF TIMESTAMP '2015-01-01' WHERE article = 'Talvisota';  -- SVT
```
⚠️ For SVT over *real* history you need revisions loaded with their original timestamps. System versioning stamps rows with the
time of insertion. Check how the dataset ships revisions, and ask the mentors. That's the spike.
