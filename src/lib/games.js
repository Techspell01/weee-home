// Games for two: the rules live here so both phones agree on every move.

export const GAMES = {
  tictactoe: { name: 'Tic Tac Toe', blurb: 'Three in a row. Quick and classic.', turns: true },
  connect4: { name: 'Four in a Row', blurb: 'Drop discs and line up four.', turns: true },
  rps: { name: 'Rock Paper Scissors', blurb: 'First to three. Picks stay hidden.', turns: false },
  thisorthat: { name: 'This or That', blurb: 'Ten questions. How often do you match?', turns: false },
};
export const GAME_ORDER = ['tictactoe', 'connect4', 'rps', 'thisorthat'];

export const opponentOf = (g, me) => (g.created_by === me ? g.opponent : g.created_by);
// The person who was challenged moves first (seat 1); the challenger is seat 2.
export const seatOf = (g, userId) => (userId === g.opponent ? 1 : 2);
export const userAtSeat = (g, seat) => (seat === 1 ? g.opponent : g.created_by);

export function initialState(kind, rand = Math.random) {
  if (kind === 'tictactoe') return { cells: Array(9).fill(0) };
  if (kind === 'connect4') return { cells: Array(C4_COLS * C4_ROWS).fill(0) };
  if (kind === 'rps') return { target: 3, rounds: [], score: {}, picked: [] };
  return { questions: pickQuestions(10, rand), rounds: [], matches: 0, picked: [] };
}

// ---------- Tic Tac Toe ----------
export const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

// { seat, line } for a win, { draw: true } for a full board, otherwise null.
export function tttResult(cells) {
  for (const line of TTT_LINES) {
    const [a, b, c] = line;
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return { seat: cells[a], line };
  }
  return cells.every(Boolean) ? { draw: true } : null;
}

// ---------- Four in a Row: cells[row * 7 + col], row 0 at the top ----------
export const C4_COLS = 7;
export const C4_ROWS = 6;

// The cell a disc dropped in this column lands in, or -1 if the column is full.
export function c4Drop(cells, col) {
  for (let row = C4_ROWS - 1; row >= 0; row--) {
    const i = row * C4_COLS + col;
    if (!cells[i]) return i;
  }
  return -1;
}

// Did the disc just placed at index i make four? { seat, line } | { draw } | null
export function c4Result(cells, i) {
  const seat = cells[i];
  if (seat) {
    const row = Math.floor(i / C4_COLS), col = i % C4_COLS;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const line = [i];
      for (const dir of [1, -1]) {
        for (let k = 1; k < 4; k++) {
          const r = row + dr * k * dir, c = col + dc * k * dir;
          if (r < 0 || r >= C4_ROWS || c < 0 || c >= C4_COLS || cells[r * C4_COLS + c] !== seat) break;
          line.push(r * C4_COLS + c);
        }
      }
      if (line.length >= 4) return { seat, line: line.sort((a, b) => a - b) };
    }
  }
  return cells.every(Boolean) ? { draw: true } : null;
}

// The update to save after placing a disc or mark for `me`.
export function turnMove(g, me, cells, placed, result) {
  return {
    state: { ...g.state, cells, last: placed, line: result?.line || null },
    turn: result ? null : opponentOf(g, me),
    status: result ? 'done' : 'active',
    winner: result?.seat ? userAtSeat(g, result.seat) : null,
  };
}

// ---------- Rock Paper Scissors ----------
export const RPS = { rock: { emoji: '✊', label: 'Rock' }, paper: { emoji: '✋', label: 'Paper' }, scissors: { emoji: '✌️', label: 'Scissors' } };
// 1 if a beats b, -1 if b beats a, 0 for the same pick.
export function rpsOutcome(a, b) {
  if (a === b) return 0;
  return (a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock') ? 1 : -1;
}

// ---------- This or That ----------
export const QUESTIONS = [
  ['Beach 🏖️', 'Mountains 🏔️'], ['Coffee ☕', 'Tea 🍵'], ['Movie night 🎬', 'Night out 🌃'], ['Sunrise 🌅', 'Sunset 🌇'],
  ['Cats 🐱', 'Dogs 🐶'], ['Pizza 🍕', 'Biryani 🍛'], ['Texting 💬', 'Calling 📞'], ['Early bird 🐦', 'Night owl 🦉'],
  ['Road trip 🚗', 'Flight ✈️'], ['Sweet 🍫', 'Spicy 🌶️'], ['Rain 🌧️', 'Sunshine ☀️'], ['Books 📚', 'Series 📺'],
  ['Cook at home 🍳', 'Eat out 🍽️'], ['Plan everything 🗓️', 'Go with the flow 🌊'], ['Big wedding 💒', 'Small wedding 💍'],
  ['City life 🏙️', 'Quiet village 🌾'], ['Ice cream 🍦', 'Cake 🍰'], ['Gifts 🎁', 'Surprises ✨'], ['Hugs 🤗', 'Kisses 💋'],
  ['Summer 🌞', 'Winter ❄️'], ['Window seat 🪟', 'Aisle seat 🚶'], ['Chocolate 🍫', 'Vanilla 🍨'], ['Dance 💃', 'Sing 🎤'],
  ['Photos 📸', 'Videos 🎥'], ['Long drive 🛣️', 'Long talk 🗣️'], ['Breakfast in bed 🥐', 'Candlelight dinner 🕯️'],
  ['Stay in 🛋️', 'Go out 🎉'], ['Love letters 💌', 'Voice notes 🎙️'], ['Say sorry first 🙏', 'Wait it out ⏳'],
  ['Netflix 🍿', 'YouTube ▶️'], ['Porotta & beef 🥘', 'Dosa & chutney 🫓'], ['Matching outfits 👕', 'Never 🙈'],
  ['Trek 🥾', 'Resort 🏝️'], ['Shopping 🛍️', 'Window shopping 👀'], ['Morning cuddles ☀️', 'Late-night talks 🌙'],
  ['Board games 🎲', 'Video games 🎮'], ['Old songs 📻', 'New songs 🎧'], ['Tidy 🧹', 'Cosy mess 🧺'],
  ['Save it 💰', 'Spend it 💸'], ['Sea food 🦐', 'Veg thali 🥗'],
];

export function pickQuestions(n = 10, rand = Math.random) {
  const pool = QUESTIONS.map((q, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).map(i => QUESTIONS[i]);
}

// ---------- where things stand ----------
// 'your-move' | 'their-move' | 'done'
export function gameStatus(g, me) {
  if (g.status === 'done') return 'done';
  if (GAMES[g.kind]?.turns) return g.turn === me ? 'your-move' : 'their-move';
  return (g.state?.picked || []).includes(me) ? 'their-move' : 'your-move';
}

// Wins for each of you and draws, across finished games (This or That has no winner).
export function scoreboard(games, me) {
  const out = { me: 0, them: 0, draws: 0, played: 0 };
  for (const g of games) {
    if (g.status !== 'done' || g.kind === 'thisorthat') continue;
    out.played++;
    if (!g.winner) out.draws++;
    else if (g.winner === me) out.me++;
    else out.them++;
  }
  return out;
}
