// The "outside agent" scene: a hotel chain's procurement agent talks to the gateway over MCP (real calls).
// Prints a transcript as JSON lines to stdout; record.ts stores it for the Terminal scene.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.GATEWAY ?? "http://localhost:8787";
const AGENT = "agent:kaleva-procurement";
type Line = { kind: "cmd" | "out" | "ok" | "warn" | "err" | "note"; text: string };
const lines: Line[] = [];
const say = (kind: Line["kind"], text: string) => lines.push({ kind, text });
const eur = (n: number) => "€" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}
const call = async (c: Client, name: string, args: Record<string, unknown>) => {
  const r: any = await c.callTool({ name, arguments: args });
  return JSON.parse(r.content[0].text);
};

const client = new Client({ name: "kaleva-procurement-agent", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(BASE + "/mcp")));
say("note", `Hotel chain procurement agent · MCP → ${BASE}/mcp`);
const tools = await client.listTools();
say("cmd", "tools/list");
say("out", `${tools.tools.length} tools: ${tools.tools.map((t) => t.name).join(", ")}`);

const date = nextMonday();
const request = "1000 L lactose-free milk by Monday, best on price and availability";
say("cmd", `build_basket { request: "${request}", date: "${date}" }`);
const basket = await call(client, "build_basket", { request, date });
for (const l of basket.lines.filter((l: any) => l.qty > 0).slice(0, 3))
  say("out", `${l.name} · ${l.qty} × ${l.pack} · ${eur(l.total)} · ${l.stock.deliverable ? "deliverable " + date : "NOT deliverable"}`);
say("out", `total ${eur(basket.total)} at your contract prices${basket.apiCalls ? ` · ${basket.apiCalls} Valio calls` : ""}`);

say("cmd", `place_order { basketId: "${basket.id}", by: "${AGENT}" }`);
const res0 = await call(client, "place_order", { basketId: basket.id, by: AGENT });
const order = res0.order ?? res0;
const status = order.status ?? res0.error;
say(status === "placed" ? "ok" : "warn", `${status}${order.id ? " · " + order.id : ""}`);
for (const r of (order.mandate ?? res0.mandate)?.reasons ?? []) say("out", r);

if (order.id && status !== "placed") {
  say("cmd", `POST /api/orders/${order.id}/decision { decision: "approve", by: "${AGENT}" }`);
  const res = await fetch(`${BASE}/api/orders/${order.id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approve", by: AGENT }),
  });
  const body: any = await res.json().catch(() => ({}));
  say(res.status === 403 ? "err" : "out", `${res.status} ${body.error ?? body.status ?? ""}`);
  say("note", "The agent can't approve its own order. It waits in Mikko L.'s approval queue.");
}
await client.close();
console.log(JSON.stringify({ lines, orderId: order.id ?? null }));
