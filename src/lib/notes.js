// Love notes: the one-tap messages on the home screen.
export const NOTE_KINDS = ['heart', 'love', 'miss', 'where'];

export const NOTES = {
  heart: { emoji: '💗', label: 'Thinking of you', title: from => `${from} is thinking of you`, back: 'Send one back 💗', sent: 'Heart sent 💗' },
  love: { emoji: '❤️', label: 'I love you', title: from => `${from} loves you`, back: 'Love you too ❤️', sent: '"I love you" sent ❤️' },
  miss: { emoji: '🥺', label: 'I miss you', title: from => `${from} misses you`, back: 'Miss you too 🥺', sent: '"I miss you" sent 🥺' },
  where: { emoji: '📍', label: 'Where are you?', title: from => `${from} is asking where you are`, back: null, sent: 'Asked where they are 📍' },
};

export const noteOf = kind => NOTES[kind] || NOTES.heart;

// Quick answers to "Where are you?" (sent as a chat message).
export const WHERE_REPLIES = ['On my way', 'At home', 'At work', 'In class', 'Out, will call you'];

export const mapsLink = (lat, lng) => `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;

// ---------- your own notes ----------
export const MAX_CUSTOM = 8;
export const EMOJI_IDEAS = ['🥰', '😘', '🫶', '🤗', '😴', '🌙', '☀️', '🍫', '🌸', '💋', '✨', '🧸'];
export const TEXT_IDEAS = ['Baby', 'Good morning', 'Good night', 'Hug me', 'Call me', 'Come home soon', 'Proud of you'];

// The counter key for a note: heart | love | miss | where | custom:<id>
export const noteKey = ({ kind, note_id, id }) => (kind === 'custom' ? `custom:${note_id || id}` : kind);

// How many times one person has sent each note: { love: 12, 'custom:<id>': 3 }
export function sentCounts(counts = [], userId) {
  const out = {};
  for (const c of counts) if (c.user_id === userId) out[c.note_key] = c.sent;
  return out;
}

// What to show for a received note, built-in or custom.
export function noteFor(row = {}) {
  if (row.kind === 'custom') {
    const text = row.text || 'Love note';
    const emoji = row.emoji || '💌';
    return { emoji, label: text, title: () => text, custom: true, back: 'Send a heart back 💗', backKind: 'heart', sent: `"${text}" sent ${emoji}` };
  }
  return { ...noteOf(row.kind), backKind: row.kind || 'heart' };
}
