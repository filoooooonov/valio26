import type { DeliveryChoice } from './components/DeliveryPicker';

export const SCHEDULE_KEY = 'aimo.scheduled-menus.v1';
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export type Schedule = {
  id: string; name: string; dishes: string[]; people: number; dietary: string;
  weekdays: number[]; purchaseTime: string; leadDays: number; startDate: string;
  delivery: DeliveryChoice; estimate: number | null; limit: number;
  paused: boolean; skipped: string[];
};

export function todayHelsinki(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
// Convert a Helsinki wall-clock time to an instant, including daylight-saving changes.
export function purchaseInstant(date: string, time: string) {
  const target = Date.parse(`${date}T${time}:00Z`);
  let value = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
    const p = Object.fromEntries(parts.map(p => [p.type, p.value]));
    value += target - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  }
  return value;
}
export function occurrences(s: Schedule, now = new Date(), days = 62) {
  if (s.paused) return [];
  const start = todayHelsinki(now);
  return Array.from({ length: days }, (_, i) => shiftDate(start, i)).filter(date =>
    date >= s.startDate && s.weekdays.includes(new Date(date + 'T12:00:00Z').getUTCDay()) &&
    !s.skipped.includes(date) && purchaseInstant(shiftDate(date, -s.leadDays), s.purchaseTime) > now.getTime(),
  );
}
export function monthlyProjection(s: Schedule, month: string, now = new Date()) {
  const dates = !s.paused && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? Array.from({length: 31}, (_,i) => shiftDate(month + '-01', i)).filter(date => date.startsWith(month) && date >= s.startDate && s.weekdays.includes(new Date(date + 'T12:00:00Z').getUTCDay()) && !s.skipped.includes(date) && purchaseInstant(shiftDate(date, -s.leadDays), s.purchaseTime) > now.getTime()) : [];
  return { count: dates.length, total: s.estimate === null ? null : dates.length * s.estimate };
}
export function validSchedule(value: unknown): value is Schedule {
  if (!value || typeof value !== 'object') return false;
  const s = value as Schedule;
  return typeof s.id === 'string' && typeof s.name === 'string' && !!s.name.trim() && Array.isArray(s.dishes) && s.dishes.length > 0 && s.dishes.every(d => typeof d === 'string' && !!d.trim()) &&
    Number.isInteger(s.people) && s.people > 0 && s.people <= 10000 && typeof s.dietary === 'string' &&
    Array.isArray(s.weekdays) && s.weekdays.length > 0 && s.weekdays.every(d => Number.isInteger(d) && d >= 0 && d <= 6) &&
    Number.isInteger(s.leadDays) && s.leadDays >= 1 && s.leadDays <= 7 && /^\d{2}:\d{2}$/.test(s.purchaseTime) && Number(s.purchaseTime.slice(0,2)) < 24 && Number(s.purchaseTime.slice(3)) < 60 &&
    /^\d{4}-\d{2}-\d{2}$/.test(s.startDate) && !Number.isNaN(Date.parse(s.startDate)) && new Date(s.startDate).toISOString().slice(0,10) === s.startDate &&
    !!s.delivery && typeof s.delivery.placeId === 'string' && typeof s.delivery.placeName === 'string' && typeof s.delivery.address === 'string' && typeof s.delivery.time === 'string' && !!s.delivery.time && Number.isFinite(s.delivery.latitude) && Number.isFinite(s.delivery.longitude) &&
    (s.estimate === null || (Number.isFinite(s.estimate) && s.estimate >= 0)) && Number.isFinite(s.limit) && s.limit > 0 && typeof s.paused === 'boolean' && Array.isArray(s.skipped) && s.skipped.every(d => typeof d === 'string');
}
export function readSchedules(): Schedule[] {
  try { const data: unknown = JSON.parse(localStorage.getItem(SCHEDULE_KEY) ?? '[]'); return Array.isArray(data) ? data.filter(validSchedule) : []; } catch { return []; }
}
