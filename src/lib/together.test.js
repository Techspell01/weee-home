import { describe, expect, it } from 'vitest';
import { togetherInfo, togetherSince } from './together.js';

// Monday 5 Oct 2026, 6 pm local time
const now = new Date(2026, 9, 5, 18, 0).getTime();

describe('days together', () => {
  it('counts days and full years since the date', () => {
    expect(togetherInfo('2023-10-06', now)).toMatchObject({ days: 1095, years: 2, milestone: null });
    expect(togetherInfo('2026-10-05', now)).toMatchObject({ days: 0, years: 0 });
    expect(togetherInfo('2027-01-01', now)).toBe(null); // in the future
    expect(togetherInfo(null, now)).toBe(null);
  });

  it('celebrates anniversaries and round numbers', () => {
    expect(togetherInfo('2023-10-05', now).milestone).toBe('Happy 3-year anniversary');
    expect(togetherInfo('2025-10-05', now).milestone).toBe('Happy first anniversary');
    expect(togetherInfo('2026-06-27', now).milestone).toBe('100 days together today');
    expect(togetherInfo('2024-01-09', now).milestone).toBe('1,000 days. What a milestone');
  });

  it('falls back to an anniversary countdown', () => {
    expect(togetherSince({ together_since: '2022-02-14' }, [])).toBe('2022-02-14');
    expect(togetherSince({}, [{ title: 'Our anniversary', yearly: true, date: '2023-03-12' }])).toBe('2023-03-12');
    expect(togetherSince({}, [{ title: 'Birthday', yearly: true, date: '2001-03-12' }])).toBe(null);
  });
});
