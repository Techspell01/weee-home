import { supabase } from './supabase.js';
import { guessCategory, guessDays, itemKey, parseList } from './groceries.js';
import { haptic } from './haptics.js';
import { nextRepeat } from './tracker.js';

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
  const updateTracker = (id, changes) => {
    hh.patch('trackers', id, changes);
    return run(supabase.from('trackers').update(changes).eq('id', id), 'trackers');
  };

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

    // "Thinking of you"
    async sendNudge() {
      const { error } = await supabase.from('nudges').insert({ household_id: householdId });
      if (error) { if (!/One heart/.test(error.message)) notify(friendlyError(error)); return false; }
      haptic('heartbeat');
      hh.refresh('nudges');
      return true;
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

    // Follow-up tracker
    async addTracker(row) {
      const ok = await run(supabase.from('trackers').insert({ household_id: householdId, ...row }), 'trackers');
      if (ok) haptic('success');
      return ok;
    },
    updateTracker,
    async followedUp(t, note = '') {
      const at = now();
      const log = [{ at, note: note.trim().slice(0, 200) }, ...(Array.isArray(t.log) ? t.log : [])].slice(0, 20);
      const changes = {
        followups: (t.followups || 0) + 1,
        last_followup_at: at,
        log,
        next_at: nextRepeat(t),
        stage: t.kind === 'job' && (!t.stage || t.stage === 'applied') ? 'followed_up' : t.stage,
      };
      const ok = await updateTracker(t.id, changes);
      if (ok) haptic('success');
      return ok;
    },
    snoozeTracker(t, at) {
      return updateTracker(t.id, { next_at: at.toISOString() });
    },
    removeTracker(t) {
      hh.drop('trackers', r => r.id === t.id);
      return run(supabase.from('trackers').delete().eq('id', t.id), 'trackers');
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

    renameMe(displayName) {
      return run(supabase.from('household_members').update({ display_name: displayName }).eq('household_id', householdId).eq('user_id', me), 'members');
    },
    renameHousehold(name) {
      return run(supabase.from('households').update({ name }).eq('id', householdId));
    },
    async deleteAccount() {
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
