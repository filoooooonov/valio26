import { useEffect, useState } from "react";
import { Dialog, Icon, TextLink } from "./index";
import "./purchase-options.css";

export type PurchaseOption = {
  id: string;
  name: string;
  /** "Valio · 463335" */
  meta: string;
  image?: string | null;
  /** "1 000 × 1 l" */
  quantity: string;
  /** "1,400 € / l" */
  unitPrice: string;
  total: string;
  /** "+240,00 €" relative to the product in the cart; omitted on the selected card. */
  difference?: string;
  saving?: boolean;
  /** Chip at the top right: "Mon 16 Nov", "Stock to confirm", "Cut-off passed". */
  availability: string;
  tone: "available" | "review" | "blocked";
  /** One line under the divider: why this card matters. */
  note: string;
  selectable: boolean;
};
export type PurchaseEvidence = {
  id: string;
  name: string;
  total: string;
  reason: string;
  selected?: boolean;
};

function Thumb({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className="purchase-row__thumb">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon name="package" className="i-18" />
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}


/**
 * Single-product comparison: the replacement-card pattern (radio, availability chip, photo, name, pack maths,
 * order total, difference, one-line note) shown inline under the cart line. Choosing a card swaps the one cart line.
 */
export function PurchaseOptions({
  title,
  summary,
  selectedId,
  bestId,
  decidedByYou = false,
  options,
  evidence,
  scope,
  quotedAt,
  source,
  busy = false,
  onChoose,
}: {
  title: string;
  summary: string;
  selectedId: string;
  /** The agent's best option. While it is in the cart, alternatives stay folded behind "Compare alternatives". */
  bestId?: string;
  decidedByYou?: boolean;
  options: PurchaseOption[];
  evidence: PurchaseEvidence[];
  scope: string;
  quotedAt: string;
  source: string;
  busy?: boolean;
  onChoose?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [selectedId]);
  useEffect(() => { if (!busy) setPending(null); }, [busy]);
  const current = pending ?? selectedId;
  void bestId; // the best option is the cart row above
  const visible = options;
  const panelId = "purchase-panel-" + title.replace(/\W+/g, "-");
  return (
    <section className="purchase-options purchase-options--folded" aria-label={title} aria-busy={busy || undefined}>
      {options.length > 1 && (
        <div className={"purchase-accordion" + (expanded ? " purchase-accordion--open" : "")}>
          <button
            type="button"
            className="purchase-accordion__head"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded(!expanded)}
          >
            <span className="purchase-accordion__label">
              <b>Compare alternatives</b>
              <span>{decidedByYou ? "Your pick" : summary}</span>
            </span>
            <Icon name="chevron-down" className="i-18 purchase-accordion__chevron" />
          </button>
          {expanded && (
            <div id={panelId} className="purchase-accordion__body">
        <fieldset className="purchase-rows" disabled={busy || !onChoose}>
          <legend className="sr-only">{title}</legend>
          {visible.map((o) => {
            const selected = o.id === current;
            const blocked = !o.selectable && !selected;
            return (
              <label
                key={o.id}
                className={
                  "purchase-row" +
                  (selected ? " purchase-row--selected" : "") +
                  (blocked ? " purchase-row--disabled" : "")
                }
              >
                <input
                  type="radio"
                  name={"purchase-choice-" + title}
                  value={o.id}
                  aria-label={o.name}
                  checked={selected}
                  disabled={blocked}
                  onChange={() => {
                    if (selected) return;
                    setPending(o.id); // deselect the previous pick at once; the server confirms the swap
                    onChoose?.(o.id);
                  }}
                />
                <Thumb src={o.image} name={o.name} />
                <span className="purchase-row__body">
                  <strong>{o.name}</strong>
                  <span>
                    {o.quantity} · {o.unitPrice}
                    {o.tone !== "available" || o.note ? (
                      <span className="purchase-row__note" data-tone={o.tone}>
                        {" · "}
                        {o.note || o.availability}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="purchase-row__price">
                  <b>{o.total}</b>
                  {o.difference ? (
                    <span className="purchase-option__delta" data-saving={o.saving || undefined}>
                      {o.difference}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
            </div>
          )}
        </div>
      )}
      <footer className="purchase-options__foot">
        <TextLink onClick={() => setOpen(true)}>How Helmi decided</TextLink>
      </footer>
      {open && (
        <Dialog
          title="How Helmi decided"
          onClose={() => setOpen(false)}
          className="purchase-options__dialog"
        >
          <div className="purchase-evidence">
            <p className="purchase-evidence__intro">{scope}</p>
            <p className="purchase-evidence__intro">
              Products that meet the requirements come first. We then compare
              the full order cost after pack rounding, overbuy and delivery
              reliability.
            </p>
            <ul className="purchase-evidence__list">
              {evidence.map((item) => (
                <li key={item.id}>
                  <div className="purchase-evidence__product">
                    <strong>{item.name}</strong>
                    <b>{item.total}</b>
                  </div>
                  <p>
                    {item.selected ? "In your cart. " : ""}
                    {item.reason}
                  </p>
                </li>
              ))}
            </ul>
            <p className="purchase-evidence__source">
              {source}
              <br />
              Quoted {quotedAt}. Prices and stock are checked again before
              ordering.
            </p>
          </div>
        </Dialog>
      )}
    </section>
  );
}

