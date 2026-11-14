import { Icon, type IconName } from "./index";
import "./decision-summary.css";

export type DecisionSummaryItem = {
  id: string;
  text: string;
  tone: "attention" | "adjusted";
  onSelect?: () => void;
};

/**
 * Exception-first header for the cart: three counts derived from the basket's own records, then only the
 * decisions that need a look. Routine lines stay in the normal cart below and ask for nothing.
 */
export function DecisionSummary({
  usual,
  adjusted,
  attention,
  items,
}: {
  usual: number;
  adjusted: number;
  attention: number;
  items: DecisionSummaryItem[];
}) {
  const counts: { n: number; label: string; icon: IconName; tone: string }[] = [
    { n: usual, label: "usual", icon: "circle-check", tone: "usual" },
    { n: adjusted, label: "adjusted", icon: "repeat", tone: "adjusted" },
    {
      n: attention,
      label: attention === 1 ? "needs you" : "need you",
      icon: "circle-alert",
      tone: "attention",
    },
  ];
  return (
    <section className="decision-summary" aria-label="Order summary">
      <ul className="decision-summary__counts">
        {counts.map((c) => (
          <li key={c.tone} data-tone={c.tone} data-zero={c.n === 0 || undefined}>
            <Icon name={c.icon} className="i-16" />
            <b>{c.n}</b> {c.label}
          </li>
        ))}
      </ul>
      {items.length > 0 && (
        <ul className="decision-summary__items">
          {items.map((it) => (
            <li key={it.id} data-tone={it.tone}>
              {it.onSelect ? (
                <button type="button" className="decision-summary__item" onClick={it.onSelect}>
                  <span>{it.text}</span>
                  <Icon name="chevron-right" className="i-16" />
                </button>
              ) : (
                <span className="decision-summary__item">{it.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
