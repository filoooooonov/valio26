import { useEffect, useState } from "react";
import { Icon } from "../icons";

// The planner is one ~20 s call. These are its real stages in order (see CONTRACT.md "Planner pipeline");
// the tick only advances the label, the cart appears when the gateway answers.
const STEPS = [
  ["Reading your request", "dishes, guests, diet"],
  ["Planning the dishes", "grams per guest for each ingredient"],
  ["Searching the catalogue", "local copy, no API calls"],
  ["Picking products", "lactose-free first, your usual brands"],
  [
    "Checking your prices and stock live",
    "one call to Valio Aimo for the shortlist",
  ],
  ["Looking for alternatives", "only for lines that can't be delivered"],
] as const;
const AT = [0, 3, 12, 13, 17, 19];

export function Loading() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(
      () => setS(Math.floor((Date.now() - t0) / 1000)),
      500,
    );
    return () => clearInterval(id);
  }, []);
  const cur = AT.filter((a) => s >= a).length - 1;
  return (
    <div className="loading" role="status" aria-live="polite">
      <h2 className="loading__title">Building your cart</h2>
      <ol className="loading__steps">
        {STEPS.map(([t, sub], i) => (
          <li
            key={t}
            className={i < cur ? "is-done" : i === cur ? "is-now" : ""}
          >
            <span className="loading__dot">
              {i < cur ? <Icon name="check" size={14} /> : null}
            </span>
            <span>
              <b>{t}</b> <span className="muted">· {sub}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="muted small">{s} s · usually about 20 s</p>
    </div>
  );
}
