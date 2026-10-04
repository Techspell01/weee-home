// Equal-split balances, the fewest payments that settle them, and spending by category.

export const SPEND_CATEGORIES = {
  groceries: 'Groceries',
  outing: 'Outings & food',
  rent: 'Rent',
  bills: 'Bills',
  travel: 'Travel',
  shopping: 'Shopping',
  health: 'Health',
  other: 'Other',
};

const CATEGORY_WORDS = [
  ['rent', ['rent']],
  ['bills', ['electric', 'current bill', 'wifi', 'wi-fi', 'internet', 'broadband', 'water', 'gas', 'cylinder', 'mobile', 'recharge', 'maid', 'bill', 'maintenance']],
  ['groceries', ['grocer', 'vegetable', 'milk', 'supermarket', 'dmart', 'bigbasket', 'blinkit', 'zepto', 'instamart', 'kirana']],
  ['outing', ['cafe', 'café', 'coffee', 'dinner', 'lunch', 'breakfast', 'restaurant', 'movie', 'date', 'outing', 'swiggy', 'zomato', 'pizza', 'party']],
  ['travel', ['petrol', 'diesel', 'fuel', 'uber', 'ola', 'rapido', 'auto', 'cab', 'taxi', 'train', 'flight', 'bus', 'metro', 'trip', 'hotel']],
  ['shopping', ['amazon', 'flipkart', 'myntra', 'clothes', 'shoes', 'dress', 'gift']],
  ['health', ['medicine', 'pharmacy', 'doctor', 'hospital', 'clinic', 'gym']],
];

export function guessExpenseCategory(description) {
  const d = description.toLowerCase();
  for (const [cat, words] of CATEGORY_WORDS) if (words.some(w => d.includes(w))) return cat;
  return 'other';
}

export function netBalances(expenses) {
  const net = {};
  for (const e of expenses) {
    if (!e.paid_by) continue; // payer deleted their account
    const amount = Number(e.amount);
    const split = e.split_with?.length ? e.split_with : [e.paid_by];
    const share = amount / split.length;
    net[e.paid_by] = (net[e.paid_by] || 0) + amount;
    for (const id of split) net[id] = (net[id] || 0) - share;
  }
  return net;
}

// memberIds, when given, hides balances with people who have left or deleted their account.
export function settlements(expenses, memberIds) {
  const net = netBalances(expenses);
  const debtors = Object.entries(net).filter(([, v]) => v < -0.005).map(([id, v]) => [id, -v]).sort((a, b) => b[1] - a[1]);
  const creditors = Object.entries(net).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i][1], creditors[j][1]);
    if (amt >= 0.01) out.push({ from: debtors[i][0], to: creditors[j][0], amount: Math.round(amt * 100) / 100 });
    debtors[i][1] -= amt;
    creditors[j][1] -= amt;
    if (debtors[i][1] < 0.005) i++;
    if (creditors[j][1] < 0.005) j++;
  }
  return memberIds ? out.filter(o => memberIds.includes(o.from) && memberIds.includes(o.to)) : out;
}

// "2026-10" for the month an expense was added, in local time.
export const monthKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const shiftMonth = (key, by) => { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + by, 1)); };
export const monthLabel = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };

// Household spending for one month, by category and by who paid. Settle-ups are not spending.
export function spending(expenses, month) {
  const byCategory = {}, byPayer = {};
  let total = 0;
  for (const e of expenses) {
    if (e.is_settlement || monthKey(e.created_at) !== month) continue;
    const amount = Number(e.amount);
    const cat = e.category || 'other';
    byCategory[cat] = (byCategory[cat] || 0) + amount;
    if (e.paid_by) byPayer[e.paid_by] = (byPayer[e.paid_by] || 0) + amount;
    total += amount;
  }
  const categories = Object.entries(byCategory).map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount);
  return { total: Math.round(total * 100) / 100, categories, byPayer };
}

export const rupees = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
