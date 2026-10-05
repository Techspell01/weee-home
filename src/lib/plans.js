// Plans use calendar dates in the phone's local time zone ("YYYY-MM-DD"),
// never UTC timestamps, so a plan for Saturday stays on Saturday.
import { DAY } from './groceries.js';

export const KINDS = {
  date: 'Date',
  outing: 'Outing',
  todo: 'To-do',
  trip: 'Trip',
  family: 'Family',
  work: 'Work',
};

// Kinds offered for shared plans and for a person's own schedule.
export const TOGETHER_KINDS = ['date', 'outing', 'todo', 'trip', 'family'];
export const MY_KINDS = ['work', 'todo', 'family', 'outing', 'trip'];

const pad = n => String(n).padStart(2, '0');
export const toDateString = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDateString = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };

export function daysUntil(dateStr, now = Date.now()) {
  return Math.round((fromDateString(dateStr) - startOfDay(now)) / DAY);
}

// Shortcuts for the add form.
export function quickDates(now = Date.now()) {
  const today = startOfDay(now);
  const plus = n => toDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
  const dow = today.getDay(); // 0 Sun … 6 Sat
  const toSaturday = dow === 0 ? 0 : 6 - dow; // on Sunday, "this weekend" is today
  const toNextMonday = ((8 - dow) % 7) || 7;
  return [
    { label: 'Today', value: plus(0) },
    { label: 'Tomorrow', value: plus(1) },
    { label: 'This weekend', value: plus(toSaturday) },
    { label: 'Next week', value: plus(toNextMonday) },
    { label: 'No date yet', value: '' },
  ];
}

// The scrollable row of days at the top of Plans.
export function dayStrip(now = Date.now(), count = 21) {
  const today = startOfDay(now);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    return {
      value: toDateString(d),
      weekday: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-IN', { weekday: 'short' }),
      day: d.getDate(),
      month: d.toLocaleDateString('en-IN', { month: 'short' }),
    };
  });
}

export function dayTitle(dateStr, now = Date.now()) {
  const d = daysUntil(dateStr, now);
  const long = fromDateString(dateStr).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  return d === 0 ? `Today, ${long}` : d === 1 ? `Tomorrow, ${long}` : long;
}

export function timeRange(plan) {
  if (!plan.plan_time) return '';
  return plan.end_time ? `${formatTime(plan.plan_time)} – ${formatTime(plan.end_time)}` : formatTime(plan.plan_time);
}

export const GROUPS = [
  ['missed', 'Earlier, not marked done'],
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['later', 'Later'],
  ['ideas', 'Ideas · no date yet'],
];

export function groupOf(plan, now = Date.now()) {
  if (!plan.plan_date) return 'ideas';
  const d = daysUntil(plan.plan_date, now);
  if (d < 0) return 'missed';
  if (d === 0) return 'today';
  if (d <= 7) return 'week';
  if (d <= 31) return 'month';
  return 'later';
}

export function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? ':' + pad(m) : ''} ${h < 12 ? 'am' : 'pm'}`;
}

export function whenLabel(plan, now = Date.now()) {
  if (!plan.plan_date) return plan.plan_time ? timeRange(plan) : 'Someday';
  const d = daysUntil(plan.plan_date, now);
  const date = fromDateString(plan.plan_date);
  const day = date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const rel = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday'
    : d > 1 ? `${day} · in ${d} days` : `${day} · ${-d} days ago`;
  return plan.plan_time ? `${rel} · ${timeRange(plan)}` : rel;
}

export function sortPlans(a, b) {
  if (a.plan_date !== b.plan_date) {
    if (!a.plan_date) return 1;
    if (!b.plan_date) return -1;
    return a.plan_date < b.plan_date ? -1 : 1;
  }
  if ((a.plan_time || '') !== (b.plan_time || '')) return (a.plan_time || '99') < (b.plan_time || '99') ? -1 : 1;
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

export const mapLink = place => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

// Calendar cells for one month, Monday first; null for the blanks before the 1st.
export function monthCells(year, month) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => toDateString(new Date(year, month, i + 1)))];
}

// "in 25 min", "in 2 h", "Tomorrow", "in 5 days" until a plan starts.
export function untilLabel(plan, now = Date.now()) {
  if (!plan.plan_date) return 'Someday';
  const d = daysUntil(plan.plan_date, now);
  if (d === 0) {
    if (!plan.plan_time) return 'Today';
    const [h, m] = plan.plan_time.split(':').map(Number);
    const start = new Date(now); start.setHours(h, m, 0, 0);
    const mins = Math.round((start - now) / 60000);
    if (mins <= 0) return 'Now';
    if (mins < 60) return `in ${mins} min`;
    return `in ${Math.round(mins / 60)} h`;
  }
  return d === 1 ? 'Tomorrow' : `in ${d} days`;
}
