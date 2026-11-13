import { app } from "./app";

const port = Number(process.env.PORT ?? 8787);
Bun.serve({ port, fetch: app.fetch });
console.log(`gateway on http://localhost:${port}`);
