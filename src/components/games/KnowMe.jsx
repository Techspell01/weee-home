import { knowScores, knowSubject, opponentOf } from '../../lib/games.js';
import { splitOption } from './GameBits.jsx';

const answer = (q, k) => (q ? q[k === 'a' ? 0 : 1] : '');

// How Well Do You Know Me: questions take turns being about each of you.
// The person it's about answers for themselves; the other one guesses.
export default function KnowMe({ g, me, partnerName, actions, myPicks }) {
  const other = opponentOf(g, me);
  const qs = g.state?.questions || [];
  const total = qs.length || 10;
  const rounds = g.state?.rounds || [];
  const picked = g.state?.picked || [];
  const iPicked = picked.includes(me);
  const theyPicked = picked.includes(other);
  const myPick = myPicks.find(p => p.game_id === g.id && p.round === g.round)?.pick;
  const q = qs[g.round - 1];
  const aboutMe = knowSubject(g, g.round) === me;
  const scores = knowScores(g);

  const verdict = (r, i) => {
    const subject = knowSubject(g, i + 1);
    const guesser = subject === me ? other : me;
    const right = r[subject] === r[guesser];
    const qn = qs[i];
    if (subject === me) {
      return right ? <>{partnerName} knew you'd pick <b>{answer(qn, r[me])}</b> 🧠</>
        : <>{partnerName} guessed <b>{answer(qn, r[other])}</b>, you said <b>{answer(qn, r[me])}</b></>;
    }
    return right ? <>You got it: <b>{answer(qn, r[other])}</b> 🎯</>
      : <>Not quite: {partnerName} said <b>{answer(qn, r[other])}</b></>;
  };

  if (g.status === 'done') {
    return (
      <div className="quiz">
        <div className="tot-summary">
          {qs.map((qn, i) => rounds[i] && (
            <div key={i} className={`tot-row${rounds[i][me] === rounds[i][other] ? ' match' : ''}`}>
              <span className="tot-q">About {knowSubject(g, i + 1) === me ? 'you' : partnerName}: {qn[0]} <i>or</i> {qn[1]}</span>
              <span className="tot-a">{verdict(rounds[i], i)}</span>
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
        <span>🧠 You {scores[me]} · {partnerName} {scores[other]}</span>
      </div>
      {rounds.length > 0 && (
        <div className={`tot-last${rounds[rounds.length - 1][me] === rounds[rounds.length - 1][other] ? ' match' : ''}`} key={rounds.length}>
          {verdict(rounds[rounds.length - 1], rounds.length - 1)}
        </div>
      )}

      {q && (
        <>
          <div className={`km-prompt ${aboutMe ? 'me' : 'them'}`} key={`p${g.round}`}>
            {aboutMe ? <>About <b>you</b>: which is more you?</> : <>What would <b>{partnerName}</b> pick?</>}
          </div>
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
        </>
      )}

      <p className="tot-wait">
        {iPicked ? <>Waiting for {partnerName}<span className="wait-dots" aria-hidden="true"><i /><i /><i /></span></>
          : theyPicked ? `${partnerName} has answered. Your turn.`
          : aboutMe ? `${partnerName} is guessing your answer.` : `${partnerName} is answering for themselves.`}
      </p>
    </div>
  );
}
