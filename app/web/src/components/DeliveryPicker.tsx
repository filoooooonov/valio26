import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../icons';
import { AppleDeliveryMap } from './AppleDeliveryMap';
import { useReplacementClose } from './Sheets';
import './replacement-dialog.css';
import './delivery-picker.css';

export type DeliveryChoice = { placeId: string; placeName: string; address: string; latitude: number; longitude: number; date: string; time: string };
const PLACES = [
 { placeId: 'kaleva-kamppi', placeName: 'Hotel Kaleva, Kamppi', address: 'Kamppi, Helsinki', latitude: 60.1662, longitude: 24.9315 },
 { placeId: 'kaleva-punavuori', placeName: 'Restaurant Kaleva, Punavuori', address: 'Punavuori, Helsinki', latitude: 60.1598, longitude: 24.9361 },
];
export const RESTAURANT_DELIVERY = PLACES[1];
export const DELIVERY_PLACES = PLACES;
export const DELIVERY_TIMES = ['6\u20138', '8\u201310', '10\u201312', '12\u201314'];
export function localToday() { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
export function DeliveryPicker({ value, defaultDate, onClose, onConfirm, locationOnly = false }: { locationOnly?: boolean; value: DeliveryChoice | null; defaultDate: string; onClose: () => void; onConfirm: (choice: DeliveryChoice) => void }) {
 const dialog = useRef<HTMLDialogElement>(null);
 const closeButton = useRef<HTMLButtonElement>(null);
 const today = localToday();
 const [placeId, setPlaceId] = useState(value?.placeId ?? RESTAURANT_DELIVERY.placeId);
 const [date, setDate] = useState(value?.date ?? (defaultDate >= today ? defaultDate : today));
 const [time, setTime] = useState(value?.time ?? '');
 const { closing, close } = useReplacementClose(dialog, onClose);
 const saved = value ? {placeId: value.placeId, placeName: value.placeName, address: value.address, latitude: value.latitude, longitude: value.longitude} : null;
 const places = saved && !PLACES.some(p => p.placeId === saved.placeId) ? [saved, ...PLACES] : PLACES;
 const place = places.find(p => p.placeId === placeId);
 const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && !Number.isNaN(Date.parse(date + 'T12:00:00'));
 const valid = !!place && (locationOnly || (validDate && DELIVERY_TIMES.includes(time)));
 const bbox = place ? [place.longitude - .009, place.latitude - .004, place.longitude + .009, place.latitude + .004].join(',') : '24.912,60.153,24.948,60.176';
 const map = 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) + '&layer=mapnik' + (place ? '&marker=' + encodeURIComponent(place.latitude + ',' + place.longitude) : '');
 useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); closeButton.current?.focus(); return () => { dialog.current?.close(); previous?.focus(); }; }, []);
 function confirm(event: FormEvent) { event.preventDefault(); if (!valid || !place || closing) return; const choice = {...place, date, time}; close(() => onConfirm(choice)); }
 return <dialog ref={dialog} className={'replacement-dialog delivery-picker' + (closing ? ' replacement-dialog--closing' : '')} aria-labelledby="delivery-picker-heading" aria-busy={closing || undefined} onCancel={event => {event.preventDefault(); close();}} onClick={event => { if (event.target !== event.currentTarget) return; const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); }}>
  <header className="replacement-dialog__head"><div><h2 id="delivery-picker-heading">{locationOnly ? "Delivery location" : "Where and when?"}</h2></div><button ref={closeButton} type="button" className="round" aria-label="Close delivery details" onClick={() => close()}><Icon name="x" className="i-18" /></button></header>
  <form onSubmit={confirm}>
   <fieldset disabled={closing} className="delivery-picker__places"><legend>Delivery place</legend><p className="delivery-picker__sample">Sample saved locations for this prototype; these are not connected to your account.</p>{places.map(p => <label key={p.placeId} className={'delivery-place' + (placeId === p.placeId ? ' delivery-place--selected' : '')}><input type="radio" name="delivery-place" value={p.placeId} checked={placeId === p.placeId} onChange={() => setPlaceId(p.placeId)} /><span><strong>{p.placeName}{p.placeId === RESTAURANT_DELIVERY.placeId ? ' (your restaurant)' : ''}</strong><span>{p.address}</span></span></label>)}</fieldset>
   <div className="delivery-picker__map"><AppleDeliveryMap token={(import.meta.env.VITE_APPLE_MAPS_TOKEN ?? "").trim()} place={place} fallbackUrl={map} /></div>
   {!locationOnly && <div className="delivery-picker__schedule"><label>Delivery date<input type="date" aria-label="Delivery date" min={today} required value={date} disabled={closing} onChange={event => setDate(event.target.value)} /></label><label>Delivery time<select aria-label="Delivery time" value={time} required disabled={closing} onChange={event => setTime(event.target.value)}><option value="">Choose a time</option>{DELIVERY_TIMES.map(t => <option key={t} value={t}>{t}</option>)}</select></label></div>}
   {!locationOnly && date && !validDate && <p className="delivery-picker__error" role="alert">Choose today or a future delivery date.</p>}
   <footer className="replacement-dialog__actions"><button type="button" className="btn btn--outline" onClick={() => close()} disabled={closing}>Cancel</button><button type="submit" className="btn replacement-dialog__use" disabled={!valid || closing}>{locationOnly ? "Use this location" : "Confirm delivery"}</button></footer>
  </form>
 </dialog>;
}
