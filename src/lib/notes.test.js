import { describe, expect, it } from 'vitest';
import { mapsLink, noteOf } from './notes.js';
import { splitLinks } from './chat.js';

describe('love notes', () => {
  it('has text for each kind and falls back to a heart', () => {
    expect(noteOf('love').title('Hari')).toBe('Hari loves you');
    expect(noteOf('where').back).toBe(null);
    expect(noteOf('unknown').label).toBe('Thinking of you');
  });

  it('builds a maps link from coordinates', () => {
    expect(mapsLink(12.971599, 77.594566)).toBe('https://maps.google.com/?q=12.97160,77.59457');
  });
});

describe('links in chat', () => {
  it('splits text and links, leaving trailing punctuation out', () => {
    expect(splitLinks("📍 I'm here: https://maps.google.com/?q=12.9,77.5")).toEqual([
      { text: "📍 I'm here: " }, { url: 'https://maps.google.com/?q=12.9,77.5' },
    ]);
    expect(splitLinks('see https://example.com/a. ok')).toEqual([{ text: 'see ' }, { url: 'https://example.com/a' }, { text: '. ok' }]);
    expect(splitLinks('no links here')).toEqual([{ text: 'no links here' }]);
  });
});

import { noteFor, noteKey, sentCounts } from './notes.js';

describe('custom notes and counts', () => {
  it('keys built-in and custom notes', () => {
    expect(noteKey({ kind: 'love' })).toBe('love');
    expect(noteKey({ kind: 'custom', note_id: 'abc' })).toBe('custom:abc');
    expect(noteKey({ kind: 'custom', id: 'xyz' })).toBe('custom:xyz');
  });

  it('counts only one person\'s sends', () => {
    const rows = [
      { user_id: 'me', note_key: 'love', sent: 12 },
      { user_id: 'her', note_key: 'love', sent: 9 },
      { user_id: 'me', note_key: 'custom:abc', sent: 3 },
    ];
    expect(sentCounts(rows, 'me')).toEqual({ love: 12, 'custom:abc': 3 });
    expect(sentCounts(undefined, 'me')).toEqual({});
  });

  it('shows a custom note with its own words and a heart to send back', () => {
    const n = noteFor({ kind: 'custom', text: 'Baby', emoji: '🥰' });
    expect(n.title('Hari')).toBe('Baby');
    expect(n.emoji).toBe('🥰');
    expect(n.backKind).toBe('heart');
    expect(noteFor({ kind: 'love' }).backKind).toBe('love');
    expect(noteFor({}).label).toBe('Thinking of you');
  });
});
