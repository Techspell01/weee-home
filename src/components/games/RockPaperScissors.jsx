import { RPS, opponentOf, rpsOutcome } from '../../lib/games.js';

export default function RockPaperScissors({ g, me, partnerName, actions, myPicks }) {
  const other = opponentOf(g, me);
  const rounds = g.state?.rounds || [];
  const score = g.state?.score || {};
  const picked = g.state?.picked || [];
  const iPicked = picked.includes(me);
  const theyPicked = picked.includes(other);
  const myPick = myPicks.find(p => p.game_id === g.id && p.round === g.round)?.pick;
  const last = rounds[rounds.length - 1];
  const lastOutcome = last ? rpsOutcome(last[me], last[other]) : 0;

  return (
    <div className="rps">
      <div className="rps-score">
        <b className="me">{score[me] || 0}</b>
        <span>first to {g.state?.target || 10}</span>
        <b className="them">{score[other] || 0}</b>
      </div>

      {last && (
        <div className={`rps-reveal o${lastOutcome}`} key={rounds.length}>
          <span className="rps-hand me">{RPS[last[me]]?.emoji}</span>
          <span className="rps-verdict">{lastOutcome === 1 ? 'You take it' : lastOutcome === -1 ? `${partnerName} takes it` : 'Same pick'}</span>
          <span className="rps-hand them">{RPS[last[other]]?.emoji}</span>
        </div>
      )}

      {g.status === 'active' && (iPicked
        ? (
          <div className="rps-wait">
            <span className="rps-hand mine">{RPS[myPick]?.emoji || '🤫'}</span>
            <p>Waiting for {partnerName}<span className="wait-dots" aria-hidden="true"><i /><i /><i /></span></p>
          </div>
        ) : (
          <div className="rps-pick">
            <p className="rps-prompt">{theyPicked ? `${partnerName} has picked. Your move.` : rounds.length ? `Round ${g.round}. Pick again.` : 'Pick your move'}</p>
            <div className="rps-options">
              {Object.entries(RPS).map(([k, v]) => (
                <button key={k} type="button" className="rps-opt" onClick={() => actions.pick(g, k)}>
                  <span>{v.emoji}</span><small>{v.label}</small>
                </button>
              ))}
            </div>
            <p className="hint center">{partnerName} can't see your pick until you've both picked.</p>
          </div>
        ))}

      {rounds.length > 0 && (
        <div className="rps-history" aria-label="Rounds so far">
          {rounds.map((r, i) => {
            const o = rpsOutcome(r[me], r[other]);
            return <span key={i} className={`rps-chip${o === 1 ? ' won' : o === -1 ? ' lost' : ''}`}>{RPS[r[me]]?.emoji}<i>vs</i>{RPS[r[other]]?.emoji}</span>;
          })}
        </div>
      )}
    </div>
  );
}
