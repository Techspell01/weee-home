import { seatOf, tttResult, turnMove, userAtSeat } from '../../lib/games.js';
import { haptic } from '../../lib/haptics.js';
import { Mark } from './GameBits.jsx';

export default function TicTacToe({ g, me, actions }) {
  const cells = g.state?.cells || Array(9).fill(0);
  const myTurn = g.status === 'active' && g.turn === me;
  const line = new Set(g.state?.line || []);

  function play(i) {
    if (!myTurn || cells[i]) return;
    const next = cells.slice();
    next[i] = seatOf(g, me);
    haptic('select');
    actions.playMove(g, turnMove(g, me, next, i, tttResult(next)));
  }

  return (
    <div className={`ttt${myTurn ? ' my-turn' : ''}${line.size ? ' has-win' : ''}`}>
      {cells.map((c, i) => (
        <button key={i} type="button" className={`ttt-cell${line.has(i) ? ' win' : ''}${g.state?.last === i ? ' last' : ''}`}
          onClick={() => play(i)} disabled={!myTurn || Boolean(c)}
          aria-label={c ? `${userAtSeat(g, c) === me ? 'Yours' : 'Theirs'}, square ${i + 1}` : `Empty square ${i + 1}`}>
          {c ? <Mark seat={c} who={userAtSeat(g, c) === me ? 'me' : 'them'} draw={g.state?.last === i} /> : null}
        </button>
      ))}
    </div>
  );
}
