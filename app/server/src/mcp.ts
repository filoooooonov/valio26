// MCP endpoint for outside buyer agents (CONTRACT.md: thin wrapper, same handlers as REST).
// Stateless Streamable HTTP: every POST /mcp gets a fresh server + transport. The mandate is still enforced
// in placeOrder(), so an agent over MCP gets exactly the same limits and approvals as the webshop.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { search } from "./catalog";
import { placeOrder } from "./orders";
import { buildBasket } from "./plan";
import { getMandate, decisionMatrix } from "./policy";
import { orders } from "./store";
import { checkStock } from "./valio";
import { receiptFor, verifyReceipt } from "./trust";

const json = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x, null, 2) }] });
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function server(): McpServer {
  const s = new McpServer({ name: "valio-aimo-gateway", version: "1.0.0" });
  s.registerTool(
    "search_products",
    {
      description: "Search the local Valio Aimo catalogue (no price/stock call). Returns product hits with CO2 and on-time reliability.",
      inputSchema: { q: z.string(), limit: z.number().int().min(1).max(50).optional(), diet: z.array(z.string()).optional() },
    },
    async ({ q, limit, diet }) => json(search(q, { limit: limit ?? 10, diet: diet ?? [] })),
  );
  s.registerTool(
    "check_stock",
    {
      description: "Customer price, availability and cut-off for a SHORTLIST of SKUs (max 50) on a delivery date. Each line comes with a signed offer receipt (see /.well-known/aimo-gateway.json).",
      inputSchema: { skus: z.array(z.string()).min(1).max(50), date: DATE, customer: z.string().optional() },
    },
    async ({ skus, date, customer }) => {
      const sc = await checkStock(skus, date, customer);
      return json({ ...sc, receipts: sc.lines.map(l => receiptFor(l, { customer: customer ?? "123", deliveryDate: date, checkedAt: sc.checkedAt })) });
    },
  );
  s.registerTool(
    "verify_receipt",
    {
      description: "Verify a signed offer receipt from this gateway: is it authentic, unchanged and still fresh?",
      inputSchema: { receipt: z.any() },
    },
    async ({ receipt }) => json(verifyReceipt(receipt)),
  );
  s.registerTool(
    "build_basket",
    {
      description: "Turn a request (e.g. 'catering for 50 on Saturday') into a priced, stock-checked basket with issues and ranked alternatives.",
      inputSchema: { request: z.string(), date: DATE, people: z.number().int().positive().optional(), customer: z.string().optional() },
    },
    async (a) => json(await buildBasket({ ...a, customer: a.customer ?? "123" } as any)),
  );
  s.registerTool(
    "place_order",
    {
      description: "Order a basket. The gateway checks the customer's mandate (per-order + daily limit): placed, or pending approval with reasons.",
      inputSchema: { basketId: z.string(), by: z.string().describe("agent id, e.g. 'agent:kaleva-procurement'") },
    },
    async ({ basketId, by }) => json(await placeOrder(basketId, by.startsWith("agent") ? by : `agent:${by}`)),
  );
  s.registerTool(
    "get_order",
    { description: "Order status, mandate verdict and reasons.", inputSchema: { orderId: z.string() } },
    async ({ orderId }) => json(orders.get(orderId) ?? { error: "order not found" }),
  );
  s.registerTool(
    "get_mandate",
    {
      description: "The buyer's mandate: spend limits, approver, and a readable table of which decisions the gateway, the buyer or the approver makes.",
      inputSchema: { customer: z.string().optional() },
    },
    async ({ customer }) => {
      const m = getMandate(customer ?? "123");
      return json({ mandate: m, rows: decisionMatrix(m) });
    },
  );
  return s;
}

export async function handleMcp(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server().connect(transport);
  return transport.handleRequest(req);
}
