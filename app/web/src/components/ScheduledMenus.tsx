import { useEffect, useState } from 'react';
import { api } from '../api';
import { dayLabel, money } from '../format';
import { Icon } from '../icons';
import { DAYS, monthlyProjection, occurrences, shiftDate, todayHelsinki, validSchedule, type Schedule } from '../recurring';
import { DeliveryPicker, DELIVERY_TIMES, RESTAURANT_DELIVERY, type DeliveryChoice } from './DeliveryPicker';
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
  useEffect(() => { document.getElementById('schedule-name')?.focus({ preventScroll: true }); }, []);

  return <main className="schedules schedule-editor">
    <div className="schedule-editor__shell">
      <button className="schedule-text schedule-editor__back" onClick={onCancel}><Icon name="chevron-right" className="i-14" />Scheduled menus</button>
      <header className="schedule-editor__heading">
        <h1>{existing ? 'Edit scheduled menu' : 'Create scheduled menu'}</h1>
        <p>{existing ? 'Adjust your menu and weekly schedule.' : 'Repeat your menu on the days you choose.'}</p>
      </header>
      <form onSubmit={e => { e.preventDefault(); if (valid && onSave(candidate)) onCancel(); }}>
        <section className="schedule-editor__section" aria-labelledby="schedule-menu-heading">
          <h2 id="schedule-menu-heading">Menu</h2>
          <div className="schedule-editor__identity">
            <label>Menu name<input id="schedule-name" required maxLength={120} placeholder="e.g. Monday team lunch" value={s.name} onChange={e => update({ name: e.target.value })} /></label>
            <label>Guests<input aria-label="Guests per delivery" type="number" min={1} max={10000} required value={s.people || ''} onChange={e => update({ people: Number(e.target.value) })} /></label>
          </div>
          <details className="schedule-editor__menu" open={initial.dishes.length ? undefined : true}>
            <summary><span><strong>{candidate.dishes.length ? candidate.dishes.join(', ') : 'Add dishes or items'}</strong><small>{s.dietary || 'Dietary needs confirmed before ordering'}</small></span><span className="schedule-editor__edit">Edit<Icon name="chevron-down" className="i-14" /></span></summary>
            <div className="schedule-editor__menu-fields">
              <label>Dishes or items<textarea required rows={3} placeholder={'Creamy salmon soup\nRye bread'} value={dishes} onChange={e => setDishes(e.target.value)} /><small>One dish or item per line.</small></label>
              <label>Dietary needs and allergies<input placeholder="e.g. 3 lactose-free; no nuts" value={s.dietary} onChange={e => update({ dietary: e.target.value })} /></label>
            </div>
          </details>
        </section>

        <section className="schedule-editor__section" aria-labelledby="schedule-delivery-heading">
          <h2 id="schedule-delivery-heading">Delivery</h2>
          <fieldset className="schedule-editor__days"><legend>Every week on</legend>
            <div className="schedule-weekdays">{[1,2,3,4,5,6,0].map(d => <label key={d}><input aria-label={DAYS[d]} type="checkbox" checked={s.weekdays.includes(d)} onChange={e => update({ weekdays: e.target.checked ? [...s.weekdays,d].sort((a,b) => a-b) : s.weekdays.filter(v => v !== d) })} /><span>{DAYS[d].slice(0,3)}</span></label>)}</div>
            {!s.weekdays.length && <small role="alert">Choose at least one delivery day.</small>}
          </fieldset>
          <div className="schedule-field-pair">
            <label>Starting from<input type="date" required value={s.startDate} onChange={e => update({ startDate: e.target.value })} /></label>
            <label>Delivery time<select value={s.delivery.time} onChange={e => update({ delivery: { ...s.delivery, time: e.target.value } })}>{DELIVERY_TIMES.map(t => <option key={t}>{t}</option>)}</select></label>
          </div>
          <div className="schedule-editor__location"><Icon name="truck" className="i-18" /><span><strong>{s.delivery.placeName}</strong><small>{s.delivery.address}</small></span><button type="button" className="schedule-text" onClick={() => setPlaceOpen(true)}>Change<span className="sr-only"> location</span></button></div>
        </section>

        <section className="schedule-editor__section" aria-labelledby="schedule-purchasing-heading">
          <h2 id="schedule-purchasing-heading">Purchasing</h2>
          <div className="schedule-field-pair">
            <label>Prepare draft<select value={s.leadDays} onChange={e => update({ leadDays: Number(e.target.value) })}>{[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'} before delivery</option>)}</select></label>
            <label>At (Helsinki time)<input type="time" required value={s.purchaseTime} onChange={e => update({ purchaseTime: e.target.value })} /></label>
          </div>
          <details className="schedule-editor__costs"><summary>Cost estimate and review limit<Icon name="chevron-down" className="i-14" /></summary><div className="schedule-field-pair">
            <label>Estimate per delivery (&euro;)<input type="number" min={0} step="0.01" value={s.estimate ?? ''} placeholder="Optional" onChange={e => update({ estimate: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            <label>Review threshold (&euro;)<input type="number" min={1} step="0.01" required value={s.limit || ''} onChange={e => update({ limit: Number(e.target.value) })} /></label>
          </div><small>Excl. VAT. The estimate is for planning; drafts above the threshold are flagged. Account approval rules still apply.</small></details>
        </section>

        <div className="schedule-editor__preview" aria-live="polite">
          <div><Icon name="calendar" className="i-18" /><span><small>Next purchasing run</small><strong>{next ? `${dayLabel(shiftDate(next,-s.leadDays))}, ${s.purchaseTime}` : 'Choose your schedule'}</strong></span></div>
          <Icon name="arrow-right" className="i-16" />
          <div><Icon name="truck" className="i-18" /><span><small>Delivery</small><strong>{next ? `${dayLabel(next)}, ${s.delivery.time}` : 'No upcoming delivery'}</strong></span></div>
        </div>
        <p className="schedule-editor__note"><Icon name="shield-check" className="i-16" /><span>Saved on this device. Prepare and approve each draft manually; automatic purchasing is not connected.</span></p>
        {s.paused && <p className="schedule-editor__note">This schedule is paused. Saving keeps it paused.</p>}
        {notice && <p role="status" className="schedule-notice">{notice}</p>}
        <footer className="schedule-editor__actions">
          <div>{confirmDelete ? <div className="schedule-delete"><button type="button" className="schedule-text" onClick={() => onDelete(s.id)}>Confirm delete</button><button type="button" className="schedule-text" onClick={() => setConfirmDelete(false)}>Keep</button></div> : existing && <button type="button" className="schedule-text" onClick={() => setConfirmDelete(true)}>Delete schedule</button>}</div>
          <button type="button" className="btn btn--outline" onClick={onCancel}>Cancel</button>
          <button className="btn schedule-primary" type="submit" disabled={!valid}>{existing ? 'Save changes' : 'Save schedule'}</button>
        </footer>
      </form>
    </div>
    {placeOpen && <DeliveryPicker locationOnly value={s.delivery} defaultDate={todayHelsinki()} onClose={() => setPlaceOpen(false)} onConfirm={choice => { update({ delivery: { ...choice, time: s.delivery.time } }); setPlaceOpen(false); }} />}
  </main>;
}
