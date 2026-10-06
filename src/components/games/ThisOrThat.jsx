import { opponentOf } from '../../lib/games.js';
import { splitOption } from './GameBits.jsx';

const answer = (q, k) => (q ? q[k === 'a' ? 0 : 1] : '');

export default function ThisOrThat({ g, me, partnerName, actions, myPicks }) {
  const other = opponentOf(g, me);
  const qs = g.state?.questions || [];
  const total = qs.length || 10;
  const rounds = g.state?.rounds || [];
  const matches = g.state?.matches || 0;
  const picked = g.state?.picked || [];
  const iPicked = picked.includes(me);
  const theyPicked = picked.includes(other);
  const myPick = myPicks.find(p => p.game_id === g.id && p.round === g.round)?.pick;
  const q = qs[g.round - 1];
  const last = rounds[rounds.length - 1];
  const lastQ = qs[rounds.length - 1];

  if (g.status === 'done') {
    return (
      <div className="tot">
        <div className="tot-summary">
          {qs.map((question, i) => {
            const r = rounds[i];
            if (!r) return null;
            const same = r[me] === r[other];
            return (
              <div key={i} className={`tot-row${same ? ' match' : ''}`}>
                <span className="tot-q">{question[0]} <i>or</i> {question[1]}</span>
                <span className="tot-a">{same ? <>Both: {answer(question, r[me])} 💞</> : <>You: {answer(question, r[me])} · {partnerName}: {answer(question, r[other])}</>}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="tot">
      <div className="tot-progress" style={{ '--p': rounds.length / total }}><span /></div>
      <div className="tot-meta">
        <span>Question {Math.min(g.round, total)} of {total}</span>
        <span>💞 {matches} {matches === 1 ? 'match' : 'matches'}</span>
      </div>

      {last && lastQ && (
        <div className={`tot-last${last[me] === last[other] ? ' match' : ''}`} key={rounds.length}>
          {last[me] === last[other]
            ? <>You both picked <b>{answer(lastQ, last[me])}</b> 💞</>
            : <>You: <b>{answer(lastQ, last[me])}</b> · {partnerName}: <b>{answer(lastQ, last[other])}</b></>}
        </div>
      )}

      {q && (
        <div className="tot-card" key={g.round}>
          {['a', 'b'].map((k, idx) => {
            const [text, emoji] = splitOption(q[idx]);
            return (
              <button key={k} type="button" className={`tot-opt${myPick === k ? ' chosen' : ''}`} disabled={iPicked} onClick={() => actions.pick(g, k)}>
                <span className="tot-emoji" aria-hidden="true">{emoji}</span>
                <span className="tot-text">{text}</span>
              </button>
            );
          })}
          <span className="tot-or" aria-hidden="true">or</span>
        </div>
      )}

      <p className="tot-wait">
        {iPicked ? <>Waiting for {partnerName}<span className="wait-dots" aria-hidden="true"><i /><i /><i /></span></>
          : theyPicked ? `${partnerName} has answered. Your turn.`
          : 'Answers stay hidden until you both pick.'}
      </p>
    </div>
  );
}
