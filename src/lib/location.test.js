import { describe, expect, it } from 'vitest';
import { activityFor, distanceM, formatDistance, kmh } from './location.js';
import { formatStay } from './time.js';

describe('movement', () => {
  it('turns speed into walking, riding or driving', () => {
    expect(activityFor(null)).toBe(null);
    expect(activityFor(0.2)).toBe('still');
    expect(activityFor(1.4)).toBe('walking');   // ~5 km/h
    expect(activityFor(4.5)).toBe('cycling');   // ~16 km/h
    expect(activityFor(13.9)).toBe('driving');  // ~50 km/h
    expect(kmh(13.9)).toBe(50);
  });
  it('measures and formats distance', () => {
    expect(Math.round(distanceM({ lat: 12.9716, lng: 77.5946 }, { lat: 13.0827, lng: 80.2707 }) / 1000)).toBe(290);
    expect(formatDistance(430)).toBe('430 m');
    expect(formatDistance(2400)).toBe('2.4 km');
  });
  it('formats how long someone stayed', () => {
    expect(formatStay(20 * 1000)).toBe('just arrived');
    expect(formatStay(25 * 60000)).toBe('25 min');
    expect(formatStay(125 * 60000)).toBe('2 h 5 min');
    expect(formatStay(120 * 60000)).toBe('2 h');
    expect(formatStay(27 * 3600000)).toBe('1 d 3 h');
  });
});
