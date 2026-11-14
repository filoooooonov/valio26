import type { BasketLine, StockLine } from "./api";

// Money as on valioaimo.fi: "209,40 €".
const eur = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
export const money = (n: number) => eur.format(n);
const eur0 = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const whole = (n: number) => eur0.format(n); // limits: "500 €"
const num = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 });
export const n2 = (n: number) => num.format(n);

// Pack count × pack size, or kg for catch-weight products: "2 × 3 kg", "6 kg".
export const qtyLabel = (qty: number, pack: string) =>
  pack === "by kg"
    ? `${n2(qty)} kg`
    : `${n2(qty)} × ${pack.replace(/(\d)\.(\d)/, "$1,$2")}`;

// "SALMON FILLET C-CUT" -> "Salmon fillet c-cut"; leaves mixed case alone.
export const niceName = (s: string) => {
  if (s !== s.toUpperCase()) return s;
  const t = s.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const at = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const WD = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const WDL = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export const dayLabel = (iso: string) => DAY.format(at(iso)).replace(",", ""); // "Fri 20 Nov"
export const weekday = (iso: string) => WD.format(at(iso)); // "Fri"
export const weekdayLong = (iso: string) => WDL.format(at(iso)); // "Friday"
export const timeLabel = (iso: string) => TIME.format(at(iso)); // "09:12"
export const stamp = (iso: string) => `${dayLabel(iso)}, ${timeLabel(iso)}`; // "Wed 18 Nov, 09:12"
export const sameDay = (a: string, b: string) =>
  at(a).toDateString() === at(b).toDateString();
export const addDays = (iso: string, d: number) => {
  const t = at(iso.slice(0, 10));
  t.setDate(t.getDate() + d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

export const SLOT = "6–8"; // the customer's delivery window (webshop account data)
export const slotLabel = (date: string) => `${weekday(date)} ${SLOT}`;

export const lineIsOpen = (l: BasketLine) => !!l.issue && !l.issue.decided;

// Units: "3 kg" -> "kg", "1 l" -> "l"; used for "your price · 34,90 €/kg".
export const perUnit = (s: StockLine) =>
  s.comparisonUnit ? s.comparisonUnit.toLowerCase().replace("pcs", "pc") : "";

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .replace(".", "")
    .slice(0, 2)
    .toUpperCase();
