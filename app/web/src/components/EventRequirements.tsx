import { useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { DIETARY_CHOICES, type DetectedRequirements, type EventRequirements as Requirements } from '../requirements';
import { Icon, type IconName } from '../icons';
import { DeliveryPicker, DELIVERY_TIMES, localToday, RESTAURANT_DELIVERY, type DeliveryChoice } from './DeliveryPicker';
import { closePopup } from './popupMotion';
import './event-requirements.css';

const DIET_ICONS: Record<string, IconName> = { 'Lactose-free': 'milk', 'Gluten-free': 'wheat', Vegetarian: 'leaf', Vegan: 'sprout', 'Milk allergy': 'milk', 'Egg allergy': 'egg', 'Peanut allergy': 'nut', 'Tree nut allergy': 'nut', 'Fish allergy': 'fish', 'Shellfish allergy': 'shellfish', 'Soy allergy': 'bean', 'Sesame allergy': 'seeds' };

export function EventRequirements({ initial, delivery, defaultDate, onConfirm }: {
  initial: DetectedRequirements; delivery: DeliveryChoice | null; defaultDate: string; onConfirm: (value: Requirements, delivery: DeliveryChoice) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [people, setPeople] = useState(initial.people ?? 50);
  const [dietary, setDietary] = useState<string[]>(initial.dietary ?? []);
  const [dietAnswered, setDietAnswered] = useState(initial.dietary !== null);
  const [none, setNone] = useState(initial.dietary?.length === 0);
  const [notes, setNotes] = useState('');
  const [budget, setBudget] = useState('');
  const today = localToday();
  const [place, setPlace] = useState(delivery ?? {...RESTAURANT_DELIVERY, date: '', time: ''});
  const [date, setDate] = useState(delivery?.date ?? (defaultDate >= today ? defaultDate : today));
  const [time, setTime] = useState(delivery?.time ?? '');
  const [locationOpen, setLocationOpen] = useState(false);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && !Number.isNaN(Date.parse(date + 'T12:00:00'));
  const validTime = DELIVERY_TIMES.includes(time);
  const missing = [!Number.isInteger(people) || people < 1 || people > 10000 ? 'a guest count between 1 and 10,000' : '', !dietAnswered ? 'dietary needs or no restrictions' : '', !validDate ? 'a delivery date' : '', !validTime ? 'a delivery time' : ''].filter(Boolean);

  const valid = Number.isInteger(people) && people > 0 && people <= 10000 && dietAnswered && validDate && validTime;
  function submit(event: FormEvent) {
    event.preventDefault(); if (!valid) return;
    closePopup(form.current?.closest<HTMLElement>('.chat-menu-review') ?? null, () => onConfirm({ people, dietary, notes, ...(budget ? { budget: Number(budget) } : {}) }, { ...place, date, time }));
  }
  return <form ref={form} className="event-requirements" onSubmit={submit}>
    <div className="event-requirements__body">
      <p className="event-requirements__intro">A few details so I can plan the right amounts and products.</p>
      {initial.people === null ? <fieldset><legend>How many people?</legend><div className="event-guests"><button type="button" aria-label="Fewer guests" disabled={people <= 1} onClick={() => setPeople(Math.max(1, people-1))}><Icon name="minus" className="i-18" /></button><label><input aria-label="Number of people" type="number" min="1" max="10000" step="1" required value={people || ''} onChange={event => setPeople(Number(event.target.value))} /><span>guests</span></label><button type="button" aria-label="More guests" disabled={people >= 10000} onClick={() => setPeople(Math.min(10000, people+1))}><Icon name="plus" className="i-18" /></button></div></fieldset> : <p className="event-known"><Icon name="users" className="i-16" />{people} guests, from your order</p>}
      {initial.dietary === null ? <fieldset><legend>Any dietary needs or allergies?</legend><p className="event-requirements__hint">Select all that apply. These guide the whole menu; note individual guest counts below.</p><div className="event-diets"><label className={none ? 'event-diet event-diet--selected' : 'event-diet'}><input type="checkbox" checked={none} onChange={event => { setNone(event.target.checked); setDietary([]); setDietAnswered(event.target.checked); }} /><Icon name="circle-check" className="i-16" />No dietary restrictions</label>{DIETARY_CHOICES.map(choice => <label key={choice} className={'event-diet' + (dietary.includes(choice) ? ' event-diet--selected' : '')}><input type="checkbox" checked={dietary.includes(choice)} onChange={() => { const next = dietary.includes(choice) ? dietary.filter(item => item !== choice) : [...dietary, choice]; setDietary(next); setNone(false); setDietAnswered(next.length > 0); }} /><Icon name={DIET_ICONS[choice]} className="i-16" />{choice}</label>)}</div></fieldset> : <p className="event-known"><Icon name="leaf" className="i-16" />{dietary.length ? dietary.join(', ') : 'No dietary restrictions'}, from your order</p>}
      <fieldset><legend>Delivery location</legend><button className="event-delivery" type="button" onClick={() => setLocationOpen(true)} aria-label="Change delivery location"><Icon name="truck" className="i-20" /><span className="event-delivery__copy"><strong>{place.placeName}</strong><span>{place.address}</span></span><span className="event-delivery__change">Change</span><Icon name="chevron-right" className="i-16" /></button></fieldset>
      <div className="event-schedule">
        <label><span>Delivery date <small>Required</small></span><input type="date" aria-label="Delivery date" min={today} required value={date} onChange={event => setDate(event.target.value)} /></label>
        <label><span>Delivery time <small>Required</small></span><select aria-label="Delivery time" required value={time} onChange={event => setTime(event.target.value)}><option value="">Choose a time</option>{DELIVERY_TIMES.map(slot => <option key={slot} value={slot}>{slot}</option>)}</select></label>
      </div>
      {locationOpen && createPortal(<DeliveryPicker locationOnly value={{...place,date,time}} defaultDate={date || defaultDate} onClose={() => setLocationOpen(false)} onConfirm={choice => setPlace(choice)} />, document.body)}
      <details className="event-extra"><summary><span className="event-extra__title">Budget and other requirements</span><span>Optional</span><Icon name="chevron-down" className="i-16" /></summary><label>Total budget, excl. VAT (€)<input aria-label="Total budget" type="number" min="1" step="0.01" value={budget} onChange={event => setBudget(event.target.value)} placeholder="e.g. 350" /></label><label>Anything else?<textarea aria-label="Other requirements" value={notes} onChange={event => setNotes(event.target.value)} rows={2} placeholder="e.g. 3 lactose-free guests, no pork, ready to serve" /></label></details>
    </div>
    <footer className="event-requirements__foot">{missing.length > 0 && <p id="event-missing-fields" className="event-requirements__missing" aria-live="polite">Choose {missing.join(" and ")} to continue.</p>}<button aria-describedby={missing.length ? "event-missing-fields" : undefined} className="btn" type="submit" disabled={!valid}>Continue to menu<Icon name="arrow-right" className="i-16" /></button><p>Products are checked after you approve the menu.</p></footer>
  </form>;
}
