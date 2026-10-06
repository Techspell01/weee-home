import { useEffect, useState } from 'react';
import { MEMORY_FACES, memoryFlip, userAtSeat } from '../../lib/games.js';
import { haptic } from '../../lib/haptics.js';

const SHOW_MISS_MS = 1800;

export default function MemoryMatch({ g, me, actions }) {
  const st = g.state || {};
  const cards = st.cards || [];
  const owners = st.owners || [];
  const flipped = st.flipped || [];
  const myTurn = g.status === 'active' && g.turn === me;

  // A missed pair stays face up for a moment on both phones, then turns back over.
  const [missUntil, setMissUntil] = useState(0);
  useEffect(() => {
    if (!st.reveal || !st.revealAt || Math.abs(Date.now() - Date.parse(st.revealAt)) > 15000) return;
    setMissUntil(Date.now() + SHOW_MISS_MS);
    const t = setTimeout(() => setMissUntil(0), SHOW_MISS_MS);
    return () => clearTimeout(t);
  }, [st.revealAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = missUntil > 0 && st.reveal ? st.reveal : [];
  const faceUp = new Set([...flipped, ...missing]);

  function flip(i) {
    if (!myTurn || missing.length) return;
    const move = memoryFlip(g, me, i);
    if (!move) return;
    haptic(move.state.owners?.[i] ? 'success' : 'select');
    actions.playMove(g, move);
  }

  return (
    <div className={`memory${myTurn ? ' my-turn' : ''}`}>
      {cards.map((face, i) => {
        const owner = owners[i];
        const up = Boolean(owner) || faceUp.has(i);
        const who = owner ? (userAtSeat(g, owner) === me ? 'me' : 'them') : '';
        return (
          <button key={i} type="button" className={`mem-card${up ? ' up' : ''}${owner ? ` won ${who}` : ''}${missing.includes(i) ? ' miss' : ''}`}
            onClick={() => flip(i)} disabled={!myTurn || Boolean(owner) || missing.length > 0}
            aria-label={up ? `${MEMORY_FACES[face]}${owner ? (who === 'me' ? ', yours' : ', theirs') : ''}` : `Card ${i + 1}, face down`}>
            <span className="mem-inner">
              <span className="mem-back" aria-hidden="true" />
              <span className="mem-face" aria-hidden="true">{MEMORY_FACES[face]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
