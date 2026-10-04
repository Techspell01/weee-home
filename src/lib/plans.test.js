import { describe, expect, it } from 'vitest';
import { dayStrip, daysUntil, formatTime, groupOf, quickDates, sortPlans, timeRange, whenLabel } from './plans.js';

// Monday 5 Oct 2026, 6 pm local time
const now = new Date(2026, 9, 5, 18, 0).getTime();

describe('plans', () => {
  it('counts calendar days in local time', () => {
    expect(daysUntil('2026-10-05', now)).toBe(0);
    expect(daysUntil('2026-10-06', now)).toBe(1);
    expect(daysUntil('2026-10-04', now)).toBe(-1);
  });

  it('groups into today, this week, this month, later and ideas', () => {
    expect(groupOf({ plan_date: '2026-10-05' }, now)).toBe('today');
    expect(groupOf({ plan_date: '2026-10-11' }, now)).toBe('week');
    expect(groupOf({ plan_date: '2026-10-30' }, now)).toBe('month');
    expect(groupOf({ plan_date: '2026-12-25' }, now)).toBe('later');
    expect(groupOf({ plan_date: '2026-10-01' }, now)).toBe('missed');
    expect(groupOf({ plan_date: null }, now)).toBe('ideas');
  });

  it('offers weekend and next-week shortcuts from a Monday', () => {
    const q = Object.fromEntries(quickDates(now).map(x => [x.label, x.value]));
    expect(q.Today).toBe('2026-10-05');
    expect(q.Tomorrow).toBe('2026-10-06');
    expect(q['This weekend']).toBe('2026-10-10');
    expect(q['Next week']).toBe('2026-10-12');
  });

  it('formats times and labels', () => {
    expect(formatTime('19:30:00')).toBe('7:30 pm');
    expect(formatTime('00:00')).toBe('12 am');
    expect(formatTime('12:15')).toBe('12:15 pm');
    expect(whenLabel({ plan_date: '2026-10-06', plan_time: '19:30:00' }, now)).toBe('Tomorrow · 7:30 pm');
    expect(whenLabel({ plan_date: null }, now)).toBe('Someday');
  });

  it('builds a strip of days starting today and shows time ranges', () => {
    const strip = dayStrip(now, 7);
    expect(strip[0]).toMatchObject({ value: '2026-10-05', weekday: 'Today', day: 5 });
    expect(strip[1].weekday).toBe('Tmrw');
    expect(strip[6].value).toBe('2026-10-11');
    expect(timeRange({ plan_time: '09:00', end_time: '18:00' })).toBe('9 am – 6 pm');
    expect(whenLabel({ plan_date: '2026-10-05', plan_time: '09:00:00', end_time: '18:00:00' }, now)).toBe('Today · 9 am – 6 pm');
  });

  it('sorts by date, then time, with ideas last', () => {
    const p = [
      { id: 'idea', plan_date: null, created_at: '2026-10-01' },
      { id: 'late', plan_date: '2026-10-06', plan_time: '20:00', created_at: '2026-10-01' },
      { id: 'early', plan_date: '2026-10-06', plan_time: '09:00', created_at: '2026-10-01' },
      { id: 'today', plan_date: '2026-10-05', created_at: '2026-10-01' },
    ];
    expect(p.sort(sortPlans).map(x => x.id)).toEqual(['today', 'early', 'late', 'idea']);
  });
});
