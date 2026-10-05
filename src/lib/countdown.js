// Countdowns: days until a date; yearly ones (anniversaries, birthdays) roll over.
import { daysUntil, toDateString } from './plans.js';

const parse = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };

// Next time this countdown happens, as "YYYY-MM-DD" (today counts).
export function nextDate(c, now = Date.now()) {
  if (!c.yearly) return c.date;
  const { m, d } = parse(c.date);
  const today = new Date(now);
  const thisYear = toDateString(new Date(today.getFullYear(), m - 1, d));
  return daysUntil(thisYear, now) >= 0 ? thisYear : toDateString(new Date(today.getFullYear() + 1, m - 1, d));
}

// { days, date, years, past } — years = which anniversary/birthday it will be.
export function countdownInfo(c, now = Date.now()) {
  const date = nextDate(c, now);
  const days = daysUntil(date, now);
  const years = c.yearly ? parse(date).y - parse(c.date).y : null;
  return { days, date, years, past: days < 0 };
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Upcoming first (soonest first), then past one-off countdowns (most recent first).
export function sortCountdowns(list, now = Date.now()) {
  return [...list].map(c => ({ c, info: countdownInfo(c, now) }))
    .sort((a, b) => (a.info.past - b.info.past) || (a.info.past ? b.info.days - a.info.days : a.info.days - b.info.days));
}
