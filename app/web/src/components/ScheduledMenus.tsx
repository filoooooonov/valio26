import { useEffect, useState } from 'react';
import { api } from '../api';
import { dayLabel, money } from '../format';
import { Icon } from '../icons';
import { DAYS, monthlyProjection, occurrences, shiftDate, todayHelsinki, validSchedule, type Schedule } from '../recurring';
import { DeliveryPicker, RESTAURANT_DELIVERY, type DeliveryChoice } from './DeliveryPicker';
import './scheduled-menus.css';

export type ScheduleSeed = { name: string; dishes: string[]; people: number; dietary: string; estimate: number | null; delivery?: DeliveryChoice };
export function newSchedule(seed?: ScheduleSeed, delivery?: DeliveryChoice | null): Schedule {
  return { id: crypto.randomUUID(), name: seed?.name ?? '', dishes: seed?.dishes ?? [], people: seed?.people ?? 50, dietary: seed?.dietary ?? '', estimate: seed?.estimate ?? null, delivery: seed?.delivery ?? delivery ?? { ...RESTAURANT_DELIVERY, date: todayHelsinki(), time: '8–10' }, weekdays: [1], purchaseTime: '09:00', leadDays: 2, startDate: todayHelsinki(), limit: 500, paused: false, skipped: [] };
}
export function ScheduledMenus({ schedules, editor, onEdit, onSave, onDelete, onPrepare, onBack, delivery, notice }: {
  schedules: Schedule[]; editor: Schedule | null; onEdit: (s: Schedule | null) => void;
  onSave: (s: Schedule) => boolean; onDelete: (id: string) => void; onPrepare: (s: Schedule, date: string) => void;
  onBack: () => void; delivery: DeliveryChoice | null; notice: string;
}) {
  const [filter, setFilter] = useState('all');
  const [source, setSource] = useState<'saved' | 'previous' | null>(null);
  const [previous, setPrevious] = useState<ScheduleSeed[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [month, setMonth] = useState(todayHelsinki().slice(0, 7));
  useEffect(() => {
    if (source !== 'previous') return;
    let active = true; setLoading(true); setSourceError('');
    void (async () => {
      try {
        const orders = (await api.orders()).filter(o => o.status === 'placed');
        const seeds = await Promise.all(orders.slice(0, 10).map(async o => {
          const b = await api.basket(o.basketId);
          return { name: b.dishes.map(d => d.name).join(', '), dishes: b.dishes.map(d => d.name), people: b.people, dietary: [...new Set(b.dishes.flatMap(d => d.diet))].join(', '), estimate: b.total };
        }));
        if (active) setPrevious(seeds);
      } catch { if (active) setSourceError('Could not load previous orders. Try again or create a menu from scratch.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [source]);
  if (editor) return <ScheduleEditor key={editor.id} existing={schedules.some(s => s.id === editor.id)} initial={editor} onSave={onSave} onCancel={() => onEdit(null)} onDelete={onDelete} notice={notice} />;
  const projections = schedules.map(s => monthlyProjection(s, month));
  const total = projections.reduce((sum, p) => sum + (p.total ?? 0), 0);
  const unknown = projections.some(p => p.count > 0 && p.total === null);
  const upcoming = schedules.flatMap(s => occurrences(s).slice(0, 1).map(date => ({ s, date, purchase: shiftDate(date, -s.leadDays) }))).sort((a,b) => (a.purchase + a.s.purchaseTime).localeCompare(b.purchase + b.s.purchaseTime));
  const visible = schedules.filter(s => filter === 'all' || (filter === 'paused' ? s.paused : !s.paused));
  return <main className="schedules">
    <header className="schedules__heading"><div><h1>Scheduled menus</h1><p>Your regular menus, ready for the week ahead.</p></div><button className="btn schedule-primary" onClick={() => onEdit(newSchedule(undefined, delivery))}><Icon name="plus" className="i-18" />Create scheduled menu</button></header>
    <p className="schedule-local"><Icon name="circle-alert" className="i-16" />Saved on this device. Automatic purchasing and notifications are not connected. Prepare each draft here for review and approval.</p>
    {notice && <p role="status" className="schedule-notice">{notice}</p>}
    <div className="schedules__layout"><section className="schedules__list" aria-label="Your scheduled menus">
      <div className="schedules__toolbar"><div className="schedule-filters" aria-label="Filter schedules">{['all','active','paused'].map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}{f === 'all' ? ` (${schedules.length})` : ''}</button>)}</div><div className="schedule-reuse"><button onClick={() => setSource(source === 'previous' ? null : 'previous')}>Previous orders</button><button onClick={() => setSource(source === 'saved' ? null : 'saved')}>Saved menus</button></div></div>
      {source && <section className="schedule-sources" aria-label={source === 'previous' ? 'Previous orders' : 'Saved menus'}><h2>{source === 'previous' ? 'Reuse a previous order' : 'Reuse a saved menu'}</h2><p>{source === 'saved' ? 'Menus from schedules saved on this device.' : 'Placed orders from the gateway. Prices will be checked again when you prepare a draft.'}</p>{loading && <p role="status">Loading previous orders…</p>}{sourceError && <p role="alert">{sourceError}</p>}{(source === 'previous' ? previous : schedules).map((s,i) => <button className="schedule-source" key={i} onClick={() => { onEdit(newSchedule(s, delivery)); setSource(null); }}><span>{s.name}<small>{s.people} guests · {s.dishes.length} dishes</small></span><Icon name="plus" className="i-18" /></button>)}{!loading && !sourceError && !(source === 'previous' ? previous : schedules).length && <p>No {source === 'previous' ? 'placed orders' : 'saved menus'} yet.</p>}</section>}
      {!visible.length && <div className="schedule-empty"><Icon name="repeat" /><h2>{schedules.length ? 'No menus in this view' : 'Make your regular menu a routine'}</h2><p>{schedules.length ? 'Choose another filter to see your menus.' : 'Save the dishes you serve each week. Choose when to prepare the order and when it should arrive.'}</p>{!schedules.length && <><button className="btn schedule-primary" onClick={() => onEdit(newSchedule(undefined, delivery))}>Create your first schedule</button><button className="schedule-text" onClick={onBack}>Start with the shopping assistant</button></>}</div>}
      {visible.map(s => {
        const next = occurrences(s)[0];
        return <article key={s.id} className="schedule-row"><header><div><span className={'schedule-state' + (s.paused ? ' schedule-state--paused' : '')}>{s.paused ? 'Paused' : 'Active'}</span><h2><button onClick={() => onEdit(s)}>{s.name}</button></h2><p>{s.dishes.join(' · ')}</p></div><button className="schedule-text" onClick={() => onEdit(s)}>Edit menu</button></header><div className="schedule-row__facts"><span><Icon name="repeat" className="i-16" />{s.weekdays.map(d => DAYS[d].slice(0,3)).join(', ')} · {s.people} guests</span><span><Icon name="truck" className="i-16" />{s.delivery.placeName}</span></div>{next ? <div className="schedule-dates"><div><small>Next purchasing run</small><strong>{dayLabel(shiftDate(next, -s.leadDays))}, {s.purchaseTime}</strong><small>Prepare a draft for approval</small></div><Icon name="arrow-right" className="i-18" /><div><small>Delivery</small><strong>{dayLabel(next)}, {s.delivery.time}</strong><small>{s.estimate === null ? 'Estimate available after pricing' : `${money(s.estimate)} estimated / delivery`}</small></div></div> : <p className="schedule-muted">{s.paused ? 'Resume to include this menu in your upcoming plan.' : 'No upcoming run in the next 62 days. Review the start date.'}</p>}<footer><button className="btn btn--outline" onClick={() => onSave({ ...s, paused: !s.paused })}>{s.paused ? 'Resume schedule' : 'Pause schedule'}</button>{next && <><button className="schedule-text" onClick={() => onSave({ ...s, skipped: [...s.skipped, next] })}>Skip {dayLabel(next)}</button><button className="schedule-text schedule-row__prepare" onClick={() => onPrepare(s, next)}>Prepare next draft<Icon name="arrow-right" className="i-16" /></button></>}</footer></article>;
      })}
    </section><aside className="schedule-aside"><section className="schedule-month"><h2>Monthly expectations</h2><label>Delivery month<input type="month" aria-label="Projection month" min={todayHelsinki().slice(0,7)} value={month} onChange={e => setMonth(e.target.value || todayHelsinki().slice(0,7))} /></label><strong className="schedule-month__total">{unknown ? 'Estimate incomplete' : money(total)}</strong><p>{projections.reduce((sum,p) => sum + p.count,0)} planned deliveries{unknown && ` · ${money(total)} priced so far`}</p><small>Remaining deliveries based on saved estimates, excl. VAT. Paused menus and skipped deliveries are excluded. Prices and availability are checked when a draft is prepared.</small></section><section className="schedule-upcoming"><h2>Next purchasing run</h2>{upcoming[0] ? <><strong>{dayLabel(upcoming[0].purchase)}, {upcoming[0].s.purchaseTime}</strong><p>{upcoming[0].s.name}</p><small>Helsinki time · manual preparation required</small></> : <p>Create or resume a schedule to see the next run.</p>}</section><section className="schedule-upcoming"><h2>Menu suggestions</h2><p>Reuse your regular dishes and adapt them to the season.</p><button className="schedule-text" onClick={() => onEdit(newSchedule({ name: 'Weekly soup lunch', dishes: ['Creamy salmon soup', 'Rye bread'], people: 50, dietary: 'Lactose-free options', estimate: null }, delivery))}>Use soup lunch template<Icon name="plus" className="i-16" /></button><small>Menu idea · no campaign prices checked</small></section></aside></div>
  </main>;
}

function ScheduleEditor({ initial, existing, onSave, onCancel, onDelete, notice }: { initial: Schedule; existing: boolean; onSave: (s: Schedule) => boolean; onCancel: () => void; onDelete: (id: string) => void; notice: string }) {
  const [s, set] = useState(initial);
  const [dishes, setDishes] = useState(initial.dishes.join('\n'));
  const [placeOpen, setPlaceOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (patch: Partial<Schedule>) => set(s => ({ ...s, ...patch }));
  const candidate = { ...s, name: s.name.trim(), dishes: dishes.split('\n').map(d => d.trim()).filter(Boolean) };
  const valid = validSchedule(candidate);
  const next = valid ? occurrences({ ...candidate, paused: false })[0] : undefined;
  useEffect(() => { document.getElementById('schedule-name')?.focus(); }, []);
  return <main className="schedules schedule-editor"><button className="schedule-text" onClick={onCancel}>‹ Scheduled menus</button><header className="schedules__heading"><div><h1>{existing ? 'Edit scheduled menu' : 'Create scheduled menu'}</h1><p>Choose your menu once. Set the rhythm for future orders.</p></div></header><p className="schedule-local">Saved on this device. Automatic purchasing is not connected; each draft requires manual preparation and approval.</p>
    <form onSubmit={e => { e.preventDefault(); if (valid && onSave(candidate)) onCancel(); }}><div className="schedules__layout"><div className="schedule-editor__fields"><section><h2>Your menu</h2><label>Menu name<input id="schedule-name" required maxLength={120} placeholder="e.g. Monday team lunch" value={s.name} onChange={e => update({ name: e.target.value })} /></label><label>Dishes or items<textarea required rows={4} placeholder={'Creamy salmon soup\nRye bread\nBlueberry pie'} value={dishes} onChange={e => setDishes(e.target.value)} /><small>One dish or item per line.</small></label><div className="schedule-field-pair"><label>Guests per delivery<input type="number" min={1} max={10000} required value={s.people || ''} onChange={e => update({ people: Number(e.target.value) })} /></label><label>Dietary needs and allergies<input placeholder="e.g. 3 lactose-free; no nuts" value={s.dietary} onChange={e => update({ dietary: e.target.value })} /></label></div><p className="schedule-muted">Dietary requirements will be reviewed before products are selected.</p></section>
      <section><h2>Delivery schedule</h2><fieldset><legend>Repeat every week on</legend><div className="schedule-weekdays">{[1,2,3,4,5,6,0].map(d => <label key={d}><input type="checkbox" checked={s.weekdays.includes(d)} onChange={e => update({ weekdays: e.target.checked ? [...s.weekdays,d].sort((a,b) => a-b) : s.weekdays.filter(v => v !== d) })} /><span>{DAYS[d].slice(0,3)}</span></label>)}</div>{!s.weekdays.length && <small role="alert">Choose at least one delivery day.</small>}</fieldset><div className="schedule-field-pair"><label>Start deliveries from<input type="date" required value={s.startDate} onChange={e => update({ startDate: e.target.value })} /></label><label>Delivery time<select value={s.delivery.time} onChange={e => update({ delivery: { ...s.delivery, time: e.target.value } })}>{['6–8','8–10','10–12','12–14'].map(t => <option key={t}>{t}</option>)}</select></label></div><div className="schedule-location"><Icon name="truck" className="i-20" /><span><strong>{s.delivery.placeName}</strong><small>{s.delivery.address}</small></span><button type="button" className="schedule-text" onClick={() => setPlaceOpen(true)}>Change location</button></div></section>
      <section><h2>Purchasing and approval</h2><div className="schedule-field-pair"><label>Prepare before delivery<select value={s.leadDays} onChange={e => update({ leadDays: Number(e.target.value) })}>{[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'} before</option>)}</select></label><label>Purchasing time (Helsinki)<input type="time" required value={s.purchaseTime} onChange={e => update({ purchaseTime: e.target.value })} /></label></div><label>Review threshold per delivery (€)<input type="number" min={1} step="0.01" required value={s.limit || ''} onChange={e => update({ limit: Number(e.target.value) })} /><small>Flag drafts above this amount for your review. Existing account approval rules still apply to every order.</small></label><p className="schedule-approval"><Icon name="circle-check" className="i-18" />Always review prices, product issues and substitutions before ordering.</p></section>
    </div><aside className="schedule-aside"><section className="schedule-month"><h2>Schedule preview</h2><p>{s.weekdays.length ? s.weekdays.map(d => DAYS[d]).join(', ') : 'Choose delivery days'} · every week</p><div className="schedule-preview-date"><small>Next purchasing run</small><strong>{next ? `${dayLabel(shiftDate(next,-s.leadDays))}, ${s.purchaseTime}` : 'Complete the schedule'}</strong></div><div className="schedule-preview-date"><small>Next delivery</small><strong>{next ? `${dayLabel(next)}, ${s.delivery.time}` : 'No upcoming delivery'}</strong></div><label>Estimate per delivery, excl. VAT (€)<input type="number" min={0} step="0.01" value={s.estimate ?? ''} placeholder="Optional" onChange={e => update({ estimate: e.target.value === '' ? null : Number(e.target.value) })} /></label><small>For monthly planning only. Actual prices and delivery cut-offs are checked when preparing a draft.</small>{s.paused && <p>This schedule is paused. Saving keeps it paused.</p>}</section></aside></div>
    <footer className="schedule-editor__footer">{confirmDelete ? <div className="schedule-delete"><span>Delete this saved schedule?</span><button type="button" className="schedule-text" onClick={() => onDelete(s.id)}>Delete schedule</button><button type="button" className="schedule-text" onClick={() => setConfirmDelete(false)}>Keep schedule</button></div> : existing && <button type="button" className="schedule-text" onClick={() => setConfirmDelete(true)}>Delete schedule</button>}<span />{notice && <p role="status">{notice}</p>}<button type="button" className="btn btn--outline" onClick={onCancel}>Cancel</button><button className="btn schedule-primary" type="submit" disabled={!valid}>Save schedule</button></footer></form>
    {placeOpen && <DeliveryPicker locationOnly value={s.delivery} defaultDate={todayHelsinki()} onClose={() => setPlaceOpen(false)} onConfirm={choice => { update({ delivery: { ...choice, time: s.delivery.time } }); setPlaceOpen(false); }} />}
  </main>;
}

