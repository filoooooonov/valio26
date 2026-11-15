#!/usr/bin/env node
// aimo-agent: a customer's own purchasing agent talking to the Valio Aimo gateway over MCP (real calls, same rules
// as the webshop). For the demo video and for judges who want to try the open gateway from a terminal.
//
//   node scripts/aimo-agent.mjs order "1000 litres of lactose-free milk by Monday"
//   node scripts/aimo-agent.mjs approve <orderId>     # the agent tries to approve its own order -> 403
//   node scripts/aimo-agent.mjs status <orderId>
//
// Options: --date YYYY-MM-DD (otherwise a weekday in the request, else the next weekday), --as <agent id>.
// Env: GATEWAY (default http://localhost:8787). Every `order` creates a real (simulated, local) order.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.GATEWAY ?? "http://localhost:8787";
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1),
  dim = c(2),
  green = c(32),
  yellow = c(33),
  red = c(31),
  teal = c(36);
const eur = (n) =>
  "€" +
  Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const out = (s = "") => console.log(s ? "  " + s : "");

// ---- arguments ----
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const dateArg = opt("--date");
const AGENT = opt("--as") ?? "agent:kaleva-procurement";
// Hosted demo: join a visitor's private session (shown in Mikko's view) so the order lands in their queue.
const SESSION = opt("--session") ?? process.env.AIMO_SESSION;
const headers = SESSION ? { "x-aimo-session": SESSION } : {};
const [cmd, ...rest] = argv;
const text = rest.join(" ").trim();

const usage = () => {
  out(
    bold("aimo-agent") +
      dim("  ·  a purchasing agent for the Valio Aimo gateway (MCP)"),
  );
  out();
  out(
    `node scripts/aimo-agent.mjs order ${teal('"1000 litres of lactose-free milk by Monday"')}`,
  );
  out(`node scripts/aimo-agent.mjs approve ${teal("<orderId>")}`);
  out(`node scripts/aimo-agent.mjs status ${teal("<orderId>")}`);
  out();
  out(
    dim("Options: --date YYYY-MM-DD  --as <agent id>  --session <id>   Env: GATEWAY=" + BASE),
  );
  process.exit(cmd ? 1 : 0);
};

// ---- dates (local calendar, not UTC) ----
const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function deliveryDate(request) {
  if (dateArg) return dateArg;
  const d = new Date();
  const lower = request.toLowerCase();
  if (/\btomorrow\b/.test(lower)) {
    d.setDate(d.getDate() + 1);
    return iso(d);
  }
  const day = DAYS.findIndex((n) => new RegExp(`\\b${n}\\b`).test(lower));
  if (day >= 0) {
    d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7 || 7));
    return iso(d);
  }
  do d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6);
  return iso(d);
}
const pretty = (s) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// ---- spinner ----
function spin(label) {
  if (!process.stdout.isTTY) {
    out(dim(label + " ..."));
    return () => {};
  }
  const f = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const t = setInterval(
    () => process.stdout.write(`\r  ${teal(f[i++ % f.length])} ${dim(label)}`),
    80,
  );
  return () => {
    clearInterval(t);
    process.stdout.write("\r\x1b[2K");
  };
}

// ---- MCP ----
async function connect() {
  const client = new Client({ name: "aimo-agent", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(BASE + "/mcp"), { requestInit: { headers } }),
    );
  } catch {
    out(
      red(
        "✗ Can't reach the gateway at " + BASE + ". Start it with: bun run dev",
      ),
    );
    process.exit(1);
  }
  return client;
}
const call = async (client, name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return JSON.parse(r.content[0].text);
};
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const visible = (s) => s.replace(/\x1b\[\d+m/g, "").length;
const row = (left, right, width = 64) =>
  left + " ".repeat(Math.max(2, width - visible(left))) + right;
function wrap(s, n) {
  const lines = [];
  let cur = "";
  for (const w of s.split(" ")) {
    if (cur && (cur + " " + w).length > n) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function order() {
  if (!text) usage();
  const date = deliveryDate(text);
  const client = await connect();
  const { tools } = await client.listTools();

  out();
  out(bold("Aimo purchasing agent") + dim(`  ·  ${AGENT}`));
  out(
    dim(
      `Connected to the Valio Aimo gateway over MCP  ·  ${tools.length} tools`,
    ),
  );
  out();
  out(dim("Request   ") + text);
  out(dim("Delivery  ") + pretty(date));
  out();

  let stop = spin("Finding products, customer prices and stock");
  const basket = await call(client, "build_basket", { request: text, date });
  stop();
  const lines = (basket.lines ?? []).filter((l) => l.qty > 0);
  if (!lines.length) {
    out(yellow("! No products matched this request."));
    await client.close();
    return;
  }
  out(
    green("✓") +
      " Priced and stock-checked" +
      dim(
        basket.apiCalls
          ? `  ·  ${basket.apiCalls} Valio API calls, not the whole catalogue`
          : "",
      ),
  );
  out();
  for (const l of lines) {
    const what = `${l.qty} × ${truncate(l.name, 46)}`;
    out(row("  " + what, eur(l.total)));
    const s = l.stock ?? {};
    const when = s.deliverable
      ? green("delivers " + pretty(date))
      : yellow("not deliverable " + pretty(date));
    const qty =
      s.available == null
        ? dim("  ·  ") + yellow("quantity unconfirmed by Valio")
        : dim(`  ·  ${s.available} in stock`);
    out(dim("    " + (l.pack ? l.pack + " pack  ·  " : "")) + when + qty);
  }
  out(dim("  " + "─".repeat(62)));
  out(
    row("  " + bold("Total at your contract prices"), bold(eur(basket.total))),
  );
  out();

  stop = spin("Placing order");
  const res = await call(client, "place_order", {
    basketId: basket.id,
    by: AGENT,
  });
  stop();
  const o = res.order ?? res;
  const status = o.status ?? res.error;
  if (status === "placed") {
    out(
      green("✓ Order placed") +
        dim(`  ·  ${o.id}  ·  within your purchasing rules`),
    );
  } else if (o.id) {
    out(yellow("⏸ Waiting for human approval") + dim(`  ·  order ${o.id}`));
    for (const r of (o.mandate ?? res.mandate)?.reasons ?? [])
      wrap(r, 66).forEach((t, i) =>
        out((i ? "    " : "  " + yellow("•") + " ") + t),
      );
    out();
    out(
      dim(
        "The agent can't approve this itself. It is now in the approver's queue.",
      ),
    );
    out(dim("Try: ") + `node scripts/aimo-agent.mjs approve ${o.id}`);
  } else {
    out(red("✗ Not ordered: ") + (res.error ?? JSON.stringify(res)));
  }
  out();
  await client.close();
}

async function approve() {
  const id = text;
  if (!id) usage();
  out();
  out(bold("Aimo purchasing agent") + dim(`  ·  ${AGENT}`));
  out(`Approving order ${id} ...`);
  const r = await fetch(
    `${BASE}/api/orders/${encodeURIComponent(id)}/decision`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ decision: "approve", by: AGENT }),
    },
  );
  const body = await r.json().catch(() => ({}));
  if (r.status === 403) {
    out(red(`✗ 403 Forbidden`) + "  " + (body.error ?? ""));
    out(
      dim(
        "The gateway only lets the customer's named approver sign orders outside the rules.",
      ),
    );
  } else {
    out(
      (r.ok ? green : red)(`${r.status}`) +
        "  " +
        (body.error ?? body.status ?? ""),
    );
  }
  out();
}

async function status() {
  if (!text) usage();
  const client = await connect();
  const o = await call(client, "get_order", { orderId: text });
  out();
  if (o.error) out(red("✗ " + o.error));
  else {
    out(
      bold(`Order ${o.id}`) +
        "  " +
        (o.status === "placed" ? green(o.status) : yellow(o.status)),
    );
    for (const r of o.mandate?.reasons ?? []) out("  " + yellow("•") + " " + r);
  }
  out();
  await client.close();
}

if (cmd === "order") await order();
else if (cmd === "approve") await approve();
else if (cmd === "status") await status();
else usage();
