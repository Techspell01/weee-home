import { supabase } from './supabase.js';
import { guessCategory, guessDays, itemKey, parseList } from './groceries.js';

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
    if (error) notify(friendlyError(error));
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
      if (added.length) await run(supabase.from('items').insert(added));
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
    setLastsDays(p, days) {
      const v = Math.min(365, Math.max(1, days));
      hh.patch('pantry', p.id, { lasts_days: v });
      return run(supabase.from('pantry').update({ lasts_days: v }).eq('id', p.id), 'pantry');
    },
    untrack(p) {
      hh.drop('pantry', r => r.id === p.id);
      return run(supabase.from('pantry').delete().eq('id', p.id), 'pantry');
    },


    addExpense({ description, amount, category = 'other', paidBy, splitWith }) {
      return run(supabase.from('expenses').insert({ household_id: householdId, description, amount, category, paid_by: paidBy, split_with: splitWith }), 'expenses');
    },
    settle({ from, to, amount }) {
      return run(supabase.from('expenses').insert({ household_id: householdId, description: 'Settled up', amount, paid_by: from, split_with: [to], is_settlement: true }), 'expenses');
    },
    removeExpense(e) {
      hh.drop('expenses', r => r.id === e.id);
      return run(supabase.from('expenses').delete().eq('id', e.id), 'expenses');
    },

    addPlan(row) {
      return run(supabase.from('plans').insert({ household_id: householdId, ...row }), 'plans');
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
