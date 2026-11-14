import { useEffect, useRef, useState } from "react";
import type { MatrixRow } from "../api";
import { api } from "../api";
import { Icon } from "../icons";

export function RulesDialog({ customer, onClose }: { customer: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<MatrixRow[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus?.(); };
  }, []);
  useEffect(() => {
    let active = true;
    setRows(null);
    setError(false);
    api.matrix(customer).then((data) => { if (active) setRows(data); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [customer]);
  return (
    <dialog ref={dialog} className="sheet sheet--wide" aria-labelledby="rules-heading" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
      <div className="sheet__head">
        <h2 id="rules-heading" className="sheet__title">Who decides what</h2>
        <button className="round" aria-label="Close rules" onClick={onClose}><Icon name="x" className="i-18" /></button>
      </div>
      <p className="sheet__sub">Enforced by the Valio Aimo gateway on every order, whoever sends it: this webshop or an outside agent.</p>
      {error ? <p role="alert">Couldn't load the rules.</p> : rows === null ? <p role="status">Loading rules…</p> : (
        <div className="rules__grid">
          {([
            ["gateway", "Gateway does it"],
            ["buyer", "You confirm"],
            ["approver", "Approver signs off"],
          ] as const).map(([who, heading]) => (
            <section key={who} className="rules__col">
              <h3>{heading}</h3>
              {rows.filter((row) => row.who === who).map((row) => (
                <div key={row.decision} className="rules__card"><strong>{row.decision}</strong><span>{row.rule}</span></div>
              ))}
            </section>
          ))}
        </div>
      )}
    </dialog>
  );
}
