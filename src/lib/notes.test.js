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
