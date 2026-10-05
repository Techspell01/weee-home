import { describe, expect, it } from 'vitest';
import { countdownInfo, nextDate, ordinal, sortCountdowns } from './countdown.js';

// Monday 5 Oct 2026, 6 pm local time
const now = new Date(2026, 9, 5, 18, 0).getTime();

describe('countdowns', () => {
  it('counts days to a one-off date', () => {
    expect(countdownInfo({ date: '2026-10-17', yearly: false }, now)).toMatchObject({ days: 12, past: false, years: null });
    expect(countdownInfo({ date: '2026-10-05', yearly: false }, now).days).toBe(0);
    expect(countdownInfo({ date: '2026-10-01', yearly: false }, now)).toMatchObject({ days: -4, past: true });
  });

  it('rolls yearly dates over and counts the years', () => {
    expect(nextDate({ date: '2023-12-25', yearly: true }, now)).toBe('2026-12-25');
    expect(nextDate({ date: '2020-03-14', yearly: true }, now)).toBe('2027-03-14');      // already passed this year
    expect(countdownInfo({ date: '2023-10-05', yearly: true }, now)).toMatchObject({ days: 0, years: 3 }); // today: 3rd anniversary
    expect(countdownInfo({ date: '2001-10-06', yearly: true }, now)).toMatchObject({ days: 1, years: 25 });
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 25].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '25th']);
  });

  it('sorts soonest first, then past ones', () => {
    const list = [
      { id: 'trip', date: '2026-11-01', yearly: false },
      { id: 'past', date: '2026-09-30', yearly: false },
      { id: 'bday', date: '2001-10-06', yearly: true },
    ];
    expect(sortCountdowns(list, now).map(x => x.c.id)).toEqual(['bday', 'trip', 'past']);
  });
});
