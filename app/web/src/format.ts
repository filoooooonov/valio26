import type { BasketLine, StockLine } from "./api";

// Money as on valioaimo.fi: "209,40 €".
const eur = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
export const money = (n: number) => eur.format(n);
const eur0 = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
export const whole = (n: number) => eur0.format(n); // limits: "500 €"
const num = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 });
export const n2 = (n: number) => num.format(n);

// Pack count × pack size, or kg for catch-weight products: "2 × 3 kg", "6 kg".
export const qtyLabel = (qty: number, pack: string) =>
  pack === "by kg"
    ? `${n2(qty)} kg`
    : `${n2(qty)} × ${pack.replace(/(\d)\.(\d)/, "$1,$2")}`;

// Catalogue names for display: sentence case for ALL-CAPS names, brands kept, " -" collapsed, single spaces.
const BRANDS = [
  "Valio",
  "Bridor",
  "Villi",
  "Pepsi",
  "Haribo",
  "Taffel",
  "Vaasan",
  "Arla",
  "Knorr",
  "Kieku",
  "Eila",
  "Promix",
  "Kalavapriikki",
  "Vörlö",
  "Bong",
  "Pro",
  "ASC",
  "MSC",
  "UHT",
  "LF",
];
export const niceName = (raw: string) => {
  // Strip only terminal origin/grade codes; the original catalogue name stays in product details.
  let s = raw
    .replace(/\b(?:NL|BE|ES|FI|FIN|FR|PL|DE|IT|DK|SE|NO)(?:\s*\/\s*(?:NL|BE|ES|FI|FIN|FR|PL|DE|IT|DK|SE|NO))*(?=\s*(?:1\s*\.\s*CL\.?)?\s*$)/gi, "")
    .replace(/\s*1\s*\.\s*CL\.?\s*$/i, "")
    .replace(/([a-z])(?=\d)/gi, "$1 ")
    .replace(/\bFRO\s*$/i, "frozen")
    .replace(/\s+-/g, "-")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (raw === raw.toUpperCase()) {
    s = s.toLowerCase();
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  const pack = s.match(/\b\d+\s*[x\u00d7]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|l)\b/i)?.[0];
  if (pack) s = s.replace(pack, "").replace(/\s{2,}/g, " ").trim() + " \u00b7 " + pack.replace(/\s*[x\u00d7]\s*/i, " x ").replace(/(\d)(kg|g|ml|cl|l)\b/i, "$1 $2");
  for (const b of BRANDS)
    s = s.replace(
      new RegExp(`(^|[^\\p{L}])${b}(?![\\p{L}])`, "giu"),
      (_m, pre: string) => pre + b,
    );
  return s
    .replace(/\b(fin|nl|fr)\b/gi, (m) => m.toUpperCase())
    .replace(/(\d)\.(\d)/g, "$1,$2")
    .toUpperCase();
};

const at = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const WD = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const WDL = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export const dayLabel = (iso: string) => DAY.format(at(iso)).replace(",", ""); // "Nov 20"
export const weekday = (iso: string) => WD.format(at(iso)); // "Fri"
export const weekdayLong = (iso: string) => WDL.format(at(iso)); // "Friday"
export const timeLabel = (iso: string) => TIME.format(at(iso)); // "09:12"
export const stamp = (iso: string) => `${dayLabel(iso)}, ${timeLabel(iso)}`; // "Nov 18, 09:12"
export const sameDay = (a: string, b: string) =>
  at(a).toDateString() === at(b).toDateString();
export const addDays = (iso: string, d: number) => {
  const t = at(iso.slice(0, 10));
  t.setDate(t.getDate() + d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

export const SLOT = "6–8"; // the customer's delivery window (webshop account data)
export const slotLabel = (date: string) => `${dayLabel(date)} ${SLOT}`;

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
