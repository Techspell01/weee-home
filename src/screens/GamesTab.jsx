import { useEffect, useState } from 'react';
import { Avatar } from '../components/ui.jsx';
import { GAMES, GAME_ORDER, gameStatus, opponentOf, scoreboard } from '../lib/games.js';
import { ago } from '../lib/time.js';
import { GameArt, gameNav } from '../components/games/GameBits.jsx';
import GameView from '../components/games/GameView.jsx';

// Games for the two of you, played live.
export default function GamesTab({ hh, actions, notify, nameOf, me, now, avatars = {} }) {
  const [openId, setOpenId] = useState(() => {
    const id = gameNav.pending || new URLSearchParams(window.location.search).get('game');
    gameNav.pending = null;
    return id;
  });
  const [fresh, setFresh] = useState(null); // a game we just started, until the list catches up
  const [starting, setStarting] = useState(null);

  // Opened from a notification link: tidy the address bar. Opened from a banner: jump to that game.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('game')) {
      try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
    }
    const open = e => { gameNav.pending = null; setOpenId(e.detail); };
    window.addEventListener('weee:open-game', open);
    return () => window.removeEventListener('weee:open-game', open);
  }, []);

  const partner = hh.members.find(m => m.user_id !== me);
  const partnerName = partner?.display_name || 'your partner';
  const online = partner && (hh.online || []).includes(partner.user_id);
  const mine = hh.games.filter(g => g.created_by === me || g.opponent === me);
  const active = mine.filter(g => g.status === 'active');
  const activeOf = kind => active.find(g => g.kind === kind);
  const board = scoreboard(mine, me);
  const recent = mine.filter(g => g.status === 'done').slice(0, 5);

  const game = openId && (hh.games.find(g => g.id === openId) || (fresh?.id === openId ? fresh : null));

  async function play(kind) {
    const existing = activeOf(kind);
    if (existing) { setOpenId(existing.id); return; }
    if (!partner) { notify('Invite your partner from Settings to play together'); return; }
    setStarting(kind);
    const g = await actions.startGame(kind, partner.user_id);
    setStarting(null);
    if (!g) return;
    setFresh(g);
    setOpenId(g.id);
    if (g.created_by === me) notify(`Challenge sent to ${partnerName} 🎮`);
  }

  if (game) {
    return <GameView g={game} hh={hh} actions={actions} nameOf={nameOf} me={me} avatars={avatars}
      onBack={() => setOpenId(null)} onRematch={() => play(game.kind)} />;
  }

  const lead = board.played === 0 ? 'Your first match awaits'
    : board.me > board.them ? 'You lead' : board.them > board.me ? `${partnerName} leads` : 'All square';
  const chip = g => {
    const s = gameStatus(g, me);
    return s === 'your-move' ? <span className="g-chip mine">Your move</span> : <span className="g-chip">{partnerName}'s move</span>;
  };
  const resultLine = g => {
    if (g.kind === 'thisorthat') return `Matched ${g.state?.matches || 0} of ${(g.state?.questions || []).length || 10}`;
    if (g.state?.ended_by) return g.state.ended_by === me ? 'You ended it' : `${partnerName} ended it`;
    if (!g.winner) return 'Draw';
    return g.winner === me ? 'You won' : `${partnerName} won`;
  };

  return (
    <section className="games">
      {/* ---- the two of you ---- */}
      <div className="vs-card">
        <div className="vs-player">
          <Avatar url={avatars[me]} name="You" size={62} />
          <span className="vs-name">You</span>
        </div>
        <div className="vs-center">
          <div className="vs-score"><b className="me">{board.me}</b><span>:</span><b className="them">{board.them}</b></div>
          <div className="vs-caption">{lead}</div>
        </div>
        <div className="vs-player">
          <Avatar url={partner ? avatars[partner.user_id] : null} name={partnerName} size={62} />
          <span className="vs-name">{partner ? partnerName : 'Invite'}</span>
        </div>
        <div className="vs-foot">
          <i className={`presence${online ? ' on' : ''}`} />
          {!partner ? 'Invite your partner from Settings to play'
            : online ? `${partnerName} is in Weee right now`
            : partner.last_seen ? `${partnerName} was here ${ago(partner.last_seen, now)}` : `${partnerName} hasn't opened Weee yet`}
          {board.draws > 0 && <span className="vs-draws"> · {board.draws} {board.draws === 1 ? 'draw' : 'draws'}</span>}
        </div>
      </div>

      {/* ---- games in play ---- */}
      {active.length > 0 && <>
        <div className="label">In play</div>
        <div className="list">
          {active.map(g => (
            <button key={g.id} type="button" className={`row game-row${gameStatus(g, me) === 'your-move' ? ' mine' : ''}`} onClick={() => setOpenId(g.id)}>
              <GameArt kind={g.kind} small />
              <div className="main">
                <div className="name">{GAMES[g.kind].name}</div>
                <div className="meta">{Date.parse(g.updated_at) - Date.parse(g.created_at) < 2000
                  ? `${g.created_by === me ? 'You' : nameOf(g.created_by)} started it ${ago(g.created_at, now)}`
                  : `${g.last_actor === me ? 'You' : nameOf(opponentOf(g, me))} played ${ago(g.updated_at, now)}`}</div>
              </div>
              {chip(g)}
            </button>
          ))}
        </div>
      </>}

      {/* ---- the games ---- */}
      <div className="label">Play together</div>
      <div className="games-grid">
        {GAME_ORDER.map(kind => {
          const g = activeOf(kind);
          return (
            <button key={kind} type="button" className={`game-tile g-${kind}`} onClick={() => play(kind)} disabled={starting === kind}>
              <GameArt kind={kind} />
              <div className="game-tile-text">
                <div className="tile-title">{GAMES[kind].name}</div>
                <div className="tile-sub">{GAMES[kind].blurb}</div>
              </div>
              {g ? (gameStatus(g, me) === 'your-move' ? <span className="g-chip mine">Your move</span> : <span className="g-chip">Waiting</span>)
                : <span className="g-chip play">{starting === kind ? 'Starting…' : 'Play'}</span>}
            </button>
          );
        })}
      </div>

      {/* ---- recent ---- */}
      {recent.length > 0 && <>
        <div className="label">Recent</div>
        <div className="list">
          {recent.map(g => (
            <button key={g.id} type="button" className="row game-row past" onClick={() => setOpenId(g.id)}>
              <GameArt kind={g.kind} small />
              <div className="main">
                <div className="name">{resultLine(g)}</div>
                <div className="meta">{GAMES[g.kind].name} · {ago(g.updated_at, now)}</div>
              </div>
              {g.winner === me && <span className="g-trophy" aria-label="You won">🏆</span>}
            </button>
          ))}
        </div>
      </>}
    </section>
  );
}
