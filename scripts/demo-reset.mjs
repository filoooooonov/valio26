// Restores the synthetic Bistro Kallio baseline (CONTRACT S48): baskets, orders, audit, preference events,
// substitution permissions and policy overrides. The gateway must run with DEV_TOOLS=1.
const base = process.env.COMMERCE_URL ?? "http://localhost:8787";
const r = await fetch(`${base}/api/dev/reset`, { method: "POST" }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
if (!r.ok) {
  console.error(r.status === 404 ? "Reset is off: start the gateway with DEV_TOOLS=1 (in .env)." : `Reset failed (${r.status}): ${await r.text()}`);
  process.exit(1);
}
console.log(await r.json());
