import type { ReactNode } from "react";
import type { Basket, BasketLine, StockLine } from "../api";
import { Icon } from "../icons";
import {
  ErrorCard,
  FailedCard,
  Intro,
  NoSubstitute,
  Question,
  SentBack,
  Stale,
  Thinking,
} from "./Chat";
import { LineRow, type OrderProps } from "./OrderPanel";

// Dev-only board (?view=states): every state component rendered with SAMPLE data (not gateway data),
// so the states from the design board can be checked without breaking the gateway.
const noop = () => undefined;
const stock = (o: Partial<StockLine> = {}): StockLine => ({
  sku: "461884",
  price: 34.9,
  priceWithTax: 39.61,
  taxRate: 0.135,
  customerPrice: true,
  comparisonPrice: 34.9,
  comparisonUnit: "KG",
  available: 14,
  cutoffPassed: false,
  deliverable: true,
  salesUnit: "KI",
  ...o,
});
const line = (o: Partial<BasketLine>): BasketLine => ({
  id: "l1",
  dishId: "soup",
  needIds: [],
  sku: "461884",
  name: "Salmon fillet cubes, ASC",
  brand: "",
  qty: 2,
  pack: "3 kg",
  why: "50 × 120 g = 6 kg → 2 × 3 kg",
  stock: stock(),
  total: 209.4,
  contains: ["fish"],
  claims: [],
  ...o,
});
const trout = {
  sku: "460111",
  name: "Rainbow trout fillet, ~120 g pieces",
  reason: "in stock · 100 % on time",
  delta: -51,
  qty: 2,
  pack: "3 kg",
  why: "50 × 120 g = 6 kg",
  total: 158.4,
  stock: stock({ sku: "460111" }),
  contains: ["fish"],
};
const partial = line({
  id: "l2",
  qty: 2,
  stock: stock({ available: 1 }),
  issue: {
    kind: "short",
    text: "Only 1 pack (3 kg) for Friday",
    options: [trout],
  },
});
const atLimit = line({
  id: "l3",
  name: "Valio whipping cream 1 l, lactose-free",
  sku: "464194",
  qty: 14,
  pack: "1 l",
  why: "1 dl per portion → 5 l",
  total: 72.8,
  contains: ["milk"],
  stock: stock({
    sku: "464194",
    available: 14,
    comparisonPrice: 5.2,
    comparisonUnit: "L",
  }),
});
const noSub = [
  line({
    id: "l4",
    name: "VÖRLÖ CARROT PEELED 2KG",
    issue: { kind: "cutoff", text: "Ordering is closed", options: [] },
  }),
  line({
    id: "l5",
    name: "BLUEBERRY 2,5KG",
    issue: { kind: "unavailable", text: "No delivery", options: [] },
  }),
];
const basket = {
  id: "sample",
  date: "2026-11-20",
  people: 50,
  lines: [partial, atLimit],
  dishes: [],
  total: 313.2,
  totalIfAccepted: 522.6,
  pricesHeldUntil: "2026-11-19T14:00:00+0200",
  checkedAt: new Date(Date.now() - 25 * 60000).toISOString(),
  rules: {
    customer: "123",
    maxOrderEur: 500,
    maxDailyEur: 1500,
    swapsNeedOk: true,
    approver: "Mikko L.",
  },
} as unknown as Basket;
const orderProps = {
  busy: false,
  busyLine: null,
  onToggle: noop,
  onQty: noop,
  onSwap: noop,
} as unknown as OrderProps;

function Cell({
  label,
  children,
  white,
  wide,
}: {
  label: string;
  children: ReactNode;
  white?: boolean;
  wide?: boolean;
}) {
  return (
    <section className={"states__cell" + (wide ? " states__wide" : "")}>
      <h2 className="states__label">{label}</h2>
      <div className={"states__panel" + (white ? " states__panel--white" : "")}>
        {children}
      </div>
    </section>
  );
}

export function StatesView() {
  return (
    <main className="states">
      <h1>States board · sample data</h1>
      <div className="states__grid">
        <Cell label="Empty · no order yet">
          <Intro onHero={noop} onSend={noop} onAttach={noop} />
        </Cell>
        <Cell label="Thinking · planner running">
          <Thinking since={Date.now() - 14000} />
        </Cell>
        <Cell label="Error · stock service down">
          <ErrorCard
            e={{
              title: "Couldn't reach Valio's stock service",
              text: "The gateway didn't answer (503). Nothing is ordered.",
              retry: noop,
            }}
            onDismiss={noop}
          />
        </Cell>
        <Cell label="Slow network · prices getting old">
          <Stale checkedAt={basket.checkedAt} onRefresh={noop} />
        </Cell>
        <Cell label="Mikko sent it back">
          <SentBack
            by="Mikko L."
            at="2026-11-18T10:05:00+0200"
            note="Use the trout so we stay under 500 €. Fine otherwise."
            active
            held={basket.pricesHeldUntil}
            match={{ lineId: "l1", sku: trout.sku, name: trout.name }}
            onResend={noop}
            onSwitch={noop}
            onReply={noop}
          />
        </Cell>
        <Cell label="Order failed to send">
          <FailedCard
            text="The simulated order could not be confirmed. Nothing was sent to Valio Aimo; retry to recheck prices and stock."
            onRetry={noop}
          />
        </Cell>
        <Cell label="Partial stock · question">
          <Question
            line={partial}
            index={0}
            count={2}
            basket={basket}
            busy={false}
            onChoose={noop}
            onSeeAll={noop}
          />
        </Cell>
        <Cell label="No substitute · grouped">
          <NoSubstitute
            lines={noSub}
            index={1}
            count={2}
            date={basket.date}
            busy={false}
            onRemove={noop}
            onFind={noop}
          />
        </Cell>
        <Cell label="Partial stock line and stepper at stock limit" white wide>
          <LineRow
            l={partial}
            b={basket}
            p={orderProps}
            frozen={false}
            placed={false}
          />
          <LineRow
            l={atLimit}
            b={basket}
            p={orderProps}
            frozen={false}
            placed={false}
          />
        </Cell>
        <Cell
          label="Primary button · default / hover / pressed / focus / disabled"
          white
          wide
        >
          <div className="states__row">
            {["", "is-hover", "is-pressed", "is-focus"].map((c) => (
              <button key={c} className={"btn btn--lime " + c}>
                <Icon name="send" className="i-16" /> Send to Mikko for approval
              </button>
            ))}
            <button className="btn btn--lime" disabled>
              <Icon name="arrow-right" className="i-16" /> Send to Mikko for
              approval
            </button>
          </div>
        </Cell>
        <Cell
          label="Chip, stepper, checkbox, swap · default / hover / pressed / focus / disabled"
          white
          wide
        >
          <div className="states__row">
            {["", "is-hover", "is-pressed", "is-focus"].map((c) => (
              <button key={c} className={"chip " + c}>
                Cheaper fish
              </button>
            ))}
            <button className="chip" disabled>
              Cheaper fish
            </button>
          </div>
          <div className="states__row">
            {["", "is-hover", "is-pressed", "is-focus"].map((c) => (
              <div key={c} className="stepper">
                <button className={"stepper__btn " + c} aria-label="Less">
                  <Icon name="minus" className="i-14" />
                </button>
                <span className="stepper__value">2 × 3 kg</span>
                <button className="stepper__btn" aria-label="More" disabled>
                  <Icon name="plus" className="i-14" />
                </button>
              </div>
            ))}
          </div>
          <div className="states__row">
            {["", "is-hover", "is-focus"].map((c) => (
              <button
                key={c}
                className={"check " + c}
                role="checkbox"
                aria-checked={c !== "is-hover"}
                aria-label="Include"
              >
                <span className="check__box">
                  {c !== "is-hover" && <Icon name="check" className="i-14" />}
                </span>
              </button>
            ))}
            <button
              className="check"
              role="checkbox"
              aria-checked="true"
              aria-label="Include"
              disabled
            >
              <span className="check__box">
                <Icon name="check" className="i-14" />
              </span>
            </button>
            {["", "is-hover", "is-pressed", "is-focus"].map((c) => (
              <button
                key={c}
                className={"swapbtn " + c}
                aria-label="Alternatives"
              >
                <Icon name="repeat" className="i-16" />
              </button>
            ))}
            <button className="swapbtn" aria-label="Alternatives" disabled>
              <Icon name="repeat" className="i-16" />
            </button>
          </div>
        </Cell>
      </div>
    </main>
  );
}
