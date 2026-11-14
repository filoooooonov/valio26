// Isolated browser verification server: only synthetic API facts, only loopback, no persisted customer state.
import { loadCatalog } from './catalog';
import { installSyntheticFacts } from './demo-fixture';
import { setLlm } from './llm';
import { app } from './app';
delete process.env.COMMERCE_PRINCIPALS_JSON;
process.env.VALIO_API_KEY='synthetic-fixture-only';
loadCatalog();setLlm(null);installSyntheticFacts();
Bun.serve({hostname:'127.0.0.1',port:8795,fetch:app.fetch});
console.log('Browser verification: http://127.0.0.1:8795 — SYNTHETIC facts, local simulated orders only.');
