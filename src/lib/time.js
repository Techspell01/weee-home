export function ago(iso, now = Date.now()) {
  if (!iso) return '';
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// How long a stay has lasted: "just arrived", "25 min", "2 h 5 min", "1 d 3 h".
export function formatStay(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just arrived';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}
