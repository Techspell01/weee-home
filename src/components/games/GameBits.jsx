import { useMemo } from 'react';

// Which game is open on this phone right now (Home uses it to decide on banners),
// and a game to open next time the Games tab mounts (from a banner or a notification).
export const gameNav = { watching: null, pending: null };

// Little pictures for the game tiles.
export function GameArt({ kind, small = false }) {
  const cls = `art art-${kind}${small ? ' small' : ''}`;
  if (kind === 'tictactoe') {
    return (
      <span className={cls} aria-hidden="true">
        <svg viewBox="0 0 60 60">
          <path d="M22 8v44M38 8v44M8 22h44M8 38h44" stroke="currentColor" strokeOpacity=".22" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M11 11l7 7M18 11l-7 7" stroke="var(--me)" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="30" cy="30" r="4.6" fill="none" stroke="var(--them)" strokeWidth="3.4" />
          <path d="M43 43l7 7M50 43l-7 7" stroke="var(--me)" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (kind === 'connect4') {
    const discs = [[0, 3, 'me'], [1, 2, 'me'], [2, 1, 'me'], [3, 0, 'me'], [1, 3, 'them'], [2, 3, 'them'], [2, 2, 'them'], [3, 3, 'them'], [3, 1, 'them']];
    return (
      <span className={cls} aria-hidden="true">
        <svg viewBox="0 0 60 60">
          <rect x="4" y="6" width="52" height="48" rx="12" fill="currentColor" fillOpacity=".07" />
          {[0, 1, 2, 3].flatMap(c => [0, 1, 2, 3].map(r => <circle key={`${c}${r}`} cx={13 + c * 11.3} cy={15 + r * 10.5} r="4.2" fill="currentColor" fillOpacity=".08" />))}
          {discs.map(([c, r, who]) => <circle key={`d${c}${r}`} cx={13 + c * 11.3} cy={15 + r * 10.5} r="4.2" fill={`var(--${who})`} />)}
        </svg>
      </span>
    );
  }
  if (kind === 'rps') return <span className={cls} aria-hidden="true"><i>✊</i><i>✋</i><i>✌️</i></span>;
  if (kind === 'memory') {
    return (
      <span className={cls} aria-hidden="true">
        <span className="mini-card back" /><span className="mini-card face">🌹</span>
      </span>
    );
  }
  if (kind === 'mostlikely') {
    return (
      <span className={cls} aria-hidden="true">
        <svg viewBox="0 0 60 60">
          <circle cx="21" cy="30" r="15" fill="var(--me)" fillOpacity=".9" />
          <circle cx="39" cy="30" r="15" fill="var(--them)" fillOpacity=".9" />
          <text x="30" y="37" textAnchor="middle" fontSize="20" fontWeight="800" fill="#0A0A0B">?</text>
        </svg>
      </span>
    );
  }
  if (kind === 'knowme') return <span className={cls} aria-hidden="true"><i>🧠</i><i>💞</i></span>;
  if (kind === 'truthordare') return <span className={cls} aria-hidden="true"><b>Truth</b><em>or</em><b>Dare</b></span>;
  return <span className={cls} aria-hidden="true"><b>This</b><em>or</em><b>That</b></span>;
}

// ✕ for whoever moves first, ◯ for the other; coloured by person.
export function Mark({ seat, who, draw = true }) {
  return (
    <svg className={`mark ${who}${draw ? ' draw' : ''}`} viewBox="0 0 40 40" aria-hidden="true">
      {seat === 1
        ? <path d="M11 11L29 29M29 11L11 29" pathLength="1" />
        : <circle cx="20" cy="20" r="10.5" pathLength="1" />}
    </svg>
  );
}

const COLORS = ['#FF6B8A', '#E9B36A', '#F4F4F5', '#7DDB9B', '#3AA8FF'];
export function Confetti() {
  const bits = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    x: Math.random() * 100, d: Math.random() * 0.5, r: Math.random() * 360, s: 0.7 + Math.random() * 0.6, c: COLORS[i % COLORS.length],
  })), []);
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => <i key={i} style={{ '--x': `${b.x}%`, '--d': `${b.d}s`, '--r': `${b.r}deg`, '--s': b.s, background: b.c }} />)}
    </div>
  );
}

// "Beach 🏖️" → ["Beach", "🏖️"]
export function splitOption(s) {
  const parts = String(s).trim().split(' ');
  const emoji = parts.length > 1 ? parts.pop() : '';
  return [parts.join(' '), emoji];
}
