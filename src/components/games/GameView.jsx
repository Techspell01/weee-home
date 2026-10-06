import { useEffect, useRef, useState } from 'react';
import { Avatar, ConfirmButton, Icon } from '../ui.jsx';
import { GAMES, QUIZZES, gameStatus, knowScores, memoryPairs, opponentOf, seatOf } from '../../lib/games.js';
import { haptic } from '../../lib/haptics.js';
import { playSound } from '../../lib/sounds.js';
import { Confetti, Mark, gameNav } from './GameBits.jsx';
import TicTacToe from './TicTacToe.jsx';
import ConnectFour from './ConnectFour.jsx';
import RockPaperScissors from './RockPaperScissors.jsx';
import ThisOrThat from './ThisOrThat.jsx';
import MemoryMatch from './MemoryMatch.jsx';
import TruthOrDare from './TruthOrDare.jsx';
import MostLikely from './MostLikely.jsx';
import KnowMe from './KnowMe.jsx';

const BOARDS = {
  tictactoe: TicTacToe, connect4: ConnectFour, rps: RockPaperScissors, thisorthat: ThisOrThat,
  memory: MemoryMatch, truthordare: TruthOrDare, mostlikely: MostLikely, knowme: KnowMe,
};
// Little emojis to tease (or console) the other player; they pop up on their screen.
const EMOTES = ['😂', '😭', '😜', '😏', '🫠', '🥱', '😤', '🥳'];

export default function GameView({ g, hh, actions, nameOf, me, avatars, onBack, onRematch }) {
  const other = opponentOf(g, me);
  const partnerName = nameOf(other);
  const status = gameStatus(g, me);
  const Board = BOARDS[g.kind];
  const [celebrate, setCelebrate] = useState(false);
  const [floats, setFloats] = useState([]); // emojis flying up the screen
  const lastEmote = useRef(0);

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

  // Emojis: show the ones your partner sends while you're in this game.
  function float(emoji, from) {
    const key = `${Date.now()}-${Math.random()}`;
    setFloats(f => [...f.slice(-7), { key, emoji, from, x: 18 + Math.random() * 64 }]);
    setTimeout(() => setFloats(f => f.filter(x => x.key !== key)), 2200);
  }
  useEffect(() => {
    const onEmote = e => {
      if (e.detail?.game !== g.id) return;
      float(e.detail.emoji, 'them');
      haptic('light');
    };
    window.addEventListener('weee:emote', onEmote);
    return () => window.removeEventListener('weee:emote', onEmote);
  }, [g.id]);
  function tease(emoji) {
    if (Date.now() - lastEmote.current < 500) return;
    lastEmote.current = Date.now();
    hh.sendEmote?.(g.id, emoji);
    float(emoji, 'me');
    haptic('select');
  }

  // Their move lands while you're watching: a soft tick. The game ends: celebrate or commiserate.
  const iKnewMore = () => { const s = knowScores(g); return s[me] > s[other]; };
  const seen = useRef({ updated: g.updated_at, status: g.status });
  useEffect(() => {
    const before = seen.current;
    seen.current = { updated: g.updated_at, status: g.status };
    if (before.updated === g.updated_at) return;
    if (before.status === 'active' && g.status === 'done') {
      const happy = g.winner === me
        || (['thisorthat', 'mostlikely'].includes(g.kind) && (g.state?.matches || 0) >= 7)
        || (g.kind === 'knowme' && iKnewMore());
      if (happy) {
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
  const pairs = g.kind === 'memory' ? memoryPairs(g) : null;
  const known = g.kind === 'knowme' ? knowScores(g) : null;
  const dares = uid => (g.state?.log || []).filter(l => l.by === uid && l.done).length;
  const badge = uid => {
    const who = uid === me ? 'me' : 'them';
    if (g.kind === 'tictactoe') return <Mark seat={seatOf(g, uid)} who={who} draw={false} />;
    if (g.kind === 'connect4') return <span className={`disc mini ${who}`} />;
    if (g.kind === 'memory') return <b className={`gv-count ${who}`}>{pairs[uid]}</b>;
    if (g.kind === 'rps') return <b className={`gv-count ${who}`}>{g.state?.score?.[uid] || 0}</b>;
    if (g.kind === 'knowme') return <b className={`gv-count ${who}`}>{known[uid]}</b>;
    if (g.kind === 'truthordare') return <b className={`gv-count ${who}`}>{dares(uid)}</b>;
    return null;
  };
  const sub = uid => {
    if (g.status === 'done') return g.winner === uid ? 'winner' : ' ';
    if (isOn(uid)) return uid === me ? (g.kind === 'truthordare' ? 'your turn' : 'your move') : 'thinking…';
    return !turnBased && picked.includes(uid) ? 'picked ✓' : ' ';
  };

  // Pick games say whose turn it is on the board itself.
  const line = g.status === 'done' || !turnBased ? null
    : status === 'your-move' ? (g.kind === 'truthordare' ? 'Your turn' : 'Your move')
    : `${partnerName}'s ${g.kind === 'truthordare' ? 'turn' : 'move'}`;

  const total = (g.state?.questions || []).length || 10;
  const matches = g.state?.matches || 0;
  let result = '';
  if (g.status === 'done') {
    if (g.kind === 'thisorthat') result = `You matched ${matches} of ${total} ${matches >= 7 ? '💞' : matches >= 4 ? '🙂' : '🙈'}`;
    else if (g.kind === 'mostlikely') result = `You agreed on ${matches} of ${total} ${matches >= 7 ? '😂' : '🤔'}`;
    else if (g.kind === 'knowme') {
      result = known[me] > known[other] ? `You know ${partnerName} better 🧠`
        : known[other] > known[me] ? `${partnerName} knows you better 🧠` : 'You know each other equally well 💞';
    } else if (g.kind === 'truthordare') result = `You did ${dares(me)} · ${partnerName} did ${dares(other)} 🎉`;
    else if (g.state?.ended_by) result = g.state.ended_by === me ? 'You ended this game' : `${partnerName} ended the game`;
    else if (!g.winner) result = "It's a draw";
    else result = g.winner === me ? 'You won! 🏆' : `${partnerName} won this one`;
  }
  const resultFirst = QUIZZES.includes(g.kind) || g.kind === 'truthordare'; // their boards become long recaps

  const resultCard = (
    <div className={`gv-result${g.winner === me ? ' won' : ''}`}>
      <div className="gv-result-title">{result}</div>
      <div className="stack-row center-row">
        <button type="button" className="btn" onClick={onRematch}>{g.kind === 'truthordare' ? 'Play again' : 'Rematch'}</button>
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

      <div className="emote-bar" role="group" aria-label={`Send ${partnerName} an emoji`}>
        {EMOTES.map(e => <button key={e} type="button" className="emote" onClick={() => tease(e)} aria-label={`Send ${e}`}>{e}</button>)}
      </div>

      {line && <div className={`gv-status${status === 'your-move' ? ' mine' : ''}`}>{line}</div>}

      {g.status === 'done' && resultFirst && resultCard}

      <div className="gv-board">
        <Board g={g} me={me} partnerName={partnerName} actions={actions} myPicks={hh.picks} avatars={avatars} />
      </div>

      {g.status === 'done' && !resultFirst && resultCard}
      {celebrate && <Confetti />}
      <div className="emote-floats" aria-live="polite">
        {floats.map(f => (
          <span key={f.key} className={`emote-float ${f.from}`} style={{ '--x': `${f.x}%` }}>
            {f.emoji}
            {f.from === 'them' && <small>{partnerName}</small>}
          </span>
        ))}
      </div>
    </section>
  );
}
