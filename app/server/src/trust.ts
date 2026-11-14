import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type JsonWebKey } from "node:crypto";
import { getProduct } from "./catalog";
import type { StockLine } from "./valio";

export type OfferClaims = {
  v: 1;
  kid: string;
  sku: string;
  name: string;
  customer: string;
  deliveryDate: string;
  price: number | null;
  priceWithTax: number | null;
  currency: "EUR";
  customerPrice: boolean;
  available: number | null;
  availableDate: string | null;
  deliverable: boolean;
  status: StockLine["status"];
  orderCutoff: string | null;
  origin: string | null;
  labels: string[];
  source: "valio-aimo-api";
  checkedAt: string;
  validUntil: string;
};
export type OfferReceipt = { claims: OfferClaims; kid: string; alg: "Ed25519"; sig: string };
export const RECEIPT_TTL_MS = 15 * 60 * 1000;

export function canonical(x: unknown): string {
  return JSON.stringify(x, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
    }
    return value;
  });
}

function initKeys() {
  const pem = process.env.GATEWAY_SIGNING_KEY;
  const privateKey = pem
    ? createPrivateKey(pem.replace(/\\n/g, "\n"))
    : generateKeyPairSync("ed25519").privateKey;
  const publicKey = createPublicKey(privateKey);
  const publicKeyJwk = publicKey.export({ format: "jwk" });
  const kid = createHash("sha256").update(publicKeyJwk.x!).digest("hex").slice(0, 16);
  return { privateKey, publicKey, kid, publicKeyJwk, persistent: Boolean(pem) };
}
let keys: ReturnType<typeof initKeys> | undefined;
const signingKeys = () => keys ??= initKeys();

export function keyInfo(): { kid: string; alg: "Ed25519"; publicKeyJwk: JsonWebKey; persistent: boolean } {
  const { kid, publicKeyJwk, persistent } = signingKeys();
  return { kid, alg: "Ed25519", publicKeyJwk, persistent };
}

export function receiptFor(line: StockLine, ctx: { customer: string; deliveryDate: string; checkedAt: string }): OfferReceipt {
  const { kid, privateKey } = signingKeys();
  const product = getProduct(line.sku);
  const orderCutoff = line.closingTime ?? null;
  const cutoff = orderCutoff === null ? NaN : Date.parse(orderCutoff);
  const validUntil = new Date(Math.min(
    Date.parse(ctx.checkedAt) + RECEIPT_TTL_MS,
    Number.isFinite(cutoff) ? cutoff : Infinity,
  )).toISOString();
  const claims: OfferClaims = {
    v: 1, kid, sku: line.sku, name: product?.en || line.sku,
    customer: ctx.customer, deliveryDate: ctx.deliveryDate,
    price: Number.isFinite(line.price) ? line.price : null,
    priceWithTax: Number.isFinite(line.priceWithTax) ? line.priceWithTax : null,
    currency: "EUR", customerPrice: line.customerPrice,
    available: Number.isFinite(line.available) ? line.available : null,
    availableDate: line.availableDate ?? null, deliverable: line.deliverable,
    status: line.status, orderCutoff, origin: product?.origin || null, labels: product?.labels ?? [],
    source: "valio-aimo-api", checkedAt: ctx.checkedAt, validUntil,
  };
  return { claims, kid, alg: "Ed25519", sig: sign(null, Buffer.from(canonical(claims)), privateKey).toString("base64url") };
}

export function verifyReceipt(r: unknown, now = Date.now()): { valid: boolean; reason?: string; expired?: boolean } {
  try {
    if (!r || typeof r !== "object") return { valid: false, reason: "malformed receipt" };
    const receipt = r as OfferReceipt;
    if (!receipt.claims || typeof receipt.claims !== "object" || typeof receipt.sig !== "string" || !receipt.sig)
      return { valid: false, reason: "malformed receipt" };
    if (receipt.alg !== "Ed25519") return { valid: false, reason: "unsupported alg" };
    const { kid, publicKey } = signingKeys();
    if (receipt.kid !== kid || receipt.claims.kid !== receipt.kid) return { valid: false, reason: "unknown key" };
    if (!verify(null, Buffer.from(canonical(receipt.claims)), publicKey, Buffer.from(receipt.sig, "base64url")))
      return { valid: false, reason: "signature does not match: the claims were changed after signing" };
    return { valid: true, expired: now > Date.parse(receipt.claims.validUntil) };
  } catch {
    return { valid: false, reason: "malformed receipt" };
  }
}

export function wellKnown(): object {
  const sample = receiptFor({ sku: "", price: 0, priceWithTax: 0, taxRate: 0, customerPrice: false,
    available: null, cutoffPassed: false, deliverable: false, status: "not_found", salesUnit: "" },
  { customer: "", deliveryDate: "", checkedAt: new Date(0).toISOString() });
  return { name: "valio-aimo-gateway", version: "1.0.0", ...keyInfo(), mcp: "/mcp",
    receipt: { fields: Object.keys(sample.claims), canonicalization: "sorted-keys JSON", ttlSeconds: 900,
      verify: "POST /api/receipts/verify" }, spec: "TRUST.md" };
}
