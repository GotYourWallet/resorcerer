import test from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, weeksInYear, weekStart, compressWeeks, weekRange } from '../src/shared/weeks.js';

test('isoWeek handles year boundaries', () => {
  assert.deepEqual(isoWeek(new Date(2026, 0, 1)), { year: 2026, week: 1 });
  assert.deepEqual(isoWeek(new Date(2027, 0, 1)), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek(new Date(2024, 11, 30)), { year: 2025, week: 1 });
});

test('weeksInYear', () => {
  assert.equal(weeksInYear(2026), 53);
  assert.equal(weeksInYear(2025), 52);
  assert.equal(weeksInYear(2020), 53);
});

test('weekStart returns the Monday', () => {
  const d = weekStart(2026, 1);
  assert.equal(d.getDay(), 1);
  assert.equal(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, '2025-12-29');
});

test('compressWeeks', () => {
  assert.equal(compressWeeks([5, 1, 2, 3]), 'W1-3, W5');
  assert.equal(compressWeeks([]), '');
});

test('weekRange clamps and orders', () => {
  assert.deepEqual(weekRange(3, 1, 52), [1, 2, 3]);
  assert.deepEqual(weekRange(51, 60, 52), [51, 52]);
});
