import { describe, expect, it } from 'vitest';
import { DAY, guessCategory, guessDays, itemKey, parseItem, parseList, stockLevel } from './groceries.js';
import { guessExpenseCategory, netBalances, settlements, shiftMonth, spending } from './money.js';

describe('parsing typed lists', () => {
  it('reads quantities before or after the name', () => {
    expect(parseItem('2 kg rice')).toEqual({ name: 'Rice', qty: '2 kg' });
    expect(parseItem('2kg rice')).toEqual({ name: 'Rice', qty: '2 kg' });
    expect(parseItem('6 eggs')).toEqual({ name: 'Eggs', qty: '6' });
    expect(parseItem('milk 1 L')).toEqual({ name: 'Milk', qty: '1 l' });
    expect(parseItem('coriander')).toEqual({ name: 'Coriander', qty: '' });
  });
  it('splits on commas, semicolons and new lines', () => {
    expect(parseList('2 kg rice, milk;\n6 eggs, ,').map(i => i.name)).toEqual(['Rice', 'Milk', 'Eggs']);
  });
  it('normalises keys the same way as the database', () => {
    expect(itemKey('  Basmati   Rice ')).toBe('basmati rice');
  });
});

describe('item knowledge', () => {
  it('guesses categories and shelf life', () => {
    expect(guessCategory('Tomatoes')).toBe('veg');
    expect(guessCategory('Amul milk')).toBe('dairy');
    expect(guessCategory('Mystery thing')).toBe('other');
    expect(guessDays('Milk')).toBe(2);
    expect(guessDays('Sona masoori rice')).toBe(30);
  });
});

describe('stock levels', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const bought = daysAgo => new Date(now - daysAgo * DAY).toISOString();
  it('moves from stocked to only a few left to finished', () => {
    expect(stockLevel({ last_bought: bought(1), lasts_days: 10 }, now).label).toBe('Stocked');
    expect(stockLevel({ last_bought: bought(6), lasts_days: 10 }, now).label).toBe('Half used');
    expect(stockLevel({ last_bought: bought(8), lasts_days: 10 }, now).label).toBe('Only a few left');
    expect(stockLevel({ last_bought: bought(11), lasts_days: 10 }, now).label).toBe('Probably finished');
    expect(stockLevel({ last_bought: null, lasts_days: 10 }, now).left).toBeNull();
  });
});

describe('splits', () => {
  it('splits rent equally and settles with one payment', () => {
    const exp = [{ amount: 18000, paid_by: 'a', split_with: ['a', 'b'] }];
    expect(netBalances(exp)).toEqual({ a: 9000, b: -9000 });
    expect(settlements(exp)).toEqual([{ from: 'b', to: 'a', amount: 9000 }]);
  });
  it('nets several expenses and settlements to zero', () => {
    const exp = [
      { amount: 18000, paid_by: 'a', split_with: ['a', 'b'] },
      { amount: 3000, paid_by: 'b', split_with: ['a', 'b'] },
      { amount: 7500, paid_by: 'b', split_with: ['a'], is_settlement: true },
    ];
    expect(settlements(exp)).toEqual([]);
  });
  it('handles three roommates', () => {
    const exp = [{ amount: 300, paid_by: 'a', split_with: ['a', 'b', 'c'] }];
    expect(settlements(exp)).toEqual([{ from: 'b', to: 'a', amount: 100 }, { from: 'c', to: 'a', amount: 100 }]);
  });
});

describe('spending', () => {
  const exp = [
    { amount: 18000, paid_by: 'a', split_with: ['a', 'b'], category: 'rent', created_at: '2026-10-01T10:00:00' },
    { amount: 1250, paid_by: 'b', split_with: ['a', 'b'], category: 'groceries', created_at: '2026-10-03T10:00:00' },
    { amount: 750, paid_by: 'a', split_with: ['a', 'b'], category: 'groceries', created_at: '2026-10-04T10:00:00' },
    { amount: 900, paid_by: 'a', split_with: ['a', 'b'], category: 'outing', created_at: '2026-09-28T10:00:00' },
    { amount: 8000, paid_by: 'b', split_with: ['a'], is_settlement: true, category: 'other', created_at: '2026-10-04T10:00:00' },
  ];
  it('totals one month by category, ignoring settle-ups and other months', () => {
    const s = spending(exp, '2026-10');
    expect(s.total).toBe(20000);
    expect(s.categories).toEqual([{ key: 'rent', amount: 18000 }, { key: 'groceries', amount: 2000 }]);
    expect(s.byPayer).toEqual({ a: 18750, b: 1250 });
  });
  it('moves between months', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('guesses categories from the description', () => {
    expect(guessExpenseCategory('October rent')).toBe('rent');
    expect(guessExpenseCategory('Electricity bill')).toBe('bills');
    expect(guessExpenseCategory('Dinner at Toit')).toBe('outing');
    expect(guessExpenseCategory('DMart run')).toBe('groceries');
    expect(guessExpenseCategory('Something')).toBe('other');
  });
  it('hides balances with people who left', () => {
    const e = [{ amount: 300, paid_by: 'a', split_with: ['a', 'b', 'gone'] }];
    expect(settlements(e, ['a', 'b'])).toEqual([{ from: 'b', to: 'a', amount: 100 }]);
  });
});

