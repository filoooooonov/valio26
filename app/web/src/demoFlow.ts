// Click-through demo flow (S52): starter scenarios, and the buyer -> Mikko -> buyer round trip without typing URLs.
// The order the buyer just sent for approval is remembered in this browser so Mikko's screen can put it first and
// bring the viewer back to it after deciding. Orders themselves stay in the gateway.

export type Scenario = { label: string; prompt: string; shows: string };

/** One starter per main use case and edge case. `shows` says what to watch for. */
export const SCENARIOS: Scenario[] = [
  {
    label: "Usual weekly order for Fall menu",
    prompt: "Prepare my usual weekly order for the fall menu.",
    shows:
      "Rebuilds the order from 8 weeks of history and learned preferences.",
  },
  {
    label: "Lasagna for 40 on Friday",
    prompt: "I need ingredients for lasagna for 40 people on Friday.",
    shows:
      "Turns a dish into priced ingredients and replaces unavailable ones.",
  },
  {
    label: "Three-course dinner, nut allergy",
    prompt:
      "Plan a three-course dinner for 30 people. One guest has a nut allergy.",
    shows: "Agree on a menu first. Allergies are hard rules, never guessed.",
  },
  {
    label: "1,000 litres of lactose-free milk",
    prompt: "I need 1,000 litres of lactose-free milk delivered Monday.",
    shows: "Compares pack sizes by unit price. Over €500, Mikko approves.",
  },
  {
    label: "Catering for 50, no details",
    prompt: "Catering for 50 people on Saturday.",
    shows: "An unclear request: Helmi asks one question instead of guessing.",
  },
];

export type SentOrder = { orderId: string; basketId: string; at: string };
const KEY = "demo:sentForApproval";

export function rememberSent(orderId: string, basketId: string) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ orderId, basketId, at: new Date().toISOString() }),
    );
  } catch {
    /* private mode: Mikko's screen still lists every pending order */
  }
}
export function readSent(): SentOrder | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v.orderId === "string" && typeof v.basketId === "string"
      ? v
      : null;
  } catch {
    return null;
  }
}
export function clearSent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

/** The buyer's page for that order: restores the basket and order from the URL (App reads ?b= and ?o=). */
export const buyerUrl = (s?: SentOrder | null) =>
  s
    ? `${location.pathname}?b=${encodeURIComponent(s.basketId)}&o=${encodeURIComponent(s.orderId)}`
    : location.pathname;
export const goToMikko = () =>
  location.assign(`${location.pathname}?view=mikko`);
export const goToBuyer = (s?: SentOrder | null) => location.assign(buyerUrl(s));
