import { C4_COLS, C4_ROWS, c4Drop, c4Result, seatOf, turnMove, userAtSeat } from '../../lib/games.js';
import { haptic } from '../../lib/haptics.js';

export default function ConnectFour({ g, me, actions }) {
  const cells = g.state?.cells || Array(C4_COLS * C4_ROWS).fill(0);
  const myTurn = g.status === 'active' && g.turn === me;
  const line = new Set(g.state?.line || []);
  const last = g.state?.last;

  function drop(col) {
    if (!myTurn) return;
    const i = c4Drop(cells, col);
    if (i < 0) return;
    const next = cells.slice();
    next[i] = seatOf(g, me);
    haptic('select');
    actions.playMove(g, turnMove(g, me, next, i, c4Result(next, i)));
  }

  return (
    <div className={`c4${myTurn ? ' my-turn' : ''}${line.size ? ' has-win' : ''}`}>
      {Array.from({ length: C4_COLS }, (_, col) => (
        <button key={col} type="button" className="c4-col" onClick={() => drop(col)}
          disabled={!myTurn || c4Drop(cells, col) < 0} aria-label={`Drop in column ${col + 1}`}>
          {Array.from({ length: C4_ROWS }, (_, row) => {
            const i = row * C4_COLS + col;
            const seat = cells[i];
            return (
              <span key={row} className="c4-slot">
                {seat ? <span className={`disc ${userAtSeat(g, seat) === me ? 'me' : 'them'}${line.has(i) ? ' win' : ''}${last === i ? ' drop' : ''}`}
                  style={last === i ? { '--rows': row + 1 } : undefined} /> : null}
              </span>
            );
          })}
        </button>
      ))}
    </div>
  );
}
