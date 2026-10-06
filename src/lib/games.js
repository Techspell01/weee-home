// Games for two: the rules live here so both phones agree on every move.

export const GAMES = {
  tictactoe: { name: 'Tic Tac Toe', blurb: 'Three in a row. Quick and classic.', turns: true, group: 'play' },
  connect4: { name: 'Four in a Row', blurb: 'Drop discs and line up four.', turns: true, group: 'play' },
  memory: { name: 'Memory Match', blurb: 'Flip cards and find the pairs.', turns: true, group: 'play' },
  rps: { name: 'Rock Paper Scissors', blurb: 'First to ten. Picks stay hidden.', turns: false, group: 'play' },
  thisorthat: { name: 'This or That', blurb: 'Ten questions. How often do you match?', turns: false, group: 'us' },
  mostlikely: { name: "Who's More Likely To", blurb: 'Point at each other. Secretly.', turns: false, group: 'us' },
  knowme: { name: 'How Well Do You Know Me', blurb: 'Answer about you, guess about them.', turns: false, group: 'us' },
  truthordare: { name: 'Truth or Dare', blurb: 'Sweet, silly and a little brave.', turns: true, group: 'us' },
};
export const GAME_ORDER = ['tictactoe', 'connect4', 'memory', 'rps', 'thisorthat', 'mostlikely', 'knowme', 'truthordare'];
// Games with a winner (they count on the scoreboard).
export const COMPETITIVE = ['tictactoe', 'connect4', 'memory', 'rps'];
// Hidden "a or b" question games, revealed round by round.
export const QUIZZES = ['thisorthat', 'mostlikely', 'knowme'];

export const opponentOf = (g, me) => (g.created_by === me ? g.opponent : g.created_by);
// The person who was challenged moves first (seat 1); the challenger is seat 2.
export const seatOf = (g, userId) => (userId === g.opponent ? 1 : 2);
export const userAtSeat = (g, seat) => (seat === 1 ? g.opponent : g.created_by);

export function initialState(kind, rand = Math.random) {
  if (kind === 'tictactoe') return { cells: Array(9).fill(0) };
  if (kind === 'connect4') return { cells: Array(C4_COLS * C4_ROWS).fill(0) };
  if (kind === 'rps') return { target: 10, rounds: [], score: {}, picked: [] };
  if (kind === 'memory') return { cards: memoryDeck(rand), owners: Array(16).fill(0), flipped: [], reveal: null, revealAt: null };
  if (kind === 'truthordare') return { card: null, log: [], used: [] };
  if (kind === 'mostlikely') return { questions: pickFrom(MOST_LIKELY, 10, rand), rounds: [], matches: 0, picked: [] };
  if (kind === 'knowme') return { questions: pickFrom(KNOW_ME, 10, rand), rounds: [], matches: 0, picked: [] };
  return { questions: pickQuestions(10, rand), rounds: [], matches: 0, picked: [] };
}

function shuffle(list, rand = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export const pickFrom = (bank, n, rand = Math.random) => shuffle(bank, rand).slice(0, n);

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

export const pickQuestions = (n = 10, rand = Math.random) => pickFrom(QUESTIONS, n, rand);

// ---------- Who's More Likely To: 'a' is the challenger, 'b' the one challenged ----------
export const MOST_LIKELY = [
  'fall asleep during a movie 😴', 'forget an anniversary 🙈', 'cry at a sad movie 😭', 'eat the last slice 🍕',
  'get lost with Google Maps open 🗺️', 'start a fight over nothing 😤', 'say sorry first 🙏', 'spend too much shopping 🛍️',
  'laugh at their own joke 😂', 'plan a surprise 🎁', 'steal the blanket 🛌', 'be late 🏃',
  'talk to strangers 🗣️', 'become famous 🌟', 'survive a zombie apocalypse 🧟', 'burn the food 🔥',
  'fall for a prank 🤡', "reply 'k' when annoyed 😑", 'dance in public 💃', 'cry when happy 🥹',
  'binge a whole series in one night 📺', 'forget where they parked 🚗', 'get hangry 🍔', 'sing in the shower 🚿',
  'adopt a pet without asking 🐶', 'wake up first ☀️', 'make the first move 💋', 'get jealous 😒',
  'remember every little date 📅', 'take 100 selfies for one photo 🤳', 'order the same dish every time 🍛', 'win an argument 🏆',
];
export const likelyUser = (g, pick) => (pick === 'a' ? g.created_by : g.opponent);
export const likelyPick = (g, userId) => (userId === g.created_by ? 'a' : 'b');

// ---------- How Well Do You Know Me: odd questions are about the one challenged, even ones about the challenger ----------
export const KNOW_ME = [
  ['Sleep in 😴', 'Up early ⏰'], ['Sweet tooth 🍬', 'Salty snacks 🥨'], ['Cry at movies 😭', 'Never cry 😎'], ['Lose my keys 🔑', 'Lose my phone 📱'],
  ['Morning shower 🚿', 'Night shower 🌙'], ['Lazy Sunday 🛋️', 'Busy Sunday 🚗'], ['Maggi 🍜', 'Biryani 🍛'], ['Call 📞', 'Text 💬'],
  ['Europe 🗼', 'Maldives 🏝️'], ['Spiders 🕷️', 'Heights 🧗'], ['Go quiet 🤐', 'Talk it out 🗣️'], ['Flowers 💐', 'Chocolates 🍫'],
  ['Dance at parties 💃', 'Eat at parties 🍕'], ['Battery full 🔋', 'Battery dying 🪫'], ['Cook 🍳', 'Wash dishes 🧽'], ['Scream 😱', 'Happy tears 🥹'],
  ['Horror movies 👻', 'Rom-coms 💘'], ['Window shopping 👀', 'Online shopping 📦'], ['Mountains 🏔️', 'Beach 🏖️'], ['Gold 💛', 'Silver 🤍'],
  ['Monsoon 🌧️', 'Winter ❄️'], ['Tea 🍵', 'Coffee ☕'], ['Plan the day 🗓️', 'Wing it 🌊'], ['Save money 💰', 'Treat myself 💸'],
];
export const knowSubject = (g, round) => (round % 2 === 1 ? g.opponent : g.created_by);
// How many guesses each of you got right (you score when the question is about the other person).
export function knowScores(g) {
  const out = { [g.created_by]: 0, [g.opponent]: 0 };
  (g.state?.rounds || []).forEach((r, i) => {
    const subject = knowSubject(g, i + 1);
    const guesser = subject === g.created_by ? g.opponent : g.created_by;
    if (r[subject] && r[subject] === r[guesser]) out[guesser]++;
  });
  return out;
}

// ---------- Truth or Dare ----------
export const TRUTHS = [
  'What was your first impression of me? 👀', "What's the most embarrassing thing you've done in front of me? 🙈",
  'Which of my habits secretly annoys you? 😬', "What's a song that reminds you of us? 🎶", 'When did you first know you liked me? 💘',
  "What's the silliest thing you've cried over? 🥲", "What's one thing you've never told me? 🤫", 'Who in my family is your favourite? 👪',
  "What's your weirdest food combo? 🍟", 'Rate my cooking out of 10. Honestly. 🍳', 'What do you think I do when you are not around? 🕵️',
  "What's your favourite photo of us? 📸", 'If we swapped bodies for a day, what would you do first? 🔁', "What's the cheesiest thing you've done for love? 🧀",
  'What would you name our pet? 🐶', 'What did you google about me early on? 🔍', "What's the best date we've had? 🌃",
  "What's your guilty-pleasure song? 🎧", 'Which of my outfits is your favourite? 👗', 'What do I do that makes you smile instantly? 😊',
  'What would your wedding speech about me say, in one line? 💍', "What's a tiny thing I do that you love? 🫶", 'Who fell first, really? 😏',
  'What would you change about our first meeting? ⏪',
];
export const DARES = [
  'Send me a voice note singing our song 🎤', 'Send your most unflattering selfie 🤳', 'Text me your best pickup line 😏',
  'Do your best impression of me and send it 🎭', 'Write a 4-line poem about me ✍️', 'Send 10 heart emojis in 10 seconds ⏱️',
  'Make a photo of us your wallpaper for a day 📱', 'Tell me 3 things you love about me 💞', "Send a photo of what you're looking at right now 📸",
  'Describe me using only emojis 🤪', 'Do 10 squats and send proof 🏋️', "Call me and say 'I love you' in a funny accent 📞",
  'Plan our next date in one message 🗓️', 'Send the 7th photo in your gallery 😅', 'Use my nickname in every message for an hour 🐣',
  'Send a voice note of your evil laugh 😈', 'Draw me in 30 seconds and send it 🎨', 'Send me a song you think I should hear 🎵',
  "Give me a compliment you've never said before 🌟", 'Text me in all caps for the next 10 messages 📣', "Send a selfie with your best 'model' face 💅",
  'Teach me one word in a language you like 🌍', 'Tell our love story in 15 seconds, as a voice note 🎬', 'Send a photo of your messiest corner 🧺',
];
const cardBank = type => (type === 'truth' ? TRUTHS : DARES);
export const cardText = card => (card ? cardBank(card.type)[card.i] || '' : '');

// Draw a truth or dare you haven't had in this game (starts over once all are used).
export function drawCard(g, me, type, rand = Math.random) {
  const st = g.state || {};
  const used = st.used || [];
  const bank = cardBank(type);
  const tag = type[0];
  let free = bank.map((_, i) => i).filter(i => !used.includes(`${tag}${i}`));
  const reset = !free.length;
  if (reset) free = bank.map((_, i) => i);
  const i = free[Math.floor(rand() * free.length)];
  const kept = reset ? used.filter(u => u[0] !== tag) : used;
  return { state: { ...st, card: { type, i, by: me }, used: [...kept, `${tag}${i}`] } };
}
// Done (or skipped): log it and pass the turn.
export function finishCard(g, me, done) {
  const st = g.state || {};
  return {
    state: { ...st, card: null, log: [{ ...st.card, done }, ...(st.log || [])].slice(0, 40) },
    turn: opponentOf(g, me),
  };
}

// ---------- Memory Match: 8 pairs ----------
export const MEMORY_FACES = ['💕', '🌹', '🍫', '🧸', '💍', '🎁', '🌙', '🍓'];
export const memoryDeck = (rand = Math.random) => shuffle([...MEMORY_FACES.keys(), ...MEMORY_FACES.keys()], rand);

// Flip card i. The first flip just shows it; the second either wins the pair (you go again)
// or shows both for a moment and passes the turn. Returns the update to save, or null.
export function memoryFlip(g, me, i, now = Date.now()) {
  const st = g.state || {};
  const owners = st.owners || [];
  const flipped = st.flipped || [];
  if (owners[i] || flipped.includes(i)) return null;
  if (!flipped.length) return { state: { ...st, flipped: [i], reveal: null, revealAt: null } };
  const first = flipped[0];
  if (st.cards[first] !== st.cards[i]) {
    return { state: { ...st, flipped: [], reveal: [first, i], revealAt: new Date(now).toISOString() }, turn: opponentOf(g, me) };
  }
  const seat = seatOf(g, me);
  const next = owners.slice();
  next[first] = seat;
  next[i] = seat;
  const finished = next.every(Boolean);
  const mine = next.filter(o => o === seat).length;
  const theirs = next.filter(o => o && o !== seat).length;
  return {
    state: { ...st, owners: next, flipped: [], reveal: null, revealAt: null, last: [first, i] },
    turn: finished ? null : me,
    status: finished ? 'done' : 'active',
    winner: !finished || mine === theirs ? null : mine > theirs ? me : opponentOf(g, me),
  };
}
// Pairs each of you has found.
export function memoryPairs(g) {
  const out = { [g.created_by]: 0, [g.opponent]: 0 };
  (g.state?.owners || []).forEach(o => { if (o) out[userAtSeat(g, o)] += 0.5; });
  return out;
}

// ---------- where things stand ----------
// 'your-move' | 'their-move' | 'done'
export function gameStatus(g, me) {
  if (g.status === 'done') return 'done';
  if (GAMES[g.kind]?.turns) return g.turn === me ? 'your-move' : 'their-move';
  return (g.state?.picked || []).includes(me) ? 'their-move' : 'your-move';
}

// Wins for each of you and draws, across finished games that have a winner.
export function scoreboard(games, me) {
  const out = { me: 0, them: 0, draws: 0, played: 0 };
  for (const g of games) {
    if (g.status !== 'done' || !COMPETITIVE.includes(g.kind)) continue;
    out.played++;
    if (!g.winner) out.draws++;
    else if (g.winner === me) out.me++;
    else out.them++;
  }
  return out;
}
