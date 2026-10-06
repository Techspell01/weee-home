import { Avatar } from '../ui.jsx';
import { likelyPick, likelyUser, opponentOf } from '../../lib/games.js';

// Who's More Likely To: both secretly point at one of you, then the reveal.
export default function MostLikely({ g, me, partnerName, actions, myPicks, avatars = {} }) {
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
  const chosen = pick => likelyUser(g, pick);
  const face = pick => <Avatar url={avatars[chosen(pick)]} name={chosen(pick) === me ? 'You' : partnerName} size={24} className="ml-mini" />;

  const verdict = r => (r[me] === r[other]
    ? <>You both picked {face(r[me])} <b>{chosen(r[me]) === me ? 'you' : partnerName}</b> {chosen(r[me]) === me ? '🙈' : '😂'}</>
    : <span className="ml-split">You 👉 {face(r[me])} <i>·</i> {partnerName} 👉 {face(r[other])}</span>);

  if (g.status === 'done') {
    return (
      <div className="quiz">
        <div className="tot-summary">
          {qs.map((statement, i) => rounds[i] && (
            <div key={i} className={`tot-row${rounds[i][me] === rounds[i][other] ? ' match' : ''}`}>
              <span className="tot-q">Who's more likely to {statement}</span>
              <span className="tot-a">{verdict(rounds[i])}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="quiz">
      <div className="tot-progress" style={{ '--p': rounds.length / total }}><span /></div>
      <div className="tot-meta">
        <span>Question {Math.min(g.round, total)} of {total}</span>
        <span>🤝 agreed {matches}</span>
      </div>
      {last && <div className={`tot-last${last[me] === last[other] ? ' match' : ''}`} key={rounds.length}>{verdict(last)}</div>}

      {q && (
        <div className="ml-card" key={g.round}>
          <span className="ml-eyebrow">Who's more likely to…</span>
          <p className="ml-statement">{q}</p>
          <div className="ml-options">
            {[me, other].map(uid => {
              const pick = likelyPick(g, uid);
              return (
                <button key={uid} type="button" className={`ml-opt ${uid === me ? 'me' : 'them'}${myPick === pick ? ' chosen' : ''}`}
                  disabled={iPicked} onClick={() => actions.pick(g, pick)}>
                  <Avatar url={avatars[uid]} name={uid === me ? 'You' : partnerName} size={64} />
                  <span>{uid === me ? 'Me' : partnerName}</span>
                </button>
              );
            })}
          </div>
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
