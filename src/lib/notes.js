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
