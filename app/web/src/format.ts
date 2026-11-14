import type { BasketLine, StockLine } from "./api";

const eur = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});
export const money = (n: number) => eur.format(n);
export const delta = (n: number) =>
  (n >= 0 ? "+" : "−") + eur.format(Math.abs(n));

// One unit formatter everywhere: pack count × pack size, or kg for catch-weight products.
export const qtyLabel = (qty: number, pack: string) => {
  if (pack === "by kg") return `${trim(qty)} kg`;
  return `${trim(qty)} × ${pack}`;
};
const trim = (n: number) => String(Math.round(n * 100) / 100);

// "SALMON FILLET C-CUT DEBONED A10KG NORWAY" -> "Salmon fillet c-cut deboned a10kg Norway"-ish; leaves mixed case alone.
export const niceName = (s: string) => {
  if (s !== s.toUpperCase()) return s;
  const t = s.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});
export const dayLabel = (iso: string) =>
  DAY.format(new Date(iso.length === 10 ? iso + "T12:00:00" : iso));
export const timeLabel = (iso: string) => TIME.format(new Date(iso));
export const dayShort = (iso: string) =>
  dayLabel(iso).split(" ")[0].replace(",", "");
export const dateTime = (iso: string) => `${dayLabel(iso)} ${timeLabel(iso)}`;

export const timeLeft = (iso: string) => {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "closed";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h >= 48 ? `${Math.floor(h / 24)} days left` : `${h} h ${m} min left`;
};

export const isLF = (l: { claims?: string[] }) =>
  !!l.claims?.includes("FREE_FROM_LACTOSE");

export type Status = {
  tone: "ok" | "warn" | "bad";
  text: string;
  sub?: string;
};
export function stockStatus(
  s: StockLine,
  day: string,
  reliability?: number,
): Status {
  const sub =
    reliability == null
      ? "no on-time history"
      : `${Math.round(reliability * 100)} % on time`;
  if (s.cutoffPassed)
    return {
      tone: "bad",
      text: "Ordering closed",
      sub: "supplier cut-off passed",
    };
  if (!s.deliverable) return { tone: "bad", text: `No delivery ${day}` };
  const text = s.available == null ? `Available ${day}` : `In stock, ${day}`;
  return { tone: reliability == null ? "warn" : "ok", text, sub };
}

// Reliability is in the option's reason text ("96 % on time" / "no on-time history").
export const optionReliability = (reason: string): number | undefined => {
  const m = reason.match(/(\d+) % on time/);
  return m ? Number(m[1]) / 100 : undefined;
};

export const lineIsOpen = (l: BasketLine) => !!l.issue && !l.issue.decided;
const eur0 = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const whole = (n: number) => eur0.format(n);
