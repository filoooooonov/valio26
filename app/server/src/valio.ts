// Valio Aimo mock API client: price + availability for a SHORTLIST of SKUs only (handout rule:
// "query the APIs only when needed, never for all products"). Every call is logged for the audit trail.
// API notes: docs/sponsors/valio/README.md, schemas: docs/sponsors/valio/openapi.json

export type StockLine = {
  sku: string;
  price: number; // customer price per sales unit, excl. VAT
  priceWithTax: number;
  taxRate: number;
  comparisonPrice?: number; // per comparisonUnit (L / KG), excl. VAT
  comparisonUnit?: string;
  customerPrice: boolean; // netPriceFound
  listPrice?: number;
  validTo?: string;
  available: number | null; // sales units; null = unknown (Terminal / placeholder "infinite")
  availableDate?: string;
  closingTime?: string;
  cutoffPassed: boolean;
  logistic?: string;
  deliverable: boolean; // has a delivery date by `date`, a price, AND ordering is still open (cut-off not passed)
  // One machine-readable verdict per line: ok | short | cutoff_passed | no_delivery | no_price | not_found
  status: "ok" | "short" | "cutoff_passed" | "no_delivery" | "no_price" | "not_found";
  salesUnit: string;
  error?: string;
};
export type StockCheck = {
  source?: "sponsor_mock_api" | "synthetic_fixture";
  checkedAt: string;
  date: string;
  calls: number;
  skus: number;
  lines: StockLine[];
};
export type ApiCall = {
  at: string;
  endpoint: string;
  skus: number;
  ms: number;
  status: number;
};

const UNKNOWN = 999_999; // Terminal: supplier warehouse, quantity unknown (not unlimited)
const PLACEHOLDER = 666_666_666; // "infinite" placeholders seen on Stock items

export const callLog: ApiCall[] = [];
const cache = new Map<string, { at: number; line: StockLine }>();
const TTL_MS = 120_000;

type Fetch = typeof fetch;
let factSource: "sponsor_mock_api" | "synthetic_fixture" = "sponsor_mock_api";
let fetcher: Fetch = (...a) => fetch(...a);
export const setFetcher = (f: Fetch) => {
  fetcher = f;
  factSource = "synthetic_fixture";
  cache.clear();
};

async function post(
  endpoint: "price" | "availability",
  skus: string[],
  date: string,
  customer: string,
) {
  const base = process.env.VALIO_API_URL ?? "https://junction26.valioaimo.fi";
  const key = process.env.VALIO_API_KEY;
  if (!key) throw new Error("VALIO_API_KEY missing (put it in .env)");
  const t0 = performance.now();
  const r = await fetcher(`${base}/api/${endpoint}`, {
    method: "POST",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ customer, requestedDate: date, products: skus }),
  });
  callLog.push({
    at: new Date().toISOString(),
    endpoint,
    skus: skus.length,
    ms: Math.round(performance.now() - t0),
    status: r.status,
  });
  if (!r.ok)
    throw new Error(
      `Valio ${endpoint} ${r.status}: ${(await r.text()).slice(0, 200)}`,
    );
  return r.json() as Promise<any>;
}

/** Price + availability for these SKUs on `date` (YYYY-MM-DD). Two API calls per ≤1000 SKUs, cached 2 min. */
export async function checkStock(
  skus: string[],
  date: string,
  customer = "123",
  opts: { fresh?: boolean } = {},
): Promise<StockCheck> {
  const want = [...new Set(skus)].filter(Boolean);
  const now = Date.now();
  const fresh = new Map<string, StockLine>();
  const missing = want.filter((s) => {
    const c = cache.get(`${customer}|${date}|${s}`);
    if (!opts.fresh && c && now - c.at < TTL_MS) fresh.set(s, c.line);
    return !fresh.has(s);
  });
  let calls = 0;
  for (let i = 0; i < missing.length; i += 1000) {
    const chunk = missing.slice(i, i + 1000);
    const [price, avail] = await Promise.all([
      post("price", chunk, date, customer),
      post("availability", chunk, date, customer),
    ]);
    calls += 2;
    const timeNow = Date.parse(avail.timeNow) || now;
    const prices = new Map<string, any>(
      price.products.map((p: any) => [p.productId, p]),
    );
    for (const a of avail.products as any[]) {
      const line = toLine(a, prices.get(a.productId), date, timeNow);
      fresh.set(line.sku, line);
      cache.set(`${customer}|${date}|${line.sku}`, { at: now, line });
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    source:factSource,
    date,
    calls,
    skus: want.length,
    lines: want.map((s) => fresh.get(s) ?? missingLine(s)),
  };
}

export function missingLine(sku: string, error = "not returned by API"): StockLine {
  return {
    status: "not_found",
    sku,
    price: 0,
    priceWithTax: 0,
    taxRate: 0,
    customerPrice: false,
    available: 0,
    cutoffPassed: false,
    deliverable: false,
    salesUnit: "",
    error,
  };
}

export function toLine(
  a: any,
  p: any,
  date: string,
  timeNow: number,
): StockLine {
  // Use the schedule line that arrives on or before the requested date.
  const lines = (a.scheduleLines ?? []).filter(
    (l: any) => !l.salesBlock && l.availableDate && l.availableDate <= date,
  );
  const best = lines.sort((x: any, y: any) =>
    x.availableDate < y.availableDate ? 1 : -1,
  )[0];
  const amount: number | undefined = best?.availableAmount;
  const available =
    amount == null
      ? 0
      : amount >= UNKNOWN
        ? null
        : amount;
  const cutoffPassed = a.closingTime
    ? Date.parse(a.closingTime) < timeNow
    : false;
  const priced = p && !p.error && Number.isFinite(p.catalogPrice?.value) && p.catalogPrice.value > 0;
  return {
    sku: a.productId,
    price: priced ? p.catalogPrice.value : 0,
    priceWithTax: priced
      ? (p.priceWithTax?.value ?? p.catalogPrice.valueWithTax)
      : 0,
    taxRate: p?.tax?.taxRate ?? 0,
    comparisonPrice: p?.comparisonPrice?.value,
    comparisonUnit: p?.comparisonUnit ?? undefined,
    customerPrice: !!p?.netPriceFound,
    listPrice: p?.listPrice?.value,
    validTo: p?.catalogPrice?.validTo,
    available,
    availableDate: best?.availableDate,
    closingTime: a.closingTime ?? undefined,
    cutoffPassed,
    logistic: a.logisticModel ?? undefined,
    // A passed cut-off is NOT deliverable for this date, and gets its own status so the planner can say so.
    deliverable: !a.salesBlock && !!best && !!priced && !cutoffPassed,
    status: !priced
      ? "no_price"
      : a.salesBlock || !best
        ? "no_delivery"
        : cutoffPassed
          ? "cutoff_passed"
          : available != null && available <= 0
            ? "short"
            : "ok",
    salesUnit: best?.salesUnit ?? a.scheduleLines?.[0]?.salesUnit ?? "",
    error: priced ? undefined : "no price",
  };
}

/** Content per sales unit in the comparison unit (e.g. 10 L per case), from catalogPrice / comparisonPrice. */
export function contentPerUnit(
  l: StockLine,
): { qty: number; unit: string } | null {
  if (!l.comparisonPrice || !l.comparisonUnit || !l.price) return null;
  return {
    qty: Math.round((l.price / l.comparisonPrice) * 1000) / 1000,
    unit: l.comparisonUnit,
  };
}
