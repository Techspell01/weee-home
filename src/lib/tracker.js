// Follow-up tracker: when things are due, how to describe it, and repeats.
import { DAY } from './groceries.js';
import { formatTime, toDateString, daysUntil } from './plans.js';

export const KINDS = { job: 'Job application', other: 'Other' };
export const STAGES = [
  ['applied', 'Applied'],
  ['followed_up', 'Followed up'],
  ['interview', 'Interview'],
  ['offer', 'Offer'],
  ['rejected', 'Rejected'],
];
export const STAGE_LABEL = Object.fromEntries(STAGES);
export const REPEATS = [[null, 'No repeat'], [2, 'Every 2 days'], [3, 'Every 3 days'], [7, 'Weekly'], [14, 'Every 2 weeks']];

// 'overdue' | 'today' | 'upcoming' | 'none' (no reminder) | 'done'
export function dueState(t, now = Date.now()) {
  if (t.done) return 'done';
  if (!t.next_at) return 'none';
  const at = Date.parse(t.next_at);
  if (at <= now) return 'overdue';
  return daysUntil(toDateString(new Date(at)), now) === 0 ? 'today' : 'upcoming';
}

const hm = iso => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function agoShort(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// "Today · 3:30 pm", "Tomorrow · 10 am", "Mon, 12 Oct · 10 am", "Due 2 h ago", "No reminder"
export function whenText(t, now = Date.now()) {
  if (!t.next_at) return 'No reminder';
  const at = Date.parse(t.next_at);
  if (at <= now) return `Due ${agoShort(now - at)}`;
  const d = daysUntil(toDateString(new Date(at)), now);
  const time = formatTime(hm(t.next_at));
  if (d === 0) return `Today · ${time}`;
  if (d === 1) return `Tomorrow · ${time}`;
  const day = new Date(at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${time} · in ${d} days`;
}

// After a follow-up: the next reminder for a repeating tracker, keeping the time
// of day and skipping any dates already in the past. Null if it doesn't repeat.
export function nextRepeat(t, now = Date.now()) {
  if (!t.repeat_days) return null;
  let at = t.next_at ? Date.parse(t.next_at) : now;
  do { at += t.repeat_days * DAY; } while (at <= now);
  return new Date(at).toISOString();
}

// Quick picks for the reminder time (local time).
export function quickTimes(now = Date.now()) {
  const at = (days, h, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
  const inHour = new Date(now + 3600000); inHour.setSeconds(0, 0);
  return [
    { label: 'In 1 hour', at: inHour },
    { label: 'Tomorrow 10 am', at: at(1, 10) },
    { label: 'In 3 days', at: at(3, 10) },
    { label: 'Next week', at: at(7, 10) },
  ];
}

// Split a Date into the values of <input type="date"> and <input type="time">.
export const toInputs = d => ({ date: toDateString(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` });
export const fromInputs = (date, time) => (date ? new Date(`${date}T${time || '10:00'}`).toISOString() : null);
