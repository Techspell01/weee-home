import { cardText, drawCard, finishCard } from '../../lib/games.js';
import { haptic } from '../../lib/haptics.js';

export default function TruthOrDare({ g, me, partnerName, actions }) {
  const st = g.state || {};
  const card = st.card;
  const log = st.log || [];
  const myTurn = g.status === 'active' && g.turn === me;
  const name = uid => (uid === me ? 'You' : partnerName);

  function draw(type) {
    haptic('select');
    actions.playMove(g, drawCard(g, me, type));
  }
  function finish(done) {
    haptic(done ? 'success' : 'light');
    actions.playMove(g, finishCard(g, me, done));
  }

  return (
    <div className="tod">
      {g.status === 'active' && (card ? (
        <div className={`tod-card ${card.type}`} key={`${card.type}${card.i}`}>
          <span className="tod-type">{card.type === 'truth' ? 'Truth' : 'Dare'}</span>
          <p className="tod-text">{cardText(card)}</p>
          <span className="tod-for">{card.by === me ? 'For you' : `For ${partnerName}`}</span>
        </div>
      ) : (
        <div className="tod-empty">
          <span className="tod-empty-mark" aria-hidden="true">?</span>
          <p>{myTurn ? 'Truth or dare?' : `${partnerName} is choosing…`}</p>
        </div>
      ))}

      {myTurn && !card && (
        <div className="tod-choose">
          <button type="button" className="tod-pick truth" onClick={() => draw('truth')}>Truth</button>
          <button type="button" className="tod-pick dare" onClick={() => draw('dare')}>Dare</button>
        </div>
      )}
      {myTurn && card && (
        <div className="stack-row center-row">
          <button type="button" className="btn" onClick={() => finish(true)}>Done ✓</button>
          <button type="button" className="btn ghost" onClick={() => finish(false)}>Skip</button>
        </div>
      )}
      {myTurn && card && <p className="hint center">Answer out loud, on a call, or in Chat. Then tap Done.</p>}
      {!myTurn && card && g.status === 'active' && <p className="hint center">{partnerName} is on it. Cheer them on in Chat 💬</p>}

      {log.length > 0 && (
        <div className="tod-log">
          <div className="label">So far</div>
          {log.map((l, i) => (
            <div key={i} className={`tod-row${l.done ? '' : ' skipped'}`}>
              <span className={`tod-tag ${l.type}`}>{l.type === 'truth' ? 'T' : 'D'}</span>
              <span className="tod-row-text"><b>{name(l.by)}</b> {cardText(l)}</span>
              <span className="tod-row-state">{l.done ? '✓' : 'skipped'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
