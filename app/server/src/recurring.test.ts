import { describe, expect, test } from 'bun:test';
import { monthlyProjection, occurrences, purchaseInstant, shiftDate, validSchedule, type Schedule } from '../../web/src/recurring';

const schedule: Schedule = {
  id: 'test', name: 'Monday lunch', dishes: ['Soup'], people: 50, dietary: '',
  weekdays: [1], leadDays: 2, purchaseTime: '09:00', startDate: '2026-11-14',
  delivery: { placeId: 'test', placeName: 'Restaurant', address: 'Helsinki', latitude: 60, longitude: 24, date: '2026-11-16', time: '8–10' },
  estimate: 100, limit: 500, paused: false, skipped: [],
};
describe('recurring menu calendar', () => {
  const now = new Date('2026-11-14T06:00:00Z');
  test('separates purchasing from delivery, including month rollover', () => {
    expect(occurrences(schedule, now)[0]).toBe('2026-11-16');
    expect(shiftDate('2026-12-01', -2)).toBe('2026-11-29');
    expect(purchaseInstant('2026-11-14', '09:00')).toBe(Date.parse('2026-11-14T07:00:00Z'));
    expect(purchaseInstant('2026-07-14', '09:00')).toBe(Date.parse('2026-07-14T06:00:00Z'));
  });
  test('past purchasing slots never appear as upcoming', () => {
    expect(occurrences(schedule, new Date('2026-11-14T07:01:00Z'))[0]).toBe('2026-11-23');
  });
  test('pause and skip affect projections and do not change the weekly rhythm', () => {
    expect(occurrences({ ...schedule, paused: true }, now)).toEqual([]);
    const skipped = { ...schedule, skipped: ['2026-11-16'] };
    expect(occurrences(skipped, now)[0]).toBe('2026-11-23');
    expect(monthlyProjection(skipped, '2026-11', now)).toEqual({ count: 2, total: 200 });
    expect(monthlyProjection({ ...schedule, estimate: null }, '2026-11', now)).toEqual({ count: 3, total: null });
  });
  test('supports multiple delivery weekdays and future start dates', () => {
    expect(occurrences({ ...schedule, weekdays: [1,3], startDate: '2026-11-20' }, now).slice(0,2)).toEqual(['2026-11-23','2026-11-25']);
  });
  test('month projections include deliveries purchased in the prior month and distant months', () => {
    expect(monthlyProjection(schedule, '2027-02', now)).toEqual({count: 4, total: 400});
    expect(monthlyProjection(schedule, '2028-02', now).count).toBe(4);
  });
  test('rejects malformed or incomplete persisted schedules', () => {
    expect(validSchedule(schedule)).toBe(true);
    for (const patch of [{ weekdays: [] }, { purchaseTime: '25:00' }, { people: 0 }, { delivery: {} }, { dishes: [42] }, { estimate: -1 }, { limit: 0 }]) expect(validSchedule({ ...schedule, ...patch })).toBe(false);
  });
});
