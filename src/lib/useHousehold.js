import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

// Everything a household shares. Each table is fetched once, then refetched
// whenever Supabase Realtime reports a change, so every phone stays in sync.
const TABLES = {
  members: { table: 'household_members', select: 'user_id, display_name, joined_at, last_seen, chat_read_at, chat_cleared_at, avatar_path', order: 'joined_at' },
  items: { table: 'items', select: '*', order: 'added_at' },
  pantry: { table: 'pantry', select: '*', order: 'name' },
  expenses: { table: 'expenses', select: '*', order: 'created_at' },
  plans: { table: 'plans', select: '*', order: 'created_at' },
  // newest 300 messages, shown oldest first
  messages: { table: 'messages', select: '*', order: 'created_at', desc: true, limit: 300 },
  hides: { table: 'message_hides', select: 'message_id', order: 'message_id' }, // only my own (RLS)
  countdowns: { table: 'countdowns', select: '*', order: 'date' },
  nudges: { table: 'nudges', select: '*', order: 'created_at', desc: true, limit: 50 },
  reactions: { table: 'message_reactions', select: 'message_id, user_id, emoji', order: 'created_at' },
  loveNotes: { table: 'love_notes', select: '*', order: 'created_at' },
  counts: { table: 'note_counts', select: 'user_id, note_key, sent, last_sent_at', order: 'note_key' },
  games: { table: 'games', select: '*', order: 'created_at', desc: true, limit: 150 },
  picks: { table: 'game_picks', select: 'game_id, round, pick', order: 'created_at', desc: true, limit: 60 }, // only my own (RLS)
};

const EMPTY = { members: [], items: [], pantry: [], expenses: [], plans: [], messages: [], hides: [], countdowns: [], nudges: [], reactions: [], loveNotes: [], counts: [], games: [], picks: [] };

// onRemoteInsert(key, row) fires when someone else adds a list item, a plan or a message.
// `online` lists who has Weee open right now (Supabase Realtime presence).
export function useHousehold(householdId, me, { onRemoteInsert } = {}) {
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [online, setOnline] = useState([]);
  const [typing, setTyping] = useState({}); // user id -> last 'typing' signal time
  const channelRef = useRef(null);
  const timers = useRef({});
  const onRemoteInsertRef = useRef(onRemoteInsert);
  onRemoteInsertRef.current = onRemoteInsert;

  const refresh = useCallback(async key => {
    const t = TABLES[key];
    let q = supabase.from(t.table).select(t.select).eq('household_id', householdId).order(t.order, { ascending: !t.desc });
    if (t.limit) q = q.limit(t.limit);
    const { data: rows, error } = await q;
    if (!error) setData(d => ({ ...d, [key]: t.desc ? rows.reverse() : rows }));
  }, [householdId]);

  const refreshAll = useCallback(async () => {
    await Promise.all(Object.keys(TABLES).map(refresh));
    setLoaded(true);
  }, [refresh]);

  useEffect(() => {
    setData(EMPTY);
    setLoaded(false);
    refreshAll();

    let channel = null;
    let closed = false;
    let retry = 0, retryTimer = 0, pollTimer = 0;

    const schedule = key => {
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => refresh(key), 120);
    };

    // Safety net: if live updates are unavailable, keep the screen fresh by
    // re-fetching every 5 seconds while the app is open.
    const startPolling = () => {
      if (!pollTimer) pollTimer = setInterval(() => { if (document.visibilityState === 'visible') refreshAll(); }, 5000);
    };
    const stopPolling = () => { clearInterval(pollTimer); pollTimer = 0; };

    const onChange = key => payload => {
      const row = payload.new;
      if (row?.household_id && row.household_id !== householdId) return;
      if (payload.eventType === 'INSERT') {
        if (key === 'items' && row.added_by !== me) onRemoteInsertRef.current?.(key, row);
        if (key === 'plans' && row.created_by !== me) onRemoteInsertRef.current?.(key, row);
        if (key === 'nudges' && row.from_user !== me) onRemoteInsertRef.current?.(key, row);
        if (key === 'games' && row.created_by !== me) onRemoteInsertRef.current?.(key, row);
        if (key === 'messages' && row.user_id !== me) {
          onRemoteInsertRef.current?.(key, row);
          setTyping(t => ({ ...t, [row.user_id]: 0 })); // they sent it, so they stopped typing
        }
      }
      if (payload.eventType === 'UPDATE' && key === 'games' && row.last_actor && row.last_actor !== me) {
        onRemoteInsertRef.current?.('games:update', row);
      }
      schedule(key);
    };

    // (Re)open the live channel. Called at start, after errors (with backoff),
    // and whenever the app comes back and finds the connection dead (iOS drops
    // it while the app is in the background).
    const connect = () => {
      if (closed) return;
      const old = channel;
      channel = null;
      if (old) supabase.removeChannel(old);

      const ch = supabase.channel(`household:${householdId}`, { config: { presence: { key: me } } });
      channel = ch;
      channelRef.current = ch;
      ch.on('presence', { event: 'sync' }, () => setOnline(Object.keys(ch.presenceState())));
      ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.user && payload.user !== me) setTyping(t => ({ ...t, [payload.user]: Date.now() }));
      });
      // Supabase reports whether the database changes subscription was accepted.
      ch.on('system', {}, msg => {
        if (ch !== channel || msg?.extension !== 'postgres_changes') return;
        if (msg.status === 'ok') { stopPolling(); setStatus('live'); }
        else { console.warn('Live updates unavailable, refreshing every 5 s instead:', msg.message); setStatus('polling'); startPolling(); }
      });
      for (const [key, t] of Object.entries(TABLES)) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t.table }, onChange(key));
      }
      ch.subscribe(s => {
        if (ch !== channel || closed) return; // an old channel closing after a reconnect
        if (s === 'SUBSCRIBED') {
          retry = 0;
          setStatus(st => (st === 'polling' ? st : 'live'));
          refreshAll(); // catch up on anything missed while away
          if (document.visibilityState === 'visible') ch.track({ at: new Date().toISOString() });
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setStatus('offline');
          startPolling();
          clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
        }
      });
    };
    connect();

    const ensureLive = () => {
      if (closed) return;
      if (!channel || !['joined', 'joining'].includes(channel.state)) connect();
    };
    const health = setInterval(() => { if (document.visibilityState === 'visible') ensureLive(); }, 15000);

    // "Last seen" for when someone isn't online right now.
    const heartbeat = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.from('household_members').update({ last_seen: new Date().toISOString() })
        .eq('household_id', householdId).eq('user_id', me).then(() => {});
    };
    heartbeat();
    const beat = setInterval(heartbeat, 120000);

    // Phones suspend background apps; when Weee comes back, reconnect if needed,
    // catch up, and show as online again. In the background, show as offline.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        ensureLive();
        refreshAll();
        heartbeat();
        channel?.track({ at: new Date().toISOString() });
      } else channel?.untrack();
    };
    const onOnline = () => { ensureLive(); refreshAll(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onVisible);

    const pending = timers.current;
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      stopPolling();
      clearInterval(health);
      clearInterval(beat);
      channelRef.current = null;
      if (channel) supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onVisible);
      Object.values(pending).forEach(clearTimeout);
    };
  }, [householdId, me, refresh, refreshAll]);

  // Optimistic local edits so taps feel instant; the refetch confirms them.
  const patch = useCallback((key, id, changes) =>
    setData(d => ({ ...d, [key]: d[key].map(r => (r.id === id ? { ...r, ...changes } : r)) })), []);
  const drop = useCallback((key, pred) =>
    setData(d => ({ ...d, [key]: d[key].filter(r => !pred(r)) })), []);
  const add = useCallback((key, row) => setData(d => ({ ...d, [key]: [...d[key], row] })), []);

  // Tell the others "I'm typing" (at most every 2 s); they show it for 4 s.
  const lastTyping = useRef(0);
  const sendTyping = useCallback(() => {
    if (Date.now() - lastTyping.current < 2000) return;
    lastTyping.current = Date.now();
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user: me } });
  }, [me]);

  return { ...data, online, typing, sendTyping, loaded, status, refresh, patch, drop, add };
}
