import { expect, test } from 'bun:test';
import { detectRequirements, requestDeliveryDate, requirementsText } from '../../web/src/requirements';

test('event requirements distinguish missing details from explicit none and actual dietary needs', () => {
  expect(detectRequirements('Snacks for an event')).toEqual({ people: null, dietary: null });
  expect(detectRequirements('For 50 people, no dietary restrictions')).toEqual({ people: 50, dietary: [] });
  expect(detectRequirements('50 croissants and salmon soup')).toEqual({ people: null, dietary: null });
  expect(detectRequirements('Catering for 50 on Saturday. 3 guests are lactose-free.')).toEqual({ people: 50, dietary: ['Lactose-free'] });
  expect(detectRequirements('20 guests, some have allergies')).toEqual({ people: 20, dietary: null });
  expect(detectRequirements('10 people, peanut allergy')).toEqual({ people: 10, dietary: ['Peanut allergy'] });
});

test('confirmed constraints carry guest count, dietary needs, budget and notes to the planner', () => {
  const text = requirementsText({ people: 60, dietary: ['Vegan', 'Peanut allergy'], budget: 350, notes: 'No pork' });
  expect(text).toContain('60 people'); expect(text).toContain('Dietary requirements: Vegan.'); expect(text).toContain('no peanuts'); expect(text).toContain('EUR 350'); expect(text).toContain('No pork');
});

test('delivery popup prefills explicit dates and rejects invalid calendar dates', () => {
  expect(requestDeliveryDate('Deliver Nov 25, 2026', '2026-11-20')).toBe('2026-11-25');
  expect(requestDeliveryDate('Event 25 Nov 2026', '2026-11-20')).toBe('2026-11-25');
  expect(requestDeliveryDate('Deliver 2026-11-27', '2026-11-20')).toBe('2026-11-27');
  expect(requestDeliveryDate('Deliver 2026-02-31', '2026-11-20')).toBe('2026-11-20');
});


test('relative delivery weekdays use the local calendar and cross month and year boundaries', () => {
  const saturday = new Date(2026, 10, 14, 23, 30);
  expect(requestDeliveryDate('Deliver next Tuesday', '2026-11-20', saturday)).toBe('2026-11-17');
  expect(requestDeliveryDate('Catering on Monday', '2026-11-20', saturday)).toBe('2026-11-16');
  expect(requestDeliveryDate('next Tuesday', '', new Date(2026, 10, 17, 9))).toBe('2026-11-24');
  expect(requestDeliveryDate('next Tuesday', '', new Date(2026, 11, 29, 9))).toBe('2027-01-05');
  expect(requestDeliveryDate('next Sunday', '', new Date(2026, 2, 28, 12))).toBe('2026-03-29');
  // Demo rule: delivery >= 24 h ahead. Sat 23:30 + 24 h is past Sunday's last 12:00 slot, so Monday.
  expect(requestDeliveryDate('Tomorrow', '', saturday)).toBe('2026-11-16');
  expect(requestDeliveryDate('Catering for 50 on Saturday', '', saturday)).toBe('2026-11-21');
  expect(requestDeliveryDate('Tuesday, Nov 24, 2026', '', saturday)).toBe('2026-11-24');
});
