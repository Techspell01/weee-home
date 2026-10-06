// Keeping lists of rows in sync when changes arrive one at a time.

const time = r => (r?.updated_at ? Date.parse(r.updated_at) : 0);
const compare = field => (a, b) => {
  const x = a?.[field] ?? '', y = b?.[field] ?? '';
  return x < y ? -1 : x > y ? 1 : 0;
};

// Insert or replace one row in a list kept in ascending `order`. A row that has
// `updated_at` only replaces a copy that isn't newer. A message I sent replaces
// its "sending…" placeholder. Lists with a `limit` keep the newest rows.
export function upsertRow(list, row, { order, limit, me } = {}) {
  const i = list.findIndex(r => r.id === row.id);
  if (i >= 0) {
    if (time(list[i]) > time(row)) return list; // ours is newer
    const next = list.slice();
    next[i] = { ...list[i], ...row };
    return next;
  }
  let next = list;
  if (row.user_id && row.user_id === me && row.body !== undefined) {
    const temp = next.findIndex(r => r.pending && r.user_id === me && r.body === row.body);
    if (temp >= 0) next = next.filter((_, k) => k !== temp);
  }
  next = [...next, row];
  if (order) next.sort(compare(order));
  if (limit && next.length > limit) next = next.slice(next.length - limit);
  return next;
}

// After a full refetch: use the fetched rows, but keep any local copy that's newer
// (a move that arrived straight from the other phone while the fetch was in flight).
export function mergeNewer(fetched, local) {
  const mine = new Map(local.map(r => [r.id, r]));
  return fetched.map(r => {
    const l = mine.get(r.id);
    return l && time(l) > time(r) ? l : r;
  });
}

// Newest first, by a timestamp field.
export const newestFirst = (rows, field = 'created_at') => [...rows].sort((a, b) => Date.parse(b[field] || 0) - Date.parse(a[field] || 0));
