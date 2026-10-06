import { describe, expect, it } from 'vitest';
import { mergeNewer, newestFirst, upsertRow } from './rows.js';

const at = s => `2026-10-06T10:00:${String(s).padStart(2, '0')}.000Z`;

describe('applying live rows', () => {
  it('replaces a row only with a copy that is not older', () => {
    const list = [{ id: 'g', turn: 'her', updated_at: at(10) }];
    expect(upsertRow(list, { id: 'g', turn: 'me', updated_at: at(12) })[0].turn).toBe('me');
    expect(upsertRow(list, { id: 'g', turn: 'me', updated_at: at(5) })[0].turn).toBe('her'); // stale copy ignored
  });

  it('adds new rows in order and keeps only the newest when limited', () => {
    const list = [{ id: 'a', created_at: at(1) }, { id: 'c', created_at: at(3) }];
    expect(upsertRow(list, { id: 'b', created_at: at(2) }, { order: 'created_at' }).map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(upsertRow(list, { id: 'd', created_at: at(4) }, { order: 'created_at', limit: 2 }).map(r => r.id)).toEqual(['c', 'd']);
  });

  it("swaps my 'sending…' message for the real one", () => {
    const list = [{ id: 'tmp-1', user_id: 'me', body: 'hi', pending: true, created_at: at(1) }];
    const next = upsertRow(list, { id: 'm1', user_id: 'me', body: 'hi', created_at: at(1) }, { order: 'created_at', me: 'me' });
    expect(next.map(r => r.id)).toEqual(['m1']);
  });

  it('a refetch keeps a newer local copy', () => {
    const fetched = [{ id: 'g', turn: 'her', updated_at: at(10) }, { id: 'h', updated_at: at(1) }];
    const local = [{ id: 'g', turn: 'me', updated_at: at(11) }];
    expect(mergeNewer(fetched, local).map(r => r.turn)).toEqual(['me', undefined]);
  });

  it('sorts newest first', () => {
    expect(newestFirst([{ id: 1, created_at: at(1) }, { id: 2, created_at: at(5) }]).map(r => r.id)).toEqual([2, 1]);
  });
});
