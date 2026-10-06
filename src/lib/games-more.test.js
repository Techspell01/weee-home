import { describe, expect, it } from 'vitest';
import { DARES, GAMES, GAME_ORDER, KNOW_ME, MOST_LIKELY, TRUTHS, cardText, drawCard, finishCard, gameStatus, initialState, knowScores, knowSubject, likelyPick, likelyUser, memoryFlip, memoryPairs, scoreboard } from './games.js';

const ME = 'me', HER = 'her';
// I challenged her, so she is seat 1 and moves first.
const game = (over = {}) => ({ id: 'g', created_by: ME, opponent: HER, turn: ME, status: 'active', winner: null, ...over });

describe('memory match', () => {
  const cards = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7];
  const fresh = () => game({ kind: 'memory', state: { cards, owners: Array(16).fill(0), flipped: [], reveal: null } });

  it('the first flip only shows a card and keeps the turn', () => {
    const move = memoryFlip(fresh(), ME, 3);
    expect(move.state.flipped).toEqual([3]);
    expect(move.turn).toBeUndefined();
  });
  it('a pair is yours and you go again', () => {
    const g = fresh();
    g.state.flipped = [0];
    const move = memoryFlip(g, ME, 1);
    expect(move.state.owners[0]).toBe(2);
    expect(move.state.owners[1]).toBe(2);
    expect(move).toMatchObject({ turn: ME, status: 'active' });
  });
  it('a miss shows both cards and passes the turn', () => {
    const g = fresh();
    g.state.flipped = [0];
    const move = memoryFlip(g, ME, 2, 1000);
    expect(move.state.reveal).toEqual([0, 2]);
    expect(move.turn).toBe(HER);
  });
  it('the last pair ends the game; more pairs wins', () => {
    const g = fresh();
    g.state.owners = [2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 0, 0];
    g.state.flipped = [14];
    const move = memoryFlip(g, ME, 15);
    expect(move).toMatchObject({ status: 'done', winner: ME, turn: null });
    expect(memoryPairs({ ...g, state: move.state })).toEqual({ [ME]: 5, [HER]: 3 });
  });
  it("won't flip a matched or already-flipped card", () => {
    const g = fresh();
    g.state.owners[5] = 1;
    g.state.flipped = [2];
    expect(memoryFlip(g, ME, 5)).toBe(null);
    expect(memoryFlip(g, ME, 2)).toBe(null);
  });
});

describe('truth or dare', () => {
  it('draws an unused card, then logs it and passes the turn', () => {
    const g = game({ kind: 'truthordare', state: { card: null, log: [], used: [] } });
    const drawn = drawCard(g, ME, 'dare', () => 0);
    expect(drawn.state.card).toEqual({ type: 'dare', i: 0, by: ME });
    expect(cardText(drawn.state.card)).toBe(DARES[0]);
    const after = drawCard({ ...g, state: drawn.state }, ME, 'dare', () => 0);
    expect(after.state.card.i).toBe(1); // the first one is used up
    const done = finishCard({ ...g, state: drawn.state }, ME, true);
    expect(done.turn).toBe(HER);
    expect(done.state.card).toBe(null);
    expect(done.state.log[0]).toMatchObject({ type: 'dare', done: true });
  });
  it('starts the deck over once every card is used', () => {
    const used = TRUTHS.map((_, i) => `t${i}`);
    const g = game({ kind: 'truthordare', state: { used } });
    const drawn = drawCard(g, ME, 'truth', () => 0.5);
    expect(drawn.state.used.filter(u => u[0] === 't')).toHaveLength(1);
  });
});

describe("who's more likely and how well do you know me", () => {
  it('maps picks to people', () => {
    const g = game({ kind: 'mostlikely' });
    expect(likelyUser(g, 'a')).toBe(ME);
    expect(likelyUser(g, 'b')).toBe(HER);
    expect(likelyPick(g, HER)).toBe('b');
  });
  it('alternates who the question is about, and scores the guesser', () => {
    const g = game({ kind: 'knowme', state: { rounds: [
      { [HER]: 'a', [ME]: 'a' }, // about her: I guessed right
      { [ME]: 'b', [HER]: 'a' }, // about me: she guessed wrong
      { [HER]: 'b', [ME]: 'b' }, // about her: right again
    ] } });
    expect(knowSubject(g, 1)).toBe(HER);
    expect(knowSubject(g, 2)).toBe(ME);
    expect(knowScores(g)).toEqual({ [ME]: 2, [HER]: 0 });
  });
});

describe('all eight games', () => {
  it('each has a starting state and banks are big enough', () => {
    expect(GAME_ORDER).toHaveLength(8);
    for (const kind of GAME_ORDER) expect(initialState(kind)).toBeTruthy();
    expect(initialState('memory').cards).toHaveLength(16);
    expect(initialState('mostlikely').questions).toHaveLength(10);
    expect(initialState('knowme').questions).toHaveLength(10);
    expect(MOST_LIKELY.length).toBeGreaterThanOrEqual(30);
    expect(KNOW_ME.length).toBeGreaterThanOrEqual(20);
  });
  it('turn-based fun games use the turn, quizzes use picks', () => {
    expect(GAMES.truthordare.turns && GAMES.memory.turns).toBe(true);
    expect(gameStatus(game({ kind: 'truthordare', turn: HER }), ME)).toBe('their-move');
    expect(gameStatus(game({ kind: 'mostlikely', turn: null, state: { picked: [] } }), ME)).toBe('your-move');
  });
  it('only games with a winner count on the scoreboard', () => {
    const done = over => game({ status: 'done', ...over });
    const games = [done({ kind: 'memory', winner: ME }), done({ kind: 'truthordare' }), done({ kind: 'mostlikely' }), done({ kind: 'knowme' })];
    expect(scoreboard(games, ME)).toEqual({ me: 1, them: 0, draws: 0, played: 1 });
  });
});
