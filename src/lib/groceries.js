// Item knowledge: categories, how long things usually last, and parsing of
// typed lists like "2 kg rice, milk, 6 eggs".

export const DAY = 86400000;

const CATEGORIES = [
  ['veg', 'Vegetables & fruit', ['tomato', 'onion', 'potato', 'carrot', 'beans', 'spinach', 'palak', 'banana', 'apple', 'mango', 'lemon', 'ginger', 'garlic', 'chilli', 'coriander', 'curry leaves', 'cucumber', 'brinjal', 'cabbage', 'cauliflower', 'peas', 'okra', 'bhindi', 'fruit', 'vegetable', 'coconut', 'grapes', 'orange', 'methi', 'mint']],
  ['dairy', 'Dairy & eggs', ['milk', 'curd', 'yogurt', 'dahi', 'paneer', 'butter', 'ghee', 'cheese', 'cream', 'egg']],
  ['staples', 'Staples & grains', ['rice', 'atta', 'flour', 'maida', 'dal', 'sugar', 'salt', 'oil', 'rava', 'sooji', 'poha', 'oats', 'bread', 'pasta', 'noodles', 'besan', 'toor', 'moong', 'chana', 'rajma', 'masala', 'tea', 'coffee', 'jaggery', 'spice', 'turmeric', 'jeera', 'mustard']],
  ['snacks', 'Snacks & drinks', ['biscuit', 'chips', 'juice', 'chocolate', 'namkeen', 'soda', 'cookie', 'snack', 'cake', 'ice cream']],
  ['home', 'Household', ['detergent', 'soap', 'dishwash', 'vim', 'surf', 'cleaner', 'phenyl', 'tissue', 'garbage', 'bags', 'bulb', 'battery', 'foil', 'broom', 'mop', 'harpic', 'lizol']],
  ['care', 'Personal care', ['shampoo', 'toothpaste', 'toothbrush', 'face wash', 'razor', 'sanitary', 'deodorant', 'lotion', 'medicine', 'tablet']],
];

export const CATEGORY_NAMES = Object.fromEntries([...CATEGORIES.map(([k, label]) => [k, label]), ['other', 'Other']]);
export const CATEGORY_ORDER = ['veg', 'dairy', 'staples', 'snacks', 'home', 'care', 'other'];

export function guessCategory(name) {
  const n = name.toLowerCase();
  for (const [key, , words] of CATEGORIES) if (words.some(w => n.includes(w))) return key;
  return 'other';
}

const USUALLY_LASTS = [['milk', 2], ['curd', 3], ['bread', 4], ['egg', 7], ['banana', 5], ['tomato', 5], ['onion', 10], ['potato', 12], ['paneer', 5], ['rice', 30], ['atta', 25], ['dal', 30], ['oil', 30], ['sugar', 30], ['salt', 90], ['tea', 30], ['coffee', 30], ['detergent', 30], ['dishwash', 20], ['toothpaste', 45], ['shampoo', 45], ['soap', 25]];
const CATEGORY_LASTS = { veg: 6, dairy: 4, staples: 30, snacks: 10, home: 30, care: 40, other: 14 };

// First guess at how many days one purchase lasts; the database replaces it
// with the household's real rhythm after three purchases.
export function guessDays(name) {
  const n = name.toLowerCase();
  for (const [word, days] of USUALLY_LASTS) if (n.includes(word)) return days;
  return CATEGORY_LASTS[guessCategory(name)];
}

// Same normalisation as pantry.key in record_purchase().
export const itemKey = name => name.trim().replace(/\s+/g, ' ').toLowerCase();

const UNIT = 'kgs?|g|gms?|grams?|l|ltrs?|litres?|liters?|ml|pcs?|pieces?|dozen|doz|packets?|pkts?|bottles?|packs?|box(?:es)?|bunch(?:es)?|nos?';
const QTY_FIRST = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${UNIT})?\\.?\\s+(.+)$`, 'i');
const QTY_LAST = new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNIT})?\\.?$`, 'i');

export function parseItem(text) {
  const s = text.trim().replace(/\s+/g, ' ');
  let name = s, qty = '', m;
  if ((m = s.match(QTY_FIRST))) { name = m[3]; qty = m[1] + (m[2] ? ' ' + m[2].toLowerCase() : ''); }
  else if ((m = s.match(QTY_LAST))) { name = m[1]; qty = m[2] + (m[3] ? ' ' + m[3].toLowerCase() : ''); }
  name = name.trim();
  return { name: name.charAt(0).toUpperCase() + name.slice(1), qty };
}

export function parseList(text) {
  return text.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean).map(parseItem).filter(i => i.name);
}

// How much of a pantry item is probably left, from when it was bought and how long it lasts.
export function stockLevel(p, now = Date.now()) {
  if (!p.last_bought) return { left: null, label: 'Not bought yet', tone: 'mid' };
  const left = 1 - (now - Date.parse(p.last_bought)) / ((p.lasts_days || 14) * DAY);
  if (left <= 0) return { left: 0, label: 'Probably finished', tone: 'out' };
  if (left < 0.25) return { left, label: 'Only a few left', tone: 'low' };
  if (left < 0.5) return { left, label: 'Half used', tone: 'mid' };
  return { left, label: 'Stocked', tone: 'ok' };
}

export const isRunningLow = (p, now) => { const s = stockLevel(p, now); return s.left !== null && s.left < 0.25; };
