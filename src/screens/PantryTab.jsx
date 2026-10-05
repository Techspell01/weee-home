import { useState } from 'react';
import { itemKey, parseItem, stockLevel } from '../lib/groceries.js';
import { ago, plural } from '../lib/time.js';
import { ConfirmButton, Empty, Icon } from '../components/ui.jsx';

const TONE_COLOR = { ok: 'var(--accent)', mid: 'var(--muted)', low: 'var(--turmeric)', out: 'var(--warn)' };

export default function PantryTab({ hh, actions, notify, now }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState('');
  const onList = new Set(hh.items.filter(i => i.status === 'need').map(i => itemKey(i.name)));
  const rows = [...hh.pantry].sort((a, b) => (stockLevel(a, now).left ?? 2) - (stockLevel(b, now).left ?? 2));

  function submit(e) {
    e.preventDefault();
    const n = parseItem(name).name;
    if (!n) return;
    const d = parseInt(days, 10);
    actions.recordPurchase(n, d > 0 ? d : null);
    notify(`Tracking ${n}`);
    setName('');
    setDays('');
  }

  return (
    <section>
      <h2>Pantry</h2>
      <p className="sub">Every time you tick something off, Weee learns how long it lasts and warns you before it runs out.</p>

      {!hh.loaded ? <Empty title="Loading…" /> : rows.length === 0 ? (
        <Empty title="Nothing tracked yet">Tick items off the shopping list and they land here on their own. After a few purchases Weee knows milk lasts you 2 days and rice lasts a month.</Empty>
      ) : (
        <div className="list">
          {rows.map(p => {
            const s = stockLevel(p, now);
            const pct = s.left === null ? 0 : Math.round(s.left * 100);
            const learned = (p.purchases?.length ?? 0) >= 3;
            return (
              <div key={p.id} className="stock">
                <div className="top">
                  <div className="main">
                    <div className="name">{p.name}</div>
                    <div className="meta">{p.last_bought && `Bought ${ago(p.last_bought, now)} · `}lasts about {plural(p.lasts_days, 'day')} {learned ? '(learned from your purchases)' : '(estimate)'}</div>
                  </div>
                  <span className={`pill ${s.tone}`}>{s.label}</span>
                </div>
                <div className="bar" role="img" aria-label={`About ${pct}% left`}><i style={{ width: `${pct}%`, background: TONE_COLOR[s.tone] }} /></div>
                <div className="acts">
                  {onList.has(itemKey(p.name))
                    ? <span className="on-list">On the list</span>
                    : <button className="btn small" onClick={() => actions.addItems(p.name)}>Add to list</button>}
                  <button className="btn ghost small" onClick={() => { actions.recordPurchase(p.name); notify(`${p.name} marked as restocked`); }}>Restocked</button>
                  <span className="stepper">lasts
                    <button data-haptic="tick" onClick={() => actions.setLastsDays(p, p.lasts_days - 1)} aria-label="Fewer days">−</button>
                    <b>{p.lasts_days}d</b>
                    <button data-haptic="tick" onClick={() => actions.setLastsDays(p, p.lasts_days + 1)} aria-label="More days">+</button>
                  </span>
                  <ConfirmButton label={`Stop tracking ${p.name}`} confirmLabel="Stop?" onConfirm={() => actions.untrack(p)}><Icon.x /></ConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="label">Track something else</div>
      <form className="form" onSubmit={submit} autoComplete="off">
        <div className="two">
          <label className="field"><span>Item</span><input id="pantryName" required maxLength={80} placeholder="Cooking oil" value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="field"><span>Usually lasts (days)</span><input id="pantryDays" type="number" min="1" max="365" placeholder="30" value={days} onChange={e => setDays(e.target.value)} /></label>
        </div>
        <button className="btn">Bought it today</button>
      </form>
    </section>
  );
}
