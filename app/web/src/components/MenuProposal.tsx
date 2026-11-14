import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { MenuCategory, MenuDraft } from '../menu';
import { addCategory } from '../menu';
import { MinunAimoContext } from './MinunAimo';
import { Icon } from '../icons';
import { closePopup } from './popupMotion';
import { dayLabel } from '../format';
import './menu-proposal.css';

function MenuEditor({ item, onSave, onCancel }: { item: MenuCategory; onSave: (next: MenuCategory) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(item.title);
  const [note, setNote] = useState(item.description);
  useLayoutEffect(() => { dialog.current?.showModal(); nameInput.current?.focus(); nameInput.current?.select(); return () => { dialog.current?.close(); }; }, []);
  const cancel = () => closePopup(dialog.current, () => { dialog.current?.close(); onCancel(); });
  function save(event: FormEvent) {
    event.preventDefault(); if (!name.trim()) { nameInput.current?.focus(); return; }
    closePopup(dialog.current, () => { dialog.current?.close(); onSave({ ...item, title: name.trim(), description: note.trim() }); });
  }
  return <dialog ref={dialog} className="menu-edit-dialog" aria-labelledby="menu-edit-heading" onCancel={event => { event.preventDefault(); cancel(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) cancel();
  }}>
    <form onSubmit={save}>
      <h3 id="menu-edit-heading">Edit dish or item</h3>
      <label htmlFor="menu-edit-name">Name</label><input ref={nameInput} id="menu-edit-name" value={name} onChange={event => setName(event.target.value)} required />
      <label htmlFor="menu-edit-note">Note</label><textarea id="menu-edit-note" rows={3} value={note} onChange={event => setNote(event.target.value)} />
      <div className="menu-edit-dialog__actions"><button className="btn btn--outline" type="button" onClick={cancel}>Cancel</button><button className="btn menu-edit-dialog__save" type="submit" disabled={!name.trim()}>Save</button></div>
    </form>
  </dialog>;
}
function MenuRow({ item, busy, onChange }: { item: MenuCategory; busy: boolean; onChange: (next: MenuCategory) => void }) {
  const editButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const finish = () => { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); };
  return <div className={'menu-item' + (!item.selected ? ' menu-item--off' : '')} onClick={event => { if (event.target === event.currentTarget && !busy) onChange({ ...item, selected: !item.selected }); }}>
    <label className="menu-item__select menu-item__select--row"><input className="menu-round-check" type="checkbox" aria-label={'Include ' + item.title} checked={item.selected} disabled={busy} onChange={() => onChange({ ...item, selected: !item.selected })} /><span className="menu-item__copy"><span className="menu-inline menu-inline--name">{item.title}</span><span className="menu-inline menu-inline--note">{item.description}</span></span></label>
    <button ref={editButton} type="button" className="menu-item__edit" disabled={busy} aria-label={'Edit ' + item.title} onClick={() => setEditing(true)}>Edit</button>
    {editing && <MenuEditor item={item} onCancel={finish} onSave={next => { onChange(next); finish(); }} />}
  </div>;
}

export function MenuProposal({ menu, busy, onChange, onApprove, onInstruction, compact = false }: { menu: MenuDraft; busy: boolean; onChange: (menu: MenuDraft) => void; onApprove: () => void; onInstruction?: (text: string) => void; compact?: boolean }) {
  const section = useRef<HTMLElement>(null);
  const [addition, setAddition] = useState('');
  const selected = menu.categories.filter(item => item.selected).length;
  return <section ref={section} className={'menu-proposal menu-proposal--refined' + (compact ? ' menu-proposal--popup' : '')} aria-labelledby={compact ? undefined : 'menu-heading'} aria-label={compact ? 'Menu choices' : undefined}>
    {!compact && <header className="menu-proposal__head"><div><h3 id="menu-heading">Your menu</h3><p>Select what to include. Open Edit to change a name or note.</p></div><span className="menu-proposal__count">{selected} selected</span></header>}
    <div className="menu-proposal__body">
    {menu.requirements && <p className="event-requirements__hint">{menu.requirements.people} guests · {menu.requirements.dietary.length ? menu.requirements.dietary.join(', ') : 'No dietary restrictions'}{menu.delivery ? ` · ${dayLabel(menu.delivery.date)}, ${menu.delivery.time} · ${menu.delivery.placeName}` : ''}</p>}
    <fieldset disabled={busy}><legend className="sr-only">Dishes and items to include</legend>
      {menu.categories.map(item => <MenuRow key={item.id} item={item} busy={busy} onChange={next => onChange({ ...menu, categories: menu.categories.map(current => current.id === next.id ? next : current) })} />)}
    </fieldset>
    <form className="menu-add menu-add--refined" onSubmit={event => { event.preventDefault(); if (!addition.trim() || busy) return; if (onInstruction) onInstruction(addition.trim()); else onChange(addCategory(menu, addition)); setAddition(''); }}>
      <label className="sr-only" htmlFor="menu-add">Add or change a dish</label><Icon name="plus" className="i-16" /><input id="menu-add" placeholder={menu.planning ? "Planning your menu…" : "Add or change, e.g. make the main vegetarian"} value={addition} disabled={busy} onChange={event => setAddition(event.target.value)} /><button type="submit" disabled={busy || !addition.trim()}>Add</button>
    </form>
    <MinunAimoContext enabled={!!menu.useMinunAimo} onChange={useMinunAimo => onChange({ ...menu, useMinunAimo })} />
    </div>
    <div className="menu-proposal__foot"><button className="btn btn--primary menu-proposal__approve" onClick={() => compact ? closePopup(section.current?.closest<HTMLElement>('.chat-menu-review') ?? null, onApprove) : onApprove()} disabled={busy || !selected || menu.categories.some(item => item.selected && !item.title.trim())}>{busy ? 'Finding products...' : 'Find products for this menu'}<Icon name="arrow-right" className="i-16" /></button><p>Prices and availability are checked after approval.</p></div>
  </section>;
}
