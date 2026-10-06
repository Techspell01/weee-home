import { useEffect, useRef, useState } from 'react';
import { Avatar, ConfirmButton, Icon } from '../ui.jsx';
import { GAMES, gameStatus, opponentOf, seatOf } from '../../lib/games.js';
import { haptic } from '../../lib/haptics.js';
import { playSound } from '../../lib/sounds.js';
import { Confetti, Mark, gameNav } from './GameBits.jsx';
import TicTacToe from './TicTacToe.jsx';
import ConnectFour from './ConnectFour.jsx';
import RockPaperScissors from './RockPaperScissors.jsx';
import ThisOrThat from './ThisOrThat.jsx';

const BOARDS = { tictactoe: TicTacToe, connect4: ConnectFour, rps: RockPaperScissors, thisorthat: ThisOrThat };

export default function GameView({ g, hh, actions, nameOf, me, avatars, onBack, onRematch }) {
  const other = opponentOf(g, me);
  const partnerName = nameOf(other);
  const status = gameStatus(g, me);
  const Board = BOARDS[g.kind];
  const [celebrate, setCelebrate] = useState(false);

  // Tell the database this game is open here (so moves don't buzz this phone), and keep it fresh.
  useEffect(() => {
    gameNav.watching = g.id;
    const mark = () => actions.watchGame(document.visibilityState === 'visible' ? g.id : null);
    mark();
    const iv = setInterval(mark, 25000);
    document.addEventListener('visibilitychange', mark);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', mark);
      if (gameNav.watching === g.id) gameNav.watching = null;
      actions.watchGame(null);
    };
  }, [g.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Their move lands while you're watching: a soft tick. The game ends: celebrate or commiserate.
  const seen = useRef({ updated: g.updated_at, status: g.status });
  useEffect(() => {
    const before = seen.current;
    seen.current = { updated: g.updated_at, status: g.status };
    if (before.updated === g.updated_at) return;
    if (before.status === 'active' && g.status === 'done') {
      if (g.winner === me || (g.kind === 'thisorthat' && (g.state?.matches || 0) >= 7)) {
        haptic('success');
        playSound('heart');
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 2600);
      } else {
        haptic(g.winner ? 'warn' : 'success');
      }
    } else if (g.last_actor && g.last_actor !== me) {
      haptic('light');
      playSound('soft');
    }
  }, [g.updated_at, g.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const turnBased = GAMES[g.kind].turns;
  const picked = g.state?.picked || [];
  const isOn = uid => g.status === 'active' && (turnBased ? g.turn === uid : !picked.includes(uid));
  const badge = uid => {
    if (g.kind === 'tictactoe') return <Mark seat={seatOf(g, uid)} who={uid === me ? 'me' : 'them'} draw={false} />;
    if (g.kind === 'connect4') return <span className={`disc mini ${uid === me ? 'me' : 'them'}`} />;
    return null;
  };
  const sub = uid => {
    if (g.status === 'done') return g.winner === uid ? 'winner' : ' ';
    if (isOn(uid)) return uid === me ? 'your move' : 'thinking…';
    return !turnBased && picked.includes(uid) ? 'picked ✓' : ' ';
  };

  // Pick games say whose turn it is on the board itself.
  const line = g.status === 'done' || !turnBased ? null : status === 'your-move' ? 'Your move' : `${partnerName}'s move`;

  const endedBy = g.state?.ended_by;
  let result = '';
  if (g.status === 'done') {
    if (endedBy) result = endedBy === me ? 'You ended this game' : `${partnerName} ended the game`;
    else if (g.kind === 'thisorthat') {
      const m = g.state?.matches || 0, total = (g.state?.questions || []).length || 10;
      result = `You matched ${m} of ${total} ${m >= 7 ? '💞' : m >= 4 ? '🙂' : '🙈'}`;
    } else if (!g.winner) result = "It's a draw";
    else result = g.winner === me ? 'You won! 🏆' : `${partnerName} won this one`;
  }

  const resultCard = (
    <div className={`gv-result${g.winner === me ? ' won' : ''}`}>
      <div className="gv-result-title">{result}</div>
      <div className="stack-row center-row">
        <button type="button" className="btn" onClick={onRematch}>Rematch</button>
        <button type="button" className="btn ghost" onClick={onBack}>All games</button>
      </div>
    </div>
  );

  return (
    <section className={`game-view g-${g.kind}`}>
      <div className="gv-top">
        <button type="button" className="icon" onClick={onBack} aria-label="All games"><Icon.back /></button>
        <div className="gv-title">{GAMES[g.kind].name}</div>
        {g.status === 'active'
          ? <ConfirmButton className="btn ghost small" label="End game" confirmLabel="End it?" onConfirm={() => actions.endGame(g)}>End</ConfirmButton>
          : <span className="gv-spacer" />}
      </div>

      <div className="gv-players">
        {[me, other].map(uid => (
          <div key={uid} className={`gv-p ${uid === me ? 'me' : 'them'}${isOn(uid) ? ' on' : ''}${g.status === 'done' && g.winner === uid ? ' won' : ''}`}>
            <Avatar url={avatars[uid]} name={uid === me ? 'You' : nameOf(uid)} size={40} />
            <div className="gv-p-text">
              <b>{uid === me ? 'You' : nameOf(uid)}</b>
              <span>{sub(uid)}</span>
            </div>
            {badge(uid)}
          </div>
        ))}
      </div>

      {line && <div className={`gv-status${status === 'your-move' ? ' mine' : ''}`}>{line}</div>}

      {g.status === 'done' && g.kind === 'thisorthat' && resultCard}

      <div className="gv-board">
        <Board g={g} me={me} partnerName={partnerName} actions={actions} myPicks={hh.picks} />
      </div>

      {g.status === 'done' && g.kind !== 'thisorthat' && resultCard}
      {celebrate && <Confetti />}
    </section>
  );
}
