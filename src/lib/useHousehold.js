import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

// Everything a household shares. Each table is fetched once, then refetched
// whenever Supabase Realtime reports a change, so every phone stays in sync.
const TABLES = {
  members: { table: 'household_members', select: 'user_id, display_name, joined_at', order: 'joined_at' },
  items: { table: 'items', select: '*', order: 'added_at' },
  pantry: { table: 'pantry', select: '*', order: 'name' },
  expenses: { table: 'expenses', select: '*', order: 'created_at' },
  plans: { table: 'plans', select: '*', order: 'created_at' },
};

const EMPTY = { members: [], items: [], pantry: [], expenses: [], plans: [] };

// onRemoteInsert(key, row) fires when someone else adds a list item or a plan.
export function useHousehold(householdId, me, { onRemoteInsert } = {}) {
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('connecting');
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

    const channel = supabase.channel(`household:${householdId}`);
    for (const [key, t] of Object.entries(TABLES)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t.table }, payload => {
        const row = payload.new;
        if (row?.household_id && row.household_id !== householdId) return;
        if (payload.eventType === 'INSERT') {
          if (key === 'items' && row.added_by !== me) onRemoteInsertRef.current?.(key, row);
          if (key === 'plans' && row.created_by !== me) onRemoteInsertRef.current?.(key, row);
        }
        schedule(key);
      });
    }
    channel.subscribe(s => {
      if (s === 'SUBSCRIBED') { setStatus('live'); refreshAll(); } // catch up on anything missed while away
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline');
    });

    // Phones suspend background tabs; resync whenever the app comes back.
    const onVisible = () => { if (document.visibilityState === 'visible') refreshAll(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refreshAll);

    const pending = timers.current;
    return () => {
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

  return { ...data, loaded, status, refresh, patch, drop };
}
