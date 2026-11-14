import { useEffect, useRef } from 'react';
import type { Basket } from '../api';
import { money, niceName, qtyLabel } from '../format';
import { Icon } from '../icons';
import './replacement-dialog.css';
import { useReplacementClose } from './Sheets';

export function AlternativeDraftReview({ basket, busy, onClose, onUse }: {
  basket: Basket; busy: boolean; onClose: () => void; onUse: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, []);
  const { closing, close } = useReplacementClose(dialog, onClose);
  return <dialog ref={dialog} className={"replacement-dialog" + (closing ? " replacement-dialog--closing" : "")} aria-busy={closing || undefined} aria-labelledby="alternative-draft-heading"
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }}>
    <header className="replacement-dialog__head"><h2 id="alternative-draft-heading">Review revised draft</h2><button className="round" aria-label="Close revised draft" onClick={() => close()}><Icon name="x" className="i-18" /></button></header>
    <p className="replacement-dialog__delivery">{money(basket.total)} excl. VAT</p>
    <p className="replacement-dialog__reason">This replaces the whole draft. Check quantities and any earlier changes.{basket.openIssues > 0 ? ` ${basket.openIssues} items still need a choice.` : ''}</p>
    <div className="alternative-draft-products">{basket.lines.filter(line => line.qty > 0).map(line => <div key={line.id}><span>{niceName(line.name)}{line.issue && !line.issue.decided ? ' — needs a choice' : ''}</span><span>{qtyLabel(line.qty, line.pack)}</span></div>)}</div>
    <footer className="replacement-dialog__actions"><button className="btn btn--outline" onClick={onClose}>Keep current basket</button><button className="btn replacement-dialog__use" disabled={busy || closing} onClick={() => { if (!busy) close(onUse); }}>Use revised draft</button></footer>
  </dialog>;
}
