import { useEffect, useState } from 'react';
import { SPEND_CATEGORIES, guessExpenseCategory, monthKey, monthLabel, rupees, settlements, shiftMonth, spending } from '../lib/money.js';
import { ago } from '../lib/time.js';
import { ConfirmButton, Icon } from '../components/ui.jsx';

export default function MoneyTab({ hh, actions, nameOf, me, notify, now }) {
  const memberIds = hh.members.map(m => m.user_id);
  const [month, setMonth] = useState(() => monthKey(now));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('other');
  const [categoryPicked, setCategoryPicked] = useState(false);
  const [paidBy, setPaidBy] = useState(me);
  const [split, setSplit] = useState(null); // null = everyone

  useEffect(() => { setSplit(s => (s ? s.filter(id => memberIds.includes(id)) : s)); }, [memberIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = split ?? memberIds;
  const toggle = id => setSplit(chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id]);
  const owed = settlements(hh.expenses, memberIds);
  const spent = spending(hh.expenses, month);
  const top = spent.categories[0]?.amount || 1;
  const isCurrentMonth = month === monthKey(now);
  const history = hh.expenses.filter(e => monthKey(e.created_at) === month)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  function describe(v) {
    setDescription(v);
    if (!categoryPicked) setCategory(guessExpenseCategory(v));
  }

  async function submit(e) {
    e.preventDefault();
    const amt = Math.round(parseFloat(amount) * 100) / 100;
    if (!(amt > 0)) return;
    if (!chosen.length) { notify('Pick at least one person to split with'); return; }
    const ok = await actions.addExpense({ description: description.trim() || SPEND_CATEGORIES[category], amount: amt, category, paidBy: paidBy || me, splitWith: chosen });
    if (ok) {
      setDescription(''); setAmount(''); setCategory('other'); setCategoryPicked(false);
      setMonth(monthKey(Date.now()));
    }
  }

  return (
    <section>
      <h2>Money</h2>
      <p className="sub">See where your money goes each month, and who owes whom.</p>

      <div className="spend">
        <div className="spend-head">
          <button className="icon" data-haptic="select" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Previous month"><Icon.back /></button>
          <div className="grow center">
            <div className="meta">{monthLabel(month)}</div>
            <div className="amt">{rupees(spent.total)}</div>
            <div className="meta">{isCurrentMonth ? 'spent so far this month' : 'spent'}</div>
          </div>
          <button className="icon flip" data-haptic="select" onClick={() => setMonth(m => shiftMonth(m, 1))} disabled={isCurrentMonth} aria-label="Next month"><Icon.back /></button>
        </div>
        {spent.categories.length === 0 ? (
          <p className="meta center">No spending recorded in {monthLabel(month)}. Add an expense below and it appears here.</p>
        ) : (
          <div className="cats">
            {spent.categories.map(c => (
              <div key={c.key} className="cat">
                <div className="cat-row">
                  <span className={`dotc spend-${c.key}`} />
                  <span className="grow">{SPEND_CATEGORIES[c.key] || 'Other'}</span>
                  <span className="money">{rupees(c.amount)}</span>
                  <span className="pct">{Math.round((c.amount / spent.total) * 100)}%</span>
                </div>
                <div className="bar"><i className={`spend-${c.key}`} style={{ width: `${(c.amount / top) * 100}%` }} /></div>
              </div>
            ))}
            {Object.keys(spent.byPayer).length > 1 && (
              <p className="meta paid-by">
                {Object.entries(spent.byPayer).sort((a, b) => b[1] - a[1]).map(([id, amt]) => `${nameOf(id)} paid ${rupees(amt)}`).join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="label">Balance</div>
      {owed.length === 0 ? (
        <div className="bal"><div><div className="amt small">All square</div><div className="meta">Nobody owes anything right now.</div></div></div>
      ) : owed.map(o => (
        <div key={o.from + o.to} className="bal">
          <div className="main">
            <div className="meta">{nameOf(o.from)} {o.from === me ? 'owe' : 'owes'} {o.to === me ? 'you' : nameOf(o.to)}</div>
            <div className="amt">{rupees(o.amount)}</div>
          </div>
          <button className="btn ghost small" onClick={() => actions.settle(o)}>Mark settled</button>
        </div>
      ))}

      <div className="label">Add an expense</div>
      <form className="form" onSubmit={submit} autoComplete="off">
        <div className="two">
          <label className="field"><span>What for</span><input id="expDesc" required maxLength={80} placeholder="Dinner at Toit" value={description} onChange={e => describe(e.target.value)} /></label>
          <label className="field"><span>Amount (₹)</span><input id="expAmount" type="number" inputMode="decimal" min="0.01" step="0.01" required placeholder="1200" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        </div>
        <div className="field"><span>Category</span>
          <div className="kinds" role="radiogroup" aria-label="Category">
            {Object.entries(SPEND_CATEGORIES).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={category === k} className={`kind spendk spend-${k}`}
                onClick={() => { setCategory(k); setCategoryPicked(true); }}>{label}</button>
            ))}
          </div>
        </div>
        <label className="field"><span>Paid by</span>
          <select id="expPaidBy" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
            {hh.members.map(m => <option key={m.user_id} value={m.user_id}>{nameOf(m.user_id)}</option>)}
          </select>
        </label>
        <div className="field"><span>Split between</span>
          <div className="splits">
            {hh.members.map(m => (
              <label key={m.user_id}><input type="checkbox" checked={chosen.includes(m.user_id)} onChange={() => toggle(m.user_id)} /> {nameOf(m.user_id)}</label>
            ))}
          </div>
        </div>
        <button className="btn">Add expense</button>
      </form>

      {history.length > 0 && <>
        <div className="label">{monthLabel(month)} <span className="count">{history.length}</span></div>
        <div className="list">
          {history.map(e => (
            <div key={e.id} className="row">
              <span className={`dotc spend-${e.is_settlement ? 'settle' : e.category || 'other'}`} aria-hidden="true" />
              <div className="main">
                <div className="name">{e.description}</div>
                <div className="meta">
                  {e.is_settlement
                    ? `${nameOf(e.paid_by)} paid ${nameOf(e.split_with[0])}`
                    : `${SPEND_CATEGORIES[e.category] || 'Other'} · ${nameOf(e.paid_by)} paid · split ${e.split_with.length} ways`} · {ago(e.created_at, now)}
                </div>
              </div>
              <span className="money">{rupees(e.amount)}</span>
              <ConfirmButton label={`Delete ${e.description}`} confirmLabel="Delete?" onConfirm={() => actions.removeExpense(e)}><Icon.trash /></ConfirmButton>
            </div>
          ))}
        </div>
      </>}
    </section>
  );
}
