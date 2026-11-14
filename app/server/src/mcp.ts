import { authenticatedMode, requirePrincipal, scopeBasket, scopeOrder, type Principal } from "./auth";
// MCP endpoint for outside buyer agents (CONTRACT.md: thin wrapper, same handlers as REST).
// Stateless Streamable HTTP: every POST /mcp gets a fresh server + transport. The mandate is still enforced
// in placeOrder(), so an agent over MCP gets exactly the same limits and approvals as the webshop.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { search } from "./catalog";
import { placeOrder } from "./orders";
import { buildBasket } from "./plan";
import { orders } from "./store";
import { checkStock } from "./valio";

const json = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x, null, 2) }] });
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function server(principal?: Principal): McpServer {
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
      description: "Customer price, availability and cut-off for a SHORTLIST of SKUs (max 50) on a delivery date.",
      inputSchema: { skus: z.array(z.string()).min(1).max(50), date: DATE, customer: z.string().optional() },
    },
    async ({ skus, date, customer }) => json(await checkStock(skus, date, principal?.customer ?? customer)),
  );
  s.registerTool(
    "build_basket",
    {
      description: "Turn a request (e.g. 'catering for 50 on Saturday') into a priced, stock-checked basket with issues and ranked alternatives.",
      inputSchema: { request: z.string(), date: DATE, people: z.number().int().positive().optional(), customer: z.string().optional() },
    },
    async (a) => json(await buildBasket({ ...a, customer: principal?.customer ?? a.customer ?? "123" } as any)),
  );
  s.registerTool(
    "place_order",
    {
      description: "Order a basket. The gateway checks the customer's mandate (per-order + daily limit): placed, or pending approval with reasons.",
      inputSchema: { basketId: z.string(), by: z.string().describe("agent id, e.g. 'agent:kaleva-procurement'") },
    },
    async ({ basketId, by }) => {if(principal)scopeBasket(principal,basketId); return json(await placeOrder(basketId, principal?.actor ?? (by.startsWith("agent") ? by : `agent:${by}`)));},
  );
  s.registerTool(
    "get_order",
    { description: "Order status, mandate verdict and reasons.", inputSchema: { orderId: z.string() } },
    async ({ orderId }) => json(principal ? scopeOrder(principal,orderId) : orders.get(orderId) ?? { error: "order not found" }),
  );
  return s;
}

export async function handleMcp(req: Request): Promise<Response> {
  let principal:Principal | undefined;
  if(authenticatedMode()) {try{principal=requirePrincipal(req);}catch{return new Response(JSON.stringify({error:"Authentication required"}),{status:401,headers:{"Content-Type":"application/json"}});}}
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server(principal).connect(transport);
  return transport.handleRequest(req);
}
