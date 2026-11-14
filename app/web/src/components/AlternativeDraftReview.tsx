import { useEffect, useRef } from 'react';
import type { RecipeProposal } from '../api';
import { money, niceName, qtyLabel } from '../format';
import { Icon } from '../icons';
import './replacement-dialog.css';
import { useReplacementClose } from './Sheets';

export function AlternativeDraftReview({ proposal, busy, onClose, onUse }: {
  proposal: RecipeProposal; busy: boolean; onClose: () => void; onUse: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, []);
  const { closing, close } = useReplacementClose(dialog, onClose);
  return <dialog ref={dialog} className={"replacement-dialog" + (closing ? " replacement-dialog--closing" : "")} aria-busy={closing || undefined} aria-labelledby="alternative-draft-heading"
    onCancel={event => { event.preventDefault(); if (!busy) close(); }}
    onClick={event => {
      if (busy || event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }}>
    <header className="replacement-dialog__head"><h2 id="alternative-draft-heading">Try {proposal.to} instead?</h2><button className="round" aria-label="Close recipe suggestion" disabled={busy} onClick={() => close()}><Icon name="x" className="i-18" /></button></header>
    <p className="replacement-dialog__reason">Replace {proposal.from} with {proposal.to}. Your other recipes stay as you edited them.</p>
    <h3>Ingredients to remove or adjust</h3>
    <div className="alternative-draft-products">{proposal.before.map(line => <div key={line.id}><span>{niceName(line.name)}</span><span>{qtyLabel(line.qty,line.pack)}</span></div>)}</div>
    <h3>Ingredients for the new recipe</h3>
    <div className="alternative-draft-products">{proposal.after.map(line => <div key={line.id}><span>{niceName(line.name)}</span><span>{qtyLabel(line.qty,line.pack)} &middot; {money(line.total)}</span></div>)}</div>
    <p className="replacement-dialog__delivery">Affected ingredients: {money(proposal.totalBefore)} to {money(proposal.totalAfter)}, excl. VAT. Prices and availability checked for your delivery.</p>
    <footer className="replacement-dialog__actions"><button className="btn btn--outline" disabled={busy || closing} onClick={() => close()}>No thanks</button><button className="btn replacement-dialog__use" disabled={busy || closing} onClick={onUse}>Use {proposal.to}</button></footer>
  </dialog>;
}
