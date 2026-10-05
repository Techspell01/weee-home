// "1,096 days together": from the household's together-since date, or else from
// an anniversary countdown if there is one.
import { daysUntil } from './plans.js';

export function togetherSince(household, countdowns = []) {
  if (household?.together_since) return household.together_since;
  const anniversary = countdowns.find(c => c.yearly && /anniversar/i.test(c.title));
  return anniversary ? anniversary.date : null;
}

// { days, years, milestone } — milestone is a short celebration line or null.
export function togetherInfo(since, now = Date.now()) {
  if (!since) return null;
  const until = daysUntil(since, now);
  if (until > 0) return null; // in the future
  const days = until === 0 ? 0 : -until;
  const [y, m, d] = since.split('-').map(Number);
  const today = new Date(now);
  const isAnniversary = today.getMonth() === m - 1 && today.getDate() === d && today.getFullYear() > y;
  const years = today.getFullYear() - y - (today.getMonth() < m - 1 || (today.getMonth() === m - 1 && today.getDate() < d) ? 1 : 0);
  let milestone = null;
  if (isAnniversary) milestone = `Happy ${years === 1 ? 'first' : `${years}-year`} anniversary`;
  else if (days > 0 && days % 1000 === 0) milestone = `${days.toLocaleString('en-IN')} days. What a milestone`;
  else if (days > 0 && days % 100 === 0) milestone = `${days} days together today`;
  return { days, years, milestone };
}
