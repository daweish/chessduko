import { expect, it } from 'vitest';
import { LocalDate, RecentDates, UntilMidnight } from '../src/dates';

// -----------------------------------------------------------------------------
// Tests

it('uses local calendar components and crosses month/year/leap-day boundaries', () => {
  expect(LocalDate(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
  expect(RecentDates(new Date(2026, 0, 1, 12))).toEqual([
    '2026-01-01',
    '2025-12-31',
    '2025-12-30',
    '2025-12-29',
    '2025-12-28',
    '2025-12-27',
    '2025-12-26',
  ]);
  expect(RecentDates(new Date(2024, 2, 1, 12))[1]).toBe('2024-02-29');
  expect(UntilMidnight(new Date(2026, 0, 1, 23, 59, 59))).toBe(1100);
});
