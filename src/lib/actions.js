import { supabase } from './supabase.js';
import { guessCategory, guessDays, itemKey, parseList } from './groceries.js';
import { haptic } from './haptics.js';
import { GAMES, initialState } from './games.js';
import { squareJpeg } from './avatars.js';
import { mapsLink } from './notes.js';

const isNetwork = error => /fetch|network|timed? ?out/i.test(error?.message || '');
const retrySoon = fn => new Promise(resolve => setTimeout(resolve, 800)).then(fn);

export function friendlyError(error) {
  const msg = error?.message || '';
  if (/fetch|network/i.test(msg)) return "You're offline. Check your internet and try again.";
  if (/row-level security|permission/i.test(msg)) return "You don't have access to that household any more.";
  return msg || 'Something went wrong. Try again.';
}

// All writes the app makes. Each one refetches the table it touched so the
// screen matches the database even if the realtime message is slow.
export function makeActions({ householdId, me, hh, notify }) {
  const run = async (query, key) => {
    const { error } = await query;
    if (error) { notify(friendlyError(error)); haptic('error'); }
    if (key) hh.refresh(key);
    return !error;
  };
  const now = () => new Date().toISOString();

  const recordPurchase = (name, overrideDays = null) =>
    run(supabase.rpc('record_purchase', {
      p_household: householdId,
      p_name: name,
      p_category: guessCategory(name),
      p_default_days: guessDays(name),
      p_override_days: overrideDays,
    }), 'pantry');

  return {
    async addItems(text) {
      const added = [];
      for (const { name, qty } of parseList(text)) {
        const existing = hh.items.find(i => i.status === 'need' && itemKey(i.name) === itemKey(name));
        if (existing) {
          if (qty && qty !== existing.qty) await run(supabase.from('items').update({ qty }).eq('id', existing.id));
          notify(`${name} is already on the list`);
          continue;
        }
        added.push({ household_id: householdId, name: name.slice(0, 80), qty: qty.slice(0, 30), category: guessCategory(name) });
      }
      if (added.length && await run(supabase.from('items').insert(added))) haptic('success');
      hh.refresh('items');
    },

    async buy(item) {
      const changes = { status: 'bought', bought_by: me, bought_at: now() };
      hh.patch('items', item.id, changes);
      if (await run(supabase.from('items').update(changes).eq('id', item.id), 'items')) await recordPurchase(item.name);
    },
    unbuy(item) {
      const changes = { status: 'need', bought_by: null, bought_at: null };
      hh.patch('items', item.id, changes);
      return run(supabase.from('items').update(changes).eq('id', item.id), 'items');
    },
    toggleUrgent(item) {
      hh.patch('items', item.id, { urgent: !item.urgent });
      return run(supabase.from('items').update({ urgent: !item.urgent }).eq('id', item.id), 'items');
    },
    removeItem(item) {
      hh.drop('items', r => r.id === item.id);
      return run(supabase.from('items').delete().eq('id', item.id), 'items');
    },
    clearBought() {
      hh.drop('items', r => r.status === 'bought');
      return run(supabase.from('items').delete().eq('household_id', householdId).eq('status', 'bought'), 'items');
    },

    recordPurchase,


    async addExpense({ description, amount, category = 'other', paidBy, splitWith }) {
      const ok = await run(supabase.from('expenses').insert({ household_id: householdId, description, amount, category, paid_by: paidBy, split_with: splitWith }), 'expenses');
      if (ok) haptic('success');
      return ok;
    },
    settle({ from, to, amount }) {
      return run(supabase.from('expenses').insert({ household_id: householdId, description: 'Settled up', amount, paid_by: from, split_with: [to], is_settlement: true }), 'expenses');
    },
    removeExpense(e) {
      hh.drop('expenses', r => r.id === e.id);
      return run(supabase.from('expenses').delete().eq('id', e.id), 'expenses');
    },

    async addPlan(row) {
      const ok = await run(supabase.from('plans').insert({ household_id: householdId, ...row }), 'plans');
      if (ok) haptic('success');
      return ok;
    },
    updatePlan(id, row) {
      hh.patch('plans', id, row);
      return run(supabase.from('plans').update(row).eq('id', id), 'plans');
    },
    togglePlanDone(p) {
      const changes = p.done ? { done: false, done_at: null } : { done: true, done_at: now() };
      hh.patch('plans', p.id, changes);
      return run(supabase.from('plans').update(changes).eq('id', p.id), 'plans');
    },
    removePlan(p) {
      hh.drop('plans', r => r.id === p.id);
      return run(supabase.from('plans').delete().eq('id', p.id), 'plans');
    },

    // Love notes: thinking of you, I love you, I miss you, where are you?
    async sendNudge(kind = 'heart', noteId = null) {
      const { error } = await supabase.from('nudges').insert({ household_id: householdId, kind, note_id: noteId });
      if (error) { notify(/One heart/.test(error.message) ? 'One at a time 🙂' : friendlyError(error)); return false; }
      haptic(kind === 'where' ? 'success' : 'heartbeat');
      hh.refresh('nudges');
      hh.refresh('counts');
      return true;
    },
    // Your own notes ("Baby 🥰"), only seen inside the household.
    async addLoveNote({ emoji, text }) {
      const ok = await run(supabase.from('love_notes').insert({ household_id: householdId, emoji, text }), 'loveNotes');
      if (ok) haptic('success');
      return ok;
    },
    // Hide or bring back the built-in notes (Thinking of you, I love you…) on your own card.
    setHiddenNotes(kinds) {
      return run(supabase.from('household_members').update({ hidden_notes: kinds })
        .eq('household_id', householdId).eq('user_id', me), 'members');
    },
    removeLoveNote(note) {
      hh.drop('loveNotes', r => r.id === note.id);
      return run(supabase.from('love_notes').delete().eq('id', note.id), 'loveNotes');
    },

    // Countdowns
    async addCountdown({ title, date, yearly }) {
      const ok = await run(supabase.from('countdowns').insert({ household_id: householdId, title, date, yearly }), 'countdowns');
      if (ok) haptic('success');
      return ok;
    },
    removeCountdown(c) {
      hh.drop('countdowns', r => r.id === c.id);
      return run(supabase.from('countdowns').delete().eq('id', c.id), 'countdowns');
    },

    // Games
    // Start a game against your partner; if one of this kind is already going, open that instead.
    async startGame(kind, opponent) {
      const row = { household_id: householdId, kind, opponent, turn: GAMES[kind].turns ? opponent : null, state: initialState(kind) };
      const { data, error } = await supabase.from('games').insert(row).select().single();
      if (!error) { hh.applyRow('games', data); hh.sendGame(data, true); haptic('success'); return data; }
      hh.refresh('games');
      if (error.code === '23505') {
        const { data: existing } = await supabase.from('games').select('*')
          .eq('household_id', householdId).eq('kind', kind).eq('status', 'active').maybeSingle();
        if (existing) return existing;
      }
      notify(friendlyError(error));
      return null;
    },
    // A move in a turn-based game (only allowed on your turn): shown at once, saved,
    // then sent straight to the other phone so it updates without waiting.
    async playMove(g, changes) {
      hh.patch('games', g.id, { ...changes, last_actor: me });
      const save = () => supabase.from('games').update(changes).eq('id', g.id).select().maybeSingle();
      let { data, error } = await save();
      if (error && isNetwork(error)) ({ data, error } = await retrySoon(save));
      if (error || !data) {
        notify(error ? friendlyError(error) : "That move didn't go through. It may not be your turn any more.");
        haptic('error');
        hh.refreshGame(g.id);
        return false;
      }
      hh.applyRow('games', data);
      hh.sendGame(data);
      return true;
    },
    // A hidden pick (Rock Paper Scissors and the question games). If it completes the
    // round, the database reveals it; we fetch that and pass it straight on.
    async pick(g, value) {
      hh.add('picks', { game_id: g.id, round: g.round, pick: value });
      hh.patch('games', g.id, { state: { ...g.state, picked: [...(g.state?.picked || []), me] } });
      const save = () => supabase.from('game_picks').insert({ game_id: g.id, household_id: householdId, round: g.round, pick: value });
      let { error } = await save();
      if (error && isNetwork(error)) ({ error } = await retrySoon(save));
      if (error && error.code !== '23505') { // 23505: this pick was already saved (a retry that had gone through)
        notify(friendlyError(error));
        haptic('error');
        hh.refreshGame(g.id);
        hh.refresh('picks');
        return false;
      }
      haptic('select');
      hh.sendGame(await hh.refreshGame(g.id));
      hh.refresh('picks');
      return true;
    },
    // Clear finished games from your own Recent list (your partner still sees them).
    hideGames(ids) {
      for (const id of ids) {
        const g = hh.games.find(x => x.id === id);
        if (g) hh.patch('games', id, { hidden_by: [...(g.hidden_by || []), me] });
      }
      return run(supabase.rpc('hide_games', { p_games: ids }), 'games');
    },
    async endGame(g) {
      const ok = await run(supabase.rpc('end_game', { p_game: g.id }));
      if (ok) hh.sendGame(await hh.refreshGame(g.id));
      return ok;
    },
    // Tell the database which game is open on this phone, so moves don't send a push you'd see anyway.
    watchGame(gameId) {
      return supabase.from('household_members')
        .update({ watching_game: gameId, watching_at: gameId ? now() : null })
        .eq('household_id', householdId).eq('user_id', me).then(() => {});
    },

    // Chat
    async sendMessage(body, replyTo = null) {
      const text = body.trim().slice(0, 2000);
      if (!text) return false;
      const temp = { id: `tmp-${Date.now()}`, household_id: householdId, user_id: me, body: text, reply_to: replyTo, created_at: now(), pending: true };
      hh.add('messages', temp);
      const ok = await run(supabase.from('messages').insert({ household_id: householdId, body: text, reply_to: replyTo }), 'messages');
      if (ok) haptic('light');
      return ok;
    },
    // Answer "where are you?" with a one-off map link (no tracking).
    async shareLocation() {
      if (!navigator.geolocation) { notify("This phone can't share its location."); return false; }
      const pos = await new Promise(resolve => navigator.geolocation.getCurrentPosition(resolve, () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }));
      if (!pos) { notify('Could not get your location. Allow location for Weee and try again.'); return false; }
      return this.sendMessage(`📍 I'm here: ${mapsLink(pos.coords.latitude, pos.coords.longitude)}`);
    },
    // One reaction per person per message: same emoji again removes it.
    async react(m, emoji) {
      const mine = hh.reactions.find(r => r.message_id === m.id && r.user_id === me);
      hh.drop('reactions', r => r.message_id === m.id && r.user_id === me);
      if (mine?.emoji === emoji) {
        return run(supabase.from('message_reactions').delete().eq('message_id', m.id).eq('user_id', me), 'reactions');
      }
      hh.add('reactions', { message_id: m.id, user_id: me, emoji });
      haptic('select');
      return run(supabase.from('message_reactions')
        .upsert({ message_id: m.id, user_id: me, household_id: householdId, emoji }, { onConflict: 'message_id,user_id' }), 'reactions');
    },
    pinMessage(m, on) {
      const changes = on ? { pinned_at: now(), pinned_by: me } : { pinned_at: null, pinned_by: null };
      hh.patch('messages', m.id, changes);
      if (on) haptic('success');
      return run(supabase.from('messages').update(changes).eq('id', m.id), 'messages');
    },
    unsendMessage(m) {
      hh.drop('messages', r => r.id === m.id);
      return run(supabase.from('messages').delete().eq('id', m.id), 'messages');
    },
    hideMessage(m) {
      hh.add('hides', { message_id: m.id });
      return run(supabase.from('message_hides').insert({ message_id: m.id, household_id: householdId }), 'hides');
    },
    async clearChat() {
      const at = now();
      const ok = await run(supabase.from('household_members').update({ chat_cleared_at: at, chat_read_at: at })
        .eq('household_id', householdId).eq('user_id', me), 'members');
      if (ok) haptic('success');
      return ok;
    },
    markChatRead() {
      return supabase.from('household_members').update({ chat_read_at: now() })
        .eq('household_id', householdId).eq('user_id', me).then(() => hh.refresh('members'));
    },

    // Profile photo: upload a new one, then point my membership at it.
    async setAvatar(file) {
      try {
        const blob = await squareJpeg(file);
        const path = `${me}/${Date.now()}.jpg`;
        const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) { notify(friendlyError(error)); return false; }
        const old = hh.members.find(m => m.user_id === me)?.avatar_path;
        const ok = await run(supabase.from('household_members').update({ avatar_path: path })
          .eq('household_id', householdId).eq('user_id', me), 'members');
        if (ok && old) supabase.storage.from('avatars').remove([old]);
        if (ok) haptic('success');
        return ok;
      } catch (e) {
        notify(e.message || 'Could not use that photo.');
        return false;
      }
    },
    async removeAvatar() {
      const old = hh.members.find(m => m.user_id === me)?.avatar_path;
      const ok = await run(supabase.from('household_members').update({ avatar_path: null })
        .eq('household_id', householdId).eq('user_id', me), 'members');
      if (ok && old) await supabase.storage.from('avatars').remove([old]);
      return ok;
    },
    setTogetherSince(date) {
      return run(supabase.from('households').update({ together_since: date || null }).eq('id', householdId));
    },

    renameMe(displayName) {
      return run(supabase.from('household_members').update({ display_name: displayName }).eq('household_id', householdId).eq('user_id', me), 'members');
    },
    renameHousehold(name) {
      return run(supabase.from('households').update({ name }).eq('id', householdId));
    },
    async deleteAccount() {
      const photo = hh.members.find(m => m.user_id === me)?.avatar_path;
      if (photo) await supabase.storage.from('avatars').remove([photo]);
      const { error } = await supabase.rpc('delete_my_account');
      if (error) { notify(friendlyError(error)); return false; }
      await supabase.auth.signOut({ scope: 'local' });
      return true;
    },
    leave() {
      return run(supabase.from('household_members').delete().eq('household_id', householdId).eq('user_id', me));
    },
  };
}
