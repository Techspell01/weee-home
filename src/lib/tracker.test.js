import { describe, expect, it } from 'vitest';
import { dueState, fromInputs, nextRepeat, quickTimes, toInputs, whenText } from './tracker.js';

// Monday 5 Oct 2026, 6 pm local time
const now = new Date(2026, 9, 5, 18, 0).getTime();
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();

describe('tracker', () => {
  it('knows what is overdue, due today, upcoming or unscheduled', () => {
    expect(dueState({ next_at: at(5, 15) }, now)).toBe('overdue');
    expect(dueState({ next_at: at(5, 20) }, now)).toBe('today');
    expect(dueState({ next_at: at(7, 10) }, now)).toBe('upcoming');
    expect(dueState({ next_at: null }, now)).toBe('none');
    expect(dueState({ next_at: at(5, 15), done: true }, now)).toBe('done');
  });

  it('describes the reminder time', () => {
    expect(whenText({ next_at: at(5, 16) }, now)).toBe('Due 2 h ago');
    expect(whenText({ next_at: at(5, 20, 30) }, now)).toBe('Today · 8:30 pm');
    expect(whenText({ next_at: at(6, 10) }, now)).toBe('Tomorrow · 10 am');
    expect(whenText({ next_at: at(12, 10) }, now)).toMatch(/· 10 am · in 7 days$/);
    expect(whenText({ next_at: null }, now)).toBe('No reminder');
  });

  it('schedules the next repeat at the same time of day, never in the past', () => {
    expect(nextRepeat({ repeat_days: 3, next_at: at(5, 10) }, now)).toBe(at(8, 10));
    expect(nextRepeat({ repeat_days: 2, next_at: at(1, 10) }, now)).toBe(at(7, 10)); // 3rd and 5th already passed
    expect(nextRepeat({ repeat_days: null, next_at: at(5, 10) }, now)).toBe(null);
  });

  it('offers quick reminder times and round-trips the date/time inputs', () => {
    const q = Object.fromEntries(quickTimes(now).map(x => [x.label, x.at]));
    expect(q['Tomorrow 10 am'].toISOString()).toBe(at(6, 10));
    expect(q['Next week'].toISOString()).toBe(at(12, 10));
    const { date, time } = toInputs(new Date(2026, 9, 6, 9, 5));
    expect([date, time]).toEqual(['2026-10-06', '09:05']);
    expect(fromInputs(date, time)).toBe(at(6, 9, 5));
    expect(fromInputs('', '10:00')).toBe(null);
  });
});
