const DAY_MS = 86400000;

/** ISO 8601 week (1-53) and week-year of a date. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // Thursday of this week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / DAY_MS + 1) / 7) };
}

/** Number of ISO weeks (52 or 53) in a year. Dec 28 always falls in the last one. */
export function weeksInYear(year) {
  return isoWeek(new Date(year, 11, 28)).week;
}

/** Monday of an ISO week as a local Date. */
export function weekStart(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayWeek1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY_MS;
  const d = new Date(mondayWeek1 + (week - 1) * 7 * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** [1,2,3,5] -> "W1-3, W5" */
export function compressWeeks(weeks) {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `W${sorted[i]}-${sorted[j]}` : `W${sorted[i]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

/** Inclusive list of weeks from..to, clamped to 1..max. */
export function weekRange(from, to, max) {
  const a = Math.max(1, Math.min(from, to));
  const b = Math.min(max, Math.max(from, to));
  const out = [];
  for (let w = a; w <= b; w++) out.push(w);
  return out;
}
