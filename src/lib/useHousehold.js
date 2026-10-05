import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

// Everything a household shares. Each table is fetched once, then refetched
// whenever Supabase Realtime reports a change, so every phone stays in sync.
const TABLES = {
  members: { table: 'household_members', select: 'user_id, display_name, joined_at, share_location, last_seen', order: 'joined_at' },
  items: { table: 'items', select: '*', order: 'added_at' },
  pantry: { table: 'pantry', select: '*', order: 'name' },
  expenses: { table: 'expenses', select: '*', order: 'created_at' },
  plans: { table: 'plans', select: '*', order: 'created_at' },
  places: { table: 'places', select: '*', order: 'created_at' },
  locations: { table: 'member_locations', select: '*', order: 'updated_at' },
  presence: { table: 'place_presence', select: '*', order: 'changed_at' },
};

const EMPTY = { members: [], items: [], pantry: [], expenses: [], plans: [], places: [], locations: [], presence: [] };

// onRemoteInsert(key, row) fires when someone else adds a list item or a plan,
// or arrives at / leaves a saved place ('presence').
// `online` lists who has Weee open right now (Supabase Realtime presence).
export function useHousehold(householdId, me, { onRemoteInsert } = {}) {
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [online, setOnline] = useState([]);
  const timers = useRef({});
  const onRemoteInsertRef = useRef(onRemoteInsert);
  onRemoteInsertRef.current = onRemoteInsert;

  const refresh = useCallback(async key => {
    const t = TABLES[key];
    const { data: rows, error } = await supabase
      .from(t.table).select(t.select).eq('household_id', householdId).order(t.order);
    if (!error) setData(d => ({ ...d, [key]: rows }));
  }, [householdId]);

  const refreshAll = useCallback(async () => {
    await Promise.all(Object.keys(TABLES).map(refresh));
    setLoaded(true);
  }, [refresh]);

  useEffect(() => {
    setData(EMPTY);
    setLoaded(false);
    refreshAll();

    const schedule = key => {
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => refresh(key), 120);
    };

    const channel = supabase.channel(`household:${householdId}`, { config: { presence: { key: me } } });
    channel.on('presence', { event: 'sync' }, () => setOnline(Object.keys(channel.presenceState())));
    for (const [key, t] of Object.entries(TABLES)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t.table }, payload => {
        const row = payload.new;
        if (row?.household_id && row.household_id !== householdId) return;
        if (payload.eventType === 'INSERT') {
          if (key === 'items' && row.added_by !== me) onRemoteInsertRef.current?.(key, row);
          if (key === 'plans' && row.created_by !== me) onRemoteInsertRef.current?.(key, row);
        }
        // place_presence rows only change when someone really arrives or leaves
        if (key === 'presence' && payload.eventType === 'UPDATE' && row.user_id !== me) onRemoteInsertRef.current?.(key, row);
        schedule(key);
      });
    }
    channel.subscribe(s => {
      if (s === 'SUBSCRIBED') {
        setStatus('live');
        refreshAll(); // catch up on anything missed while away
        if (document.visibilityState === 'visible') channel.track({ at: new Date().toISOString() });
      }
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline');
    });

    // "Last seen" for when someone isn't online right now.
    const heartbeat = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.from('household_members').update({ last_seen: new Date().toISOString() })
        .eq('household_id', householdId).eq('user_id', me).then(() => {});
    };
    heartbeat();
    const beat = setInterval(heartbeat, 120000);

    // Phones suspend background tabs; resync whenever the app comes back,
    // and show as offline while the app is in the background.
    const onVisible = () => {
      if (document.visibilityState === 'visible') { refreshAll(); heartbeat(); channel.track({ at: new Date().toISOString() }); }
      else channel.untrack();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refreshAll);

    const pending = timers.current;
    return () => {
      clearInterval(beat);
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refreshAll);
      Object.values(pending).forEach(clearTimeout);
    };
  }, [householdId, me, refresh, refreshAll]);

  // Optimistic local edits so taps feel instant; the refetch confirms them.
  const patch = useCallback((key, id, changes) =>
    setData(d => ({ ...d, [key]: d[key].map(r => (r.id === id ? { ...r, ...changes } : r)) })), []);
  const drop = useCallback((key, pred) =>
    setData(d => ({ ...d, [key]: d[key].filter(r => !pred(r)) })), []);

  return { ...data, online, loaded, status, refresh, patch, drop };
}
