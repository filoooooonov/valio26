import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../icons';
import { AppleDeliveryMap } from './AppleDeliveryMap';
import { earliestDelivery, slotBookable } from '../requirements';
import { useReplacementClose } from './Sheets';
import './replacement-dialog.css';
import './delivery-picker.css';

export type DeliveryChoice = { placeId: string; placeName: string; address: string; latitude: number; longitude: number; date: string; time: string };
const PLACES = [
 { placeId: 'kallio', placeName: 'Bistro Kallio, Kallio', address: 'Kallio, Helsinki', latitude: 60.1841, longitude: 24.9497 },
 { placeId: 'kallio-terrace', placeName: 'Bistro Kallio summer terrace', address: 'Kallio, Helsinki', latitude: 60.1830, longitude: 24.9510 },
];
export const RESTAURANT_DELIVERY = PLACES[1];
export const DELIVERY_PLACES = PLACES;
export const DELIVERY_TIMES = ['6\u20138', '8\u201310', '10\u201312', '12\u201314'];
export function localToday() { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
export function DeliveryPicker({ value, defaultDate, onClose, onConfirm, locationOnly = false }: { locationOnly?: boolean; value: DeliveryChoice | null; defaultDate: string; onClose: () => void; onConfirm: (choice: DeliveryChoice) => void }) {
 const dialog = useRef<HTMLDialogElement>(null);
 const closeButton = useRef<HTMLButtonElement>(null);
 const earliest = earliestDelivery().date; // demo rule: at least 24 h ahead
 const [placeId, setPlaceId] = useState(value?.placeId ?? RESTAURANT_DELIVERY.placeId);
 const [date, setDate] = useState(() => { const d = value?.date ?? defaultDate; return d >= earliest ? d : earliest; });
 const [time, setTime] = useState(value?.time ?? DELIVERY_TIMES[0]); // the cart's current slot is preselected
 useEffect(() => { if (!slotBookable(date, time)) setTime(DELIVERY_TIMES.find(t => slotBookable(date, t)) ?? ''); }, [date]);
 const { closing, close } = useReplacementClose(dialog, onClose);
 const saved = value ? {placeId: value.placeId, placeName: value.placeName, address: value.address, latitude: value.latitude, longitude: value.longitude} : null;
 const places = saved && !PLACES.some(p => p.placeId === saved.placeId) ? [saved, ...PLACES] : PLACES;
 const place = places.find(p => p.placeId === placeId);
 const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= earliest && !Number.isNaN(Date.parse(date + 'T12:00:00'));
 const valid = !!place && (locationOnly || (validDate && DELIVERY_TIMES.includes(time) && slotBookable(date, time)));
 const bbox = place ? [place.longitude - .009, place.latitude - .004, place.longitude + .009, place.latitude + .004].join(',') : '24.912,60.153,24.948,60.176';
 const map = 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) + '&layer=mapnik' + (place ? '&marker=' + encodeURIComponent(place.latitude + ',' + place.longitude) : '');
 useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); closeButton.current?.focus(); return () => { dialog.current?.close(); previous?.focus(); }; }, []);
 function confirm(event: FormEvent) { event.preventDefault(); if (!valid || !place || closing) return; const choice = {...place, date, time}; close(() => onConfirm(choice)); }
 const [changingPlace, setChangingPlace] = useState(locationOnly);
 const [weekStart, setWeekStart] = useState(() => mondayOf(validDate ? date : earliest));
 const days = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
 const dateLabel = validDate ? new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) : 'Choose a day';
 return <dialog ref={dialog} className={'replacement-dialog delivery-picker' + (closing ? ' replacement-dialog--closing' : '')} aria-labelledby="delivery-picker-heading" aria-busy={closing || undefined} onCancel={event => {event.preventDefault(); close();}} onClick={event => { if (event.target !== event.currentTarget) return; const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); }}>
  <header className="replacement-dialog__head"><h2 id="delivery-picker-heading">{locationOnly ? 'Delivery location' : 'Choose delivery time'}</h2><button ref={closeButton} type="button" className="round" aria-label="Close delivery details" onClick={() => close()}><Icon name="x" className="i-18" /></button></header>
  <form onSubmit={confirm}>
   {!changingPlace && place && <div className="delivery-address">
    <Icon name="truck" className="i-22" />
    <span><strong>Delivery</strong><span>{place.placeName} · {place.address}</span></span>
    <button type="button" className="round" aria-label="Change delivery place" onClick={() => setChangingPlace(true)}><Icon name="repeat" className="i-18" /></button>
   </div>}
   {changingPlace && <>
    <fieldset disabled={closing} className="delivery-picker__places"><legend>Delivery place</legend><p className="delivery-picker__sample">Sample saved locations for this prototype; these are not connected to your account.</p>{places.map(p => <label key={p.placeId} className={'delivery-place' + (placeId === p.placeId ? ' delivery-place--selected' : '')}><input type="radio" name="delivery-place" value={p.placeId} checked={placeId === p.placeId} onChange={() => { setPlaceId(p.placeId); if (!locationOnly) setChangingPlace(false); }} /><span><strong>{p.placeName}{p.placeId === RESTAURANT_DELIVERY.placeId ? ' (your restaurant)' : ''}</strong><span>{p.address}</span></span></label>)}</fieldset>
    <div className="delivery-picker__map"><AppleDeliveryMap token={(import.meta.env.VITE_APPLE_MAPS_TOKEN ?? "").trim()} place={place} fallbackUrl={map} /></div>
   </>}
   {!locationOnly && <>
    <p className="delivery-week__label" aria-live="polite">{dateLabel}</p>
    <div className="delivery-week">
     <button type="button" className="delivery-week__nav" aria-label="Previous week" disabled={weekStart <= mondayOf(earliest) || closing} onClick={() => setWeekStart(addDaysIso(weekStart, -7))}><Icon name="chevron-left" className="i-18" /></button>
     <div className="delivery-week__days" role="radiogroup" aria-label="Delivery day">
      {days.map(d => { const past = d < earliest; const on = d === date; const wd = new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' }); return <button key={d} type="button" role="radio" aria-checked={on} aria-label={new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} disabled={past || closing} className={'delivery-day' + (on ? ' delivery-day--on' : '')} onClick={() => setDate(d)}><span className="delivery-day__wd">{wd}</span><span className="delivery-day__n">{Number(d.slice(8))}</span></button>; })}
     </div>
     <button type="button" className="delivery-week__nav" aria-label="Next week" disabled={closing} onClick={() => setWeekStart(addDaysIso(weekStart, 7))}><Icon name="chevron-right" className="i-18" /></button>
    </div>
    <div className="delivery-slots" role="radiogroup" aria-label="Delivery time">
     {DELIVERY_TIMES.map(t => <button key={t} type="button" role="radio" aria-checked={time === t} disabled={!validDate || !slotBookable(date, t) || closing} className={'delivery-slot' + (time === t ? ' delivery-slot--on' : '')} onClick={() => setTime(t)}>{t.replace('–', '.00–') + '.00'}</button>)}
    </div>
   </>}
   <footer className="delivery-picker__actions"><button type="submit" className="btn replacement-dialog__use delivery-picker__confirm" disabled={!valid || closing}>{locationOnly ? 'Use this location' : 'Choose time'}</button></footer>
  </form>
 </dialog>;
}

function addDaysIso(iso: string, n: number) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
function mondayOf(iso: string) { const d = new Date(iso + 'T12:00:00'); return addDaysIso(iso, -((d.getDay() + 6) % 7)); }
