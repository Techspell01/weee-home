import { describe, expect, it } from 'vitest';
import { C4_COLS, QUESTIONS, c4Drop, c4Result, gameStatus, initialState, pickQuestions, rpsOutcome, scoreboard, seatOf, tttResult, turnMove, userAtSeat } from './games.js';

const ME = 'me', HER = 'her';
const game = (over = {}) => ({ id: 'g', kind: 'tictactoe', created_by: ME, opponent: HER, turn: HER, status: 'active', winner: null, state: {}, ...over });

describe('tic tac toe', () => {
  it('finds rows, columns and diagonals', () => {
    expect(tttResult([1, 1, 1, 0, 2, 2, 0, 0, 0])).toEqual({ seat: 1, line: [0, 1, 2] });
    expect(tttResult([2, 1, 0, 2, 1, 0, 2, 0, 1])).toEqual({ seat: 2, line: [0, 3, 6] });
    expect(tttResult([1, 2, 0, 2, 1, 0, 0, 0, 1])).toEqual({ seat: 1, line: [0, 4, 8] });
  });
  it('calls a full board with no line a draw, and an unfinished board nothing', () => {
    expect(tttResult([1, 2, 1, 1, 2, 2, 2, 1, 1])).toEqual({ draw: true });
    expect(tttResult([1, 2, 0, 0, 0, 0, 0, 0, 0])).toBe(null);
  });
});

describe('four in a row', () => {
  const empty = () => Array(42).fill(0);
  it('drops to the lowest free cell and refuses a full column', () => {
    const cells = empty();
    expect(c4Drop(cells, 3)).toBe(5 * C4_COLS + 3);
    cells[5 * C4_COLS + 3] = 1;
    expect(c4Drop(cells, 3)).toBe(4 * C4_COLS + 3);
    for (let r = 0; r < 6; r++) cells[r * C4_COLS + 0] = 2;
    expect(c4Drop(cells, 0)).toBe(-1);
  });
  it('spots four across, down and diagonally', () => {
    const across = empty();
    [0, 1, 2, 3].forEach(c => { across[35 + c] = 1; });
    expect(c4Result(across, 36)).toEqual({ seat: 1, line: [35, 36, 37, 38] });

    const down = empty();
    [2, 3, 4, 5].forEach(r => { down[r * 7 + 6] = 2; });
    expect(c4Result(down, 20)?.seat).toBe(2);

    const diag = empty();
    [[5, 0], [4, 1], [3, 2], [2, 3]].forEach(([r, c]) => { diag[r * 7 + c] = 1; });
    expect(c4Result(diag, 3 * 7 + 2)?.line).toHaveLength(4);

    const three = empty();
    [0, 1, 2].forEach(c => { three[35 + c] = 1; });
    expect(c4Result(three, 36)).toBe(null);
  });
});

describe('moves and turns', () => {
  it('the challenged player is seat 1 and moves first', () => {
    const g = game();
    expect(seatOf(g, HER)).toBe(1);
    expect(seatOf(g, ME)).toBe(2);
    expect(userAtSeat(g, 1)).toBe(HER);
  });
  it('passes the turn, or ends the game with the right winner', () => {
    const g = game({ turn: ME });
    expect(turnMove(g, ME, [0], 0, null)).toMatchObject({ turn: HER, status: 'active', winner: null });
    expect(turnMove(g, ME, [2], 0, { seat: 2, line: [0, 1, 2] })).toMatchObject({ turn: null, status: 'done', winner: ME });
    expect(turnMove(g, ME, [2], 0, { draw: true })).toMatchObject({ status: 'done', winner: null });
  });
  it('knows whose move it is', () => {
    expect(gameStatus(game({ turn: ME }), ME)).toBe('your-move');
    expect(gameStatus(game({ turn: HER }), ME)).toBe('their-move');
    expect(gameStatus(game({ kind: 'rps', turn: null, state: { picked: [ME] } }), ME)).toBe('their-move');
    expect(gameStatus(game({ kind: 'rps', turn: null, state: { picked: [HER] } }), ME)).toBe('your-move');
    expect(gameStatus(game({ status: 'done' }), ME)).toBe('done');
  });
});

describe('rock paper scissors', () => {
  it('rock beats scissors beats paper beats rock', () => {
    expect(rpsOutcome('rock', 'scissors')).toBe(1);
    expect(rpsOutcome('scissors', 'paper')).toBe(1);
    expect(rpsOutcome('paper', 'rock')).toBe(1);
    expect(rpsOutcome('rock', 'paper')).toBe(-1);
    expect(rpsOutcome('paper', 'paper')).toBe(0);
  });
});

describe('this or that and the scoreboard', () => {
  it('picks ten different questions', () => {
    const qs = pickQuestions(10, () => 0.42);
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map(q => q[0])).size).toBe(10);
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(30);
    expect(initialState('thisorthat').questions).toHaveLength(10);
  });
  it('counts wins and draws but not This or That', () => {
    const games = [
      game({ status: 'done', winner: ME }), game({ status: 'done', winner: ME }), game({ status: 'done', winner: HER }),
      game({ status: 'done', winner: null }), game({ kind: 'thisorthat', status: 'done' }), game(),
    ];
    expect(scoreboard(games, ME)).toEqual({ me: 2, them: 1, draws: 1, played: 4 });
  });
});
