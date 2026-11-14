export type EventRequirements = { people: number; dietary: string[]; notes: string; budget?: number };
export type DetectedRequirements = { people: number | null; dietary: string[] | null };
export const DIETARY_CHOICES = ['Lactose-free', 'Gluten-free', 'Vegetarian', 'Vegan', 'Milk allergy', 'Egg allergy', 'Peanut allergy', 'Tree nut allergy', 'Fish allergy', 'Shellfish allergy', 'Soy allergy', 'Sesame allergy'];

export function detectRequirements(request: string): DetectedRequirements {
  const count = request.match(/\b(\d+)\s*(?:people|persons?|guests?|attendees?|participants?)\b|\bfor\s+(\d+)(?=\s*(?:[,.!?]|$|on\b|tomorrow\b|today\b))/i);
  const n = count ? Number(count[1] ?? count[2]) : null;
  const dietary: string[] = [];
  const patterns: [RegExp, string][] = [
    [/lactose[ -]?free/i, 'Lactose-free'], [/gluten[ -]?free|coeliac|celiac/i, 'Gluten-free'],
    [/\bvegetarian\b/i, 'Vegetarian'], [/\bvegan\b/i, 'Vegan'],
    [/dairy[ -]?free|milk allergy|allerg(?:ic|y) to (?:milk|dairy)/i, 'Milk allergy'],
    [/egg[ -]?free|egg allergy|allerg(?:ic|y) to eggs?/i, 'Egg allergy'],
    [/peanut[ -]?free|peanut allergy|allerg(?:ic|y) to peanuts?/i, 'Peanut allergy'],
    [/\bnut[ -]?free|tree nut allergy|allerg(?:ic|y) to (?:tree )?nuts?/i, 'Tree nut allergy'],
    [/fish[ -]?free|fish allergy|allerg(?:ic|y) to fish/i, 'Fish allergy'],
    [/shellfish[ -]?free|shellfish allergy|allerg(?:ic|y) to shellfish/i, 'Shellfish allergy'],
    [/soy[ -]?free|soy allergy|allerg(?:ic|y) to soy/i, 'Soy allergy'],
    [/sesame[ -]?free|sesame allergy|allerg(?:ic|y) to sesame/i, 'Sesame allergy'],
  ];
  for (const [pattern, label] of patterns) if (pattern.test(request)) dietary.push(label);
  // Unspecified allergies need a human answer; mentioning a food alone is not an allergy.
  const none = /\bno (?:dietary (?:restrictions|requirements)|allergies|restrictions|special diets)\b/i.test(request);
  return { people: n && n <= 10000 ? n : null, dietary: dietary.length ? dietary : none ? [] : null };
}

export function requestDeliveryDate(request: string, fallback: string, now: Date = new Date()): string {
  const iso = request.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso && !Number.isNaN(Date.parse(iso + 'T12:00:00')) && new Date(iso + 'T12:00:00Z').toISOString().startsWith(iso)) return iso;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthFirst = request.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);
  const dayFirst = request.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/i);
  if (monthFirst || dayFirst) {
    const month = months.indexOf((monthFirst?.[1] ?? dayFirst![2]).slice(0, 3).toLowerCase());
    const day = Number(monthFirst?.[2] ?? dayFirst![1]);
    const year = Number(monthFirst?.[3] ?? dayFirst?.[3] ?? now.getFullYear());
    const parsed = new Date(year, month, day, 12);
    if (parsed.getMonth() === month && parsed.getDate() === day) return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  const date = new Date(now); date.setHours(12, 0, 0, 0);
  const weekday = request.match(/\b(?:(next|this)\s+)?(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i);
  if (weekday) {
    const target = ['sun','mon','tue','wed','thu','fri','sat'].indexOf(weekday[2].slice(0,3).toLowerCase());
    let offset = (target - date.getDay() + 7) % 7;
    if (offset === 0 && weekday[1]?.toLowerCase() === 'next') offset = 7;
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  if (/\btomorrow\b/i.test(request)) date.setDate(date.getDate() + 1);
  else if (!/\btoday\b/i.test(request)) return fallback;
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function requirementsText(value: EventRequirements) {
  return `${value.people} people. Dietary requirements: ${value.dietary.length ? value.dietary.join(', ') : 'none'}.` +
    (value.budget ? ` Total food budget: EUR ${value.budget}.` : '') + (value.notes.trim() ? ` Other requirements: ${value.notes.trim()}.` : '');
}
