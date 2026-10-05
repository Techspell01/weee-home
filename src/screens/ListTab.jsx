import { useEffect, useRef, useState } from 'react';
import { CATEGORY_NAMES, CATEGORY_ORDER, itemKey, stockLevel, isRunningLow } from '../lib/groceries.js';
import { ago } from '../lib/time.js';
import { BigValue, ConfirmButton, Empty, Icon, Ring } from '../components/ui.jsx';

export default function ListTab({ hh, actions, nameOf, notify, me, now }) {
  const [text, setText] = useState('');
  const [cost, setCost] = useState('');
  const need = hh.items.filter(i => i.status === 'need');
  const bought = hh.items.filter(i => i.status === 'bought')
    .sort((a, b) => Date.parse(b.bought_at || 0) - Date.parse(a.bought_at || 0));
  const onList = new Set(need.map(i => itemKey(i.name)));
  const low = hh.pantry
    .filter(p => isRunningLow(p, now) && !onList.has(itemKey(p.name)))
    .sort((a, b) => stockLevel(a, now).left - stockLevel(b, now).left);

  const groups = {};
  for (const i of need) (groups[i.category] ??= []).push(i);
  const urgent = need.filter(i => i.urgent).length;
  const trip = need.length + bought.length;
  const newest = [...need].sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at))[0];

  // header "+" jumps to the add box
  const inputRef = useRef(null);
  useEffect(() => {
    const focus = () => { window.scrollTo({ top: 0, behavior: 'smooth' }); inputRef.current?.focus(); };
    window.addEventListener('weee:add', focus);
    return () => window.removeEventListener('weee:add', focus);
  }, []);

  function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    actions.addItems(text);
    setText('');
  }

  async function logCost(e) {
    e.preventDefault();
    const amount = Math.round(parseFloat(cost) * 100) / 100;
    if (!(amount > 0)) return;
    const ok = await actions.addExpense({ description: 'Groceries', amount, category: 'groceries', paidBy: me, splitWith: hh.members.map(m => m.user_id) });
    if (ok) { setCost(''); notify(`Saved ₹${amount} under Groceries in Money`); }
  }

  return (
    <section>
      <div className="bento">
        <div className="tile">
          <BigValue value={need.length} unit={need.length === 1 ? 'item' : 'items'} />
          <div className="tile-title">To buy</div>
          <div className="tile-sub">{urgent ? `${urgent} needed today` : newest ? `${nameOf(newest.added_by)} added ${ago(newest.added_at, now)}` : 'All done'}</div>
        </div>
        <div className="tile">
          <Ring value={bought.length} total={trip}>{bought.length}</Ring>
          <div className="tile-title">In the bag</div>
          <div className="tile-sub">{trip ? `${bought.length} of ${trip} ticked off` : 'Nothing yet'}</div>
        </div>
      </div>

      <form className="add" onSubmit={submit} autoComplete="off">
        <input ref={inputRef} id="addItems" value={text} onChange={e => setText(e.target.value)}
          placeholder="2 kg rice, milk, 6 eggs, coriander" aria-label="Add items" enterKeyHint="done" />
        <button className="btn">Add</button>
      </form>
      <p className="hint">Separate items with commas. Put a quantity before or after the name.</p>

      {low.length > 0 && (
        <div className="low">
          <h3>Running low at home</h3>
          <div className="chips">
            {low.map(p => (
              <button key={p.id} className="chip" onClick={() => actions.addItems(p.name)}>
                + {p.name} <small>{stockLevel(p, now).left === 0 ? 'probably out' : 'only a few left'}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="label">To buy <span className="count">{need.length}</span></div>
      {!hh.loaded ? <Empty title="Loading your list…" /> : need.length === 0 ? (
        <Empty title="Nothing to buy right now">Type items in the box above. Everyone in your household sees them instantly and can tick them off at the shop.</Empty>
      ) : CATEGORY_ORDER.filter(c => groups[c]).map(c => (
        <div key={c}>
          <div className="label minor">{CATEGORY_NAMES[c] || 'Other'}</div>
          <div className="list">
            {groups[c].sort((a, b) => (b.urgent - a.urgent) || Date.parse(a.added_at) - Date.parse(b.added_at)).map(i => (
              <div key={i.id} className={`row${i.urgent ? ' urgent' : ''}`}>
                <button className="check" data-haptic="success" onClick={() => actions.buy(i)} aria-label={`Mark ${i.name} as bought`} />
                <div className="main">
                  <div className="name">{i.name}{i.qty && <span className="qty">{i.qty}</span>}</div>
                  <div className="meta">{i.urgent && <b className="urgent-text">Needed today · </b>}{nameOf(i.added_by)} added {ago(i.added_at, now)}</div>
                </div>
                <button className={`icon star${i.urgent ? ' on' : ''}`} onClick={() => actions.toggleUrgent(i)} aria-label="Needed today" aria-pressed={i.urgent}>{Icon.star(i.urgent)}</button>
                <button className="icon" onClick={() => actions.removeItem(i)} aria-label={`Remove ${i.name}`}><Icon.x /></button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {bought.length > 0 && <>
        <div className="label">Bought <span className="count">{bought.length}</span>
          <ConfirmButton className="btn ghost small push" label="Clear bought items" confirmLabel="Clear all?" onConfirm={actions.clearBought}>Clear</ConfirmButton>
        </div>
        <form className="cost" onSubmit={logCost} autoComplete="off">
          <label htmlFor="shopCost">How much did this shopping cost?</label>
          <div className="cost-row">
            <span className="rupee">₹</span>
            <input id="shopCost" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="1450" value={cost} onChange={e => setCost(e.target.value)} />
            <button className="btn small">Save</button>
          </div>
          <p className="meta">Saved as a Groceries expense paid by you and split with everyone.</p>
        </form>
        <div className="list">
          {bought.slice(0, 40).map(i => (
            <div key={i.id} className="row done">
              <button className="check on" onClick={() => actions.unbuy(i)} aria-label={`Put ${i.name} back on the list`}><Icon.check /></button>
              <div className="main">
                <div className="name">{i.name}{i.qty && <span className="qty">{i.qty}</span>}</div>
                <div className="meta">{nameOf(i.bought_by)} bought it {ago(i.bought_at, now)}</div>
              </div>
              <button className="icon" onClick={() => actions.unbuy(i)} aria-label="Undo"><Icon.undo /></button>
            </div>
          ))}
        </div>
      </>}
    </section>
  );
}
