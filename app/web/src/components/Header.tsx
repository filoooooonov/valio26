import { Icon } from "../icons";
import { dayLabel, money, SLOT, stamp } from "../format";
import { AimoLogo, AssistantGlyph } from "./Mark";

// Webshop chrome from frame UK3jg: logo · Delivery wholesale · Delivery/Pickup · slot · cart.
export function Header({
  cartTotal,
  date,
  orderBy,
  pickup,
  onPickup,
  locked,
}: {
  cartTotal: number;
  date: string;
  orderBy: string | null;
  pickup: boolean;
  onPickup: (p: boolean) => void;
  locked: boolean;
}) {
  return (
    <header className="hdr">
      <a className="hdr__logo" href="./" aria-label="Valio Aimo home">
        <AimoLogo />
      </a>
      <span className="hdr__div" aria-hidden="true" />
      <span className="hdr__shop">Delivery wholesale</span>
      <span className="hdr__spacer" />
      <Segmented pickup={pickup} onPickup={onPickup} disabled={locked} />
      <div className="hdr__slot">
        <Icon name="truck" className="i-20" />
        <div>
          <div className="hdr__slot-day">
            {dayLabel(date)}, {SLOT}
            <Icon name="chevron-down" className="i-14" />
          </div>
          <div className="hdr__slot-sub">
            Hotelli Kaleva, Kamppi{orderBy ? ` · order by ${stamp(orderBy)}` : ""}
          </div>
        </div>
      </div>
      <span className="cart-pill" aria-label={`Cart total ${money(cartTotal)}`}>
        <Icon name="shopping-cart" className="i-16" />
        {money(cartTotal)}
      </span>
    </header>
  );
}

export function Segmented({
  pickup,
  onPickup,
  disabled,
  label,
}: {
  pickup: boolean;
  onPickup: (p: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label="Delivery or pickup" data-disabled={disabled || undefined}>
      <button role="radio" aria-checked={!pickup} className="seg__opt" disabled={disabled} onClick={() => onPickup(false)}>
        {label ?? "Delivery"}
      </button>
      <button role="radio" aria-checked={pickup} className="seg__opt" disabled={disabled} onClick={() => onPickup(true)}>
        Pickup
      </button>
    </div>
  );
}

// Phone (390): Assistant / Order · total tabs (frames f0BPn, n9qwsm).
export function PhoneTabs({
  tab,
  onTab,
  total,
  hasBasket,
}: {
  tab: "assistant" | "order";
  onTab: (t: "assistant" | "order") => void;
  total: number;
  hasBasket: boolean;
}) {
  return (
    <nav className="tabs" role="tablist" aria-label="Assistant or order">
      <button role="tab" aria-selected={tab === "assistant"} className="tabs__tab" onClick={() => onTab("assistant")}>
        <AssistantGlyph /> Assistant
      </button>
      <button role="tab" aria-selected={tab === "order"} className="tabs__tab" onClick={() => onTab("order")}>
        <Icon name="shopping-basket" className="i-16" /> Order{hasBasket ? ` · ${money(total)}` : ""}
      </button>
    </nav>
  );
}
