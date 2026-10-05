import { useState } from 'react';
import { BigValue, ConfirmButton, Icon } from './ui.jsx';
import { countdownInfo, ordinal, sortCountdowns } from '../lib/countdown.js';
import { toDateString } from '../lib/plans.js';

const SUGGESTIONS = [
  { title: 'Our anniversary', yearly: true },
  { title: 'Birthday', yearly: true },
  { title: 'Trip', yearly: false },
  { title: 'Interview', yearly: false },
];

const dateLabel = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

// Countdown tiles for the Plans tab: "12 days · Anniversary".
export default function Countdowns({ hh, actions, notify, now }) {
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState(null);
  const [draft, setDraft] = useState({ title: '', date: '', yearly: false });
  const list = sortCountdowns(hh.countdowns, now).filter(({ info }) => !info.past || info.days >= -7); // past one-offs fade after a week

  async function save(e) {
    e.preventDefault();
    if (!draft.title.trim() || !draft.date) return;
    const ok = await actions.addCountdown({ title: draft.title.trim(), date: draft.date, yearly: draft.yearly });
    if (ok) {
      const { days } = countdownInfo({ date: draft.date, yearly: draft.yearly }, Date.now());
      notify(days === 0 ? `${draft.title.trim()} is today 🎉` : `${days} days to go`);
      setDraft({ title: '', date: '', yearly: false });
      setAdding(false);
    }
  }

  return (
    <>
      <div className="label">Countdowns <span className="count">{list.length || ''}</span>
        <button type="button" className="btn ghost small push" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : <><Icon.plus /> New</>}</button>
      </div>

      {adding && (
        <form className="form cd-form" onSubmit={save} autoComplete="off">
          <div className="chips">
            {SUGGESTIONS.map(s => (
              <button key={s.title} type="button" className={`qd${draft.title === s.title ? ' on' : ''}`}
                onClick={() => setDraft(d => ({ ...d, title: s.title, yearly: s.yearly }))}>{s.title}</button>
            ))}
          </div>
          <input id="cdTitle" className="title-input" required maxLength={60} value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Goa trip, her birthday…" aria-label="Countdown name" />
          <label className="field"><span>{draft.yearly ? 'The original date (e.g. the day you met)' : 'Date'}</span>
            <input id="cdDate" type="date" required value={draft.date} max={draft.yearly ? toDateString(new Date()) : undefined} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} />
          </label>
          <label className="toggle-row"><span className="grow"><b>Repeats every year</b><span className="meta block">For anniversaries and birthdays. Shows which one it is, like "3rd".</span></span>
            <input id="cdYearly" type="checkbox" role="switch" checked={draft.yearly} onChange={e => setDraft(d => ({ ...d, yearly: e.target.checked }))} />
          </label>
          <button className="btn">Start countdown</button>
        </form>
      )}

      <div className="cd-strip">
        {list.length === 0 && !adding && (
          <button type="button" className="cd-tile empty-cd" onClick={() => setAdding(true)}>
            <span className="cd-plus"><Icon.plus /></span>
            <div className="tile-title">Add a countdown</div>
            <div className="tile-sub">Anniversary, birthday, a trip</div>
          </button>
        )}
        {list.map(({ c, info }) => (
          <div key={c.id} role="button" tabIndex={0} className={`cd-tile${info.days === 0 ? ' today' : ''}${info.past ? ' past' : ''}`}
            onClick={() => setPicked(p => (p === c.id ? null : c.id))} onKeyDown={e => e.key === 'Enter' && setPicked(p => (p === c.id ? null : c.id))}>
            {info.days === 0
              ? <div className="cd-today"><span className="sparkles" aria-hidden="true" />Today</div>
              : <BigValue value={Math.abs(info.days)} unit={Math.abs(info.days) === 1 ? 'day' : 'days'} />}
            <div className="tile-title clamp">{c.title}</div>
            <div className="tile-sub">
              {info.past ? `${-info.days} days ago` : info.days === 0 ? 'Celebrate 🎉' : dateLabel(info.date)}
              {c.yearly && info.years > 0 ? ` · ${ordinal(info.years)}` : ''}
            </div>
            {picked === c.id && (
              <div className="cd-actions" onClick={e => e.stopPropagation()}>
                <ConfirmButton className="btn danger small" label={`Delete ${c.title}`} confirmLabel="Tap to delete" onConfirm={() => { setPicked(null); actions.removeCountdown(c); }}><Icon.trash /> Delete</ConfirmButton>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
