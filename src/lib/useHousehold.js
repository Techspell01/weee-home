import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { mergeNewer, upsertRow } from './rows.js';

// Everything a household shares. Each table is fetched once; after that, live
// changes from Supabase Realtime are applied in place (rows that carry their own
// id), or the table is refetched (the few keyed by two columns).
const TABLES = {
  members: { table: 'household_members', select: 'user_id, display_name, joined_at, last_seen, chat_read_at, chat_cleared_at, avatar_path, hidden_notes', order: 'joined_at' },
  items: { table: 'items', select: '*', order: 'added_at', direct: true },
  pantry: { table: 'pantry', select: '*', order: 'name', direct: true },
  expenses: { table: 'expenses', select: '*', order: 'created_at', direct: true },
  plans: { table: 'plans', select: '*', order: 'created_at', direct: true },
  // newest 300 messages, shown oldest first
  messages: { table: 'messages', select: '*', order: 'created_at', desc: true, limit: 300, direct: true },
  hides: { table: 'message_hides', select: 'message_id', order: 'message_id' }, // only my own (RLS)
  countdowns: { table: 'countdowns', select: '*', order: 'date', direct: true },
  nudges: { table: 'nudges', select: '*', order: 'created_at', desc: true, limit: 50, direct: true },
  reactions: { table: 'message_reactions', select: 'message_id, user_id, emoji', order: 'created_at' },
  loveNotes: { table: 'love_notes', select: '*', order: 'created_at', direct: true },
  counts: { table: 'note_counts', select: '*', order: 'note_key', direct: true },
  games: { table: 'games', select: '*', order: 'created_at', desc: true, limit: 150, direct: true },
  picks: { table: 'game_picks', select: 'game_id, round, pick', order: 'created_at', desc: true, limit: 60 }, // only my own (RLS)
};

const EMPTY = { members: [], items: [], pantry: [], expenses: [], plans: [], messages: [], hides: [], countdowns: [], nudges: [], reactions: [], loveNotes: [], counts: [], games: [], picks: [] };

// onRemoteInsert(key, row) fires when someone else adds a list item, a plan or a message,
// challenges you to a game ('games') or makes a move ('games:update').
// `online` lists who has Weee open right now (Supabase Realtime presence).
export function useHousehold(householdId, me, { onRemoteInsert } = {}) {
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [online, setOnline] = useState([]);
  const [typing, setTyping] = useState({}); // user id -> last 'typing' signal time
  const channelRef = useRef(null);
  const timers = useRef({});
  const requests = useRef({}); // newest request per table, so a slow old reply can't overwrite a newer one
  const announced = useRef(new Map()); // game id -> updated_at already announced
  const onRemoteInsertRef = useRef(onRemoteInsert);
  onRemoteInsertRef.current = onRemoteInsert;

  const refresh = useCallback(async key => {
    const t = TABLES[key];
    const ticket = (requests.current[key] || 0) + 1;
    requests.current[key] = ticket;
    let q = supabase.from(t.table).select(t.select).eq('household_id', householdId).order(t.order, { ascending: !t.desc });
    if (t.limit) q = q.limit(t.limit);
    const { data: rows, error } = await q;
    if (error || requests.current[key] !== ticket) return;
    const fresh = t.desc ? rows.reverse() : rows;
    // Games can also arrive straight from the other phone; keep whichever copy is newer.
    setData(d => ({ ...d, [key]: key === 'games' ? mergeNewer(fresh, d.games) : fresh }));
  }, [householdId]);

  const refreshAll = useCallback(async () => {
    await Promise.all(Object.keys(TABLES).map(refresh));
    setLoaded(true);
  }, [refresh]);

  // Put one row in place (newer copy wins), e.g. a move that just arrived.
  const applyRow = useCallback((key, row) => {
    const t = TABLES[key];
    setData(d => ({ ...d, [key]: upsertRow(d[key], row, { order: t.order, limit: t.limit, me }) }));
  }, [me]);

  // A game changed: tell the screen once per change, however many ways it arrived.
  const announceGame = useCallback((row, inserted) => {
    if (!row?.id || announced.current.get(row.id) === row.updated_at) return;
    announced.current.set(row.id, row.updated_at);
    if (inserted && row.created_by !== me) onRemoteInsertRef.current?.('games', row);
    else if (!inserted && row.last_actor && row.last_actor !== me) onRemoteInsertRef.current?.('games:update', row);
  }, [me]);

  useEffect(() => {
    setData(EMPTY);
    setLoaded(false);
    refreshAll();

    let channel = null;
    let closed = false;
    let retry = 0, retryTimer = 0, pollTimer = 0, hiddenAt = 0;

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
        if (key === 'messages' && row.user_id !== me) {
          onRemoteInsertRef.current?.(key, row);
          setTyping(t => ({ ...t, [row.user_id]: 0 })); // they sent it, so they stopped typing
        }
      }
      if (key === 'games' && payload.eventType !== 'DELETE') announceGame(row, payload.eventType === 'INSERT');

      if (!TABLES[key].direct) { schedule(key); return; }
      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id;
        if (id) setData(d => ({ ...d, [key]: d[key].filter(r => r.id !== id) }));
      } else if (row?.id) {
        applyRow(key, row);
      } else {
        schedule(key);
      }
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
      // A move sent straight from the other phone: the quickest way a game updates.
      ch.on('broadcast', { event: 'game' }, ({ payload }) => {
        const row = payload?.row;
        if (!row?.id || row.household_id !== householdId) return;
        applyRow('games', row);
        announceGame(row, payload.inserted);
      });
      // A tease emoji from the other player (games); shown by whichever screen cares.
      ch.on('broadcast', { event: 'emote' }, ({ payload }) => {
        if (payload?.user && payload.user !== me) window.dispatchEvent(new CustomEvent('weee:emote', { detail: payload }));
      });
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
    // After time in the background a phone's socket can look open but be dead,
    // so start over with a fresh connection instead of trusting it.
    const reconnectFresh = async () => {
      if (closed) return;
      setStatus('connecting');
      if (channel) { const old = channel; channel = null; await supabase.removeChannel(old); }
      try { await supabase.realtime.disconnect(); } catch { /* already closed */ }
      connect();
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

    // Phones suspend background apps; when Weee comes back, reconnect,
    // catch up, and show as online again. In the background, show as offline.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        if (away > 10000) reconnectFresh(); else ensureLive();
        refreshAll();
        heartbeat();
        channel?.track({ at: new Date().toISOString() });
      } else {
        if (!hiddenAt) hiddenAt = Date.now();
        channel?.untrack();
      }
    };
    const onOnline = () => { reconnectFresh(); refreshAll(); };
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
  }, [householdId, me, refresh, refreshAll, applyRow, announceGame]);

  // Optimistic local edits so taps feel instant; the refetch confirms them.
  const patch = useCallback((key, id, changes) =>
    setData(d => ({ ...d, [key]: d[key].map(r => (r.id === id ? { ...r, ...changes } : r)) })), []);
  const drop = useCallback((key, pred) =>
    setData(d => ({ ...d, [key]: d[key].filter(r => !pred(r)) })), []);
  const add = useCallback((key, row) => setData(d => ({ ...d, [key]: [...d[key], row] })), []);

  // One game, fetched on its own (cheap): used after a move and while waiting for the other player.
  const refreshGame = useCallback(async id => {
    const { data: row, error } = await supabase.from('games').select('*').eq('id', id).maybeSingle();
    if (!error && row) applyRow('games', row);
    return row || null;
  }, [applyRow]);
  // Send a saved game straight to the other phone (the database event follows as a backup).
  const sendGame = useCallback((row, inserted = false) => {
    if (row) channelRef.current?.send({ type: 'broadcast', event: 'game', payload: { row, inserted } });
  }, []);

  // Tell the others "I'm typing" (at most every 2 s); they show it for 4 s.
  const lastTyping = useRef(0);
  const sendTyping = useCallback(() => {
    if (Date.now() - lastTyping.current < 2000) return;
    lastTyping.current = Date.now();
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user: me } });
  }, [me]);

  // Send a tease emoji to the other player in a game (live only, nothing is stored).
  const sendEmote = useCallback((game, emoji) => {
    channelRef.current?.send({ type: 'broadcast', event: 'emote', payload: { user: me, game, emoji } });
  }, [me]);

  return { ...data, online, typing, sendTyping, sendEmote, loaded, status, refresh, refreshGame, sendGame, applyRow, patch, drop, add };
}
