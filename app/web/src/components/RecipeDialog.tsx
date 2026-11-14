import { useEffect, useRef } from 'react';
import type { Basket } from '../api';
import { Icon } from '../icons';
import { lineIsOpen, niceName, qtyLabel } from '../format';
import { recipeLines, recipeSteps } from '../recipes';
import { useReplacementClose } from './Sheets';
import './recipe-dialog.css';

export function RecipeDialog({ basket, onClose }: { basket: Basket; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal(); closeButton.current?.focus();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, []);
  const { closing, close } = useReplacementClose(dialog, onClose);
  return <dialog ref={dialog} className={'replacement-dialog recipe-dialog' + (closing ? ' replacement-dialog--closing' : '')} aria-labelledby="recipe-heading" onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  }}>
    <header className="replacement-dialog__head"><div><h2 id="recipe-heading">Your menu recipes</h2><p className="replacement-dialog__instruction">Suggested preparation for {basket.people} guests.</p></div><button ref={closeButton} className="round" aria-label="Close recipes" onClick={() => close()}><Icon name="x" className="i-18" /></button></header>
    {basket.openIssues > 0 && <p className="recipe-dialog__attention"><Icon name="triangle-alert" className="i-16" />Resolve unavailable ingredients before preparing this menu.</p>}
    {basket.dishes.map(dish => {
      const lines = recipeLines(basket, dish);
      return <section key={dish.id} className="recipe-dish"><h3>{dish.name}<span>{dish.portions} portions</span></h3>{dish.diet.length > 0 && <p className="recipe-dish__diet">{dish.diet.join(', ')}</p>}
        <h4>Ingredients from your basket</h4><ul className="recipe-ingredients">{lines.map(line => <li key={line.id}><span>{niceName(line.name)}{lineIsOpen(line) && <em>Needs replacement</em>}{line.usedIn && line.usedIn.length > 1 && <small>Shared with {line.usedIn.filter(name => name !== dish.name).join(', ')}</small>}</span><span>{qtyLabel(line.qty, line.pack)}</span></li>)}</ul>
        <h4>Method</h4><ol className="recipe-method">{recipeSteps(dish, lines).map((step, index) => <li key={index}>{step}</li>)}</ol>
      </section>;
    })}
    {!basket.dishes.length && <p>No dish recipe is attached to this product order.</p>}
    {basket.assumed.length > 0 && <p className="recipe-dialog__pantry">From your kitchen: {basket.assumed.join(', ')}.</p>}
    <p className="recipe-dialog__pantry">Quantities are purchased pack amounts. Shared products cover several dishes; use the amount needed for each recipe.</p>
  </dialog>;
}
