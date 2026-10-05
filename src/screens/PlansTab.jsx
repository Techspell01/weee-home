import { useEffect, useRef, useState } from 'react';
import { KINDS, MY_KINDS, TOGETHER_KINDS, dayStrip, dayTitle, formatTime, mapLink, monthCells, sortPlans, timeRange, toDateString, untilLabel, whenLabel } from '../lib/plans.js';
import { BigValue, ConfirmButton, Empty, Icon, Ring } from '../components/ui.jsx';
import { haptic } from '../lib/haptics.js';
import Countdowns from '../components/Countdowns.jsx';

const IDEAS = 'ideas';

function blank(day, whose = 'together') {
  return { whose, title: '', kind: whose === 'me' ? 'work' : 'date', plan_date: day === IDEAS ? '' : day, plan_time: '', end_time: '', place: '', notes: '' };
}

export default function PlansTab({ hh, actions, nameOf, notify, me, now }) {
  const today = toDateString(new Date(now));
  const [day, setDay] = useState(today);
  const [draft, setDraft] = useState(() => blank(today));
  const [editingId, setEditingId] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const formRef = useRef(null);
  const stripTick = useRef(0);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  // Moving to another day starts a fresh form for that day (unless editing).
  useEffect(() => { if (!editingId) setDraft(d => ({ ...blank(day, d.whose), title: d.title })); }, [day]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = hh.plans.filter(p => !p.done);
  const done = hh.plans.filter(p => p.done).sort((a, b) => Date.parse(b.done_at || 0) - Date.parse(a.done_at || 0));
  const strip = dayStrip(now, 21);
  const busyDays = new Set(open.map(p => p.plan_date).filter(Boolean));
  const ideas = open.filter(p => !p.plan_date).sort(sortPlans);
  const onDay = open.filter(p => p.plan_date === day).sort(sortPlans);
  const together = onDay.filter(p => !p.owner);
  const people = [...hh.members].sort((a, b) => (a.user_id === me ? -1 : b.user_id === me ? 1 : 0));
  const comingUp = open.filter(p => !p.owner && p.plan_date && p.plan_date >= today && p.plan_date !== day).sort(sortPlans).slice(0, 6);
  const canEdit = p => !p.owner || p.owner === me;

  // ---- summary tiles ----
  const ours = p => !p.owner || p.owner === me;
  const todays = hh.plans.filter(p => p.plan_date === today && ours(p));
  const todaysDone = todays.filter(p => p.done).length;
  const nowD = new Date(now);
  const nowHM = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
  const next = open.filter(p => ours(p) && p.plan_date && (p.plan_date > today || (p.plan_date === today && (!p.plan_time || p.plan_time.slice(0, 5) >= nowHM)))).sort(sortPlans)[0];
  const nextBig = !next ? { value: '–' }
    : next.plan_time ? (([t, ap]) => ({ value: t, unit: ap }))(formatTime(next.plan_time).split(' '))
    : { value: Number(next.plan_date.slice(8)), unit: new Date(next.plan_date + 'T00:00').toLocaleDateString('en-IN', { month: 'short' }) };
  const months = [0, 1, 2].map(k => {
    const d = new Date(nowD.getFullYear(), nowD.getMonth() + k, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-IN', { month: 'short' }), cells: monthCells(d.getFullYear(), d.getMonth()) };
  });
  const lastDay = months[2].cells[months[2].cells.length - 1];
  const planDays = new Set(open.filter(ours).map(p => p.plan_date).filter(Boolean));
  const ahead = open.filter(p => ours(p) && p.plan_date && p.plan_date >= today && p.plan_date <= lastDay);
  const aheadDays = new Set(ahead.map(p => p.plan_date)).size;
  const daysInView = months.flatMap(m => m.cells).filter(c => c && c >= today).length;

  // header "+" jumps to the add form
  const titleRef = useRef(null);
  useEffect(() => {
    const open = () => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => titleRef.current?.focus(), 400); };
    window.addEventListener('weee:add', open);
    return () => window.removeEventListener('weee:add', open);
  }, []);

  function startEdit(p) {
    setEditingId(p.id);
    setDraft({ whose: p.owner ? 'me' : 'together', title: p.title, kind: p.kind, plan_date: p.plan_date || '', plan_time: (p.plan_time || '').slice(0, 5), end_time: (p.end_time || '').slice(0, 5), place: p.place, notes: p.notes });
    setShowMore(Boolean(p.notes));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function reset() { setDraft(blank(day, draft.whose)); setEditingId(null); setShowMore(false); }
  function chooseWhose(whose) {
    const kinds = whose === 'me' ? MY_KINDS : TOGETHER_KINDS;
    setDraft(d => ({ ...d, whose, kind: kinds.includes(d.kind) ? d.kind : kinds[0], plan_date: whose === 'me' && !d.plan_date ? (day === IDEAS ? today : day) : d.plan_date }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    if (draft.whose === 'me' && !draft.plan_date) { notify('Pick a date for your schedule'); return; }
    if (draft.end_time && !draft.plan_time) { notify('Add a start time too'); return; }
    const row = {
      title: draft.title.trim(),
      kind: draft.kind,
      owner: draft.whose === 'me' ? me : null,
      plan_date: draft.plan_date || null,
      plan_time: draft.plan_time || null,
      end_time: draft.plan_time && draft.end_time ? draft.end_time : null,
      place: draft.place.trim(),
      notes: draft.notes.trim(),
    };
    const ok = editingId ? await actions.updatePlan(editingId, row) : await actions.addPlan(row);
    if (ok) {
      notify(editingId ? 'Plan updated' : row.owner ? 'Added to your schedule' : 'Plan added');
      const target = row.plan_date || IDEAS;
      setEditingId(null);
      setShowMore(false);
      setDraft(blank(target, draft.whose));
      setDay(target);
    }
  }

  const row = (p, { showDate = false } = {}) => (
    <div key={p.id} className={`row plan${p.owner ? ' mine' : ''}`}>
      {canEdit(p)
        ? <button className="check" data-haptic="success" onClick={() => actions.togglePlanDone(p)} aria-label={`Mark ${p.title} as done`} />
        : <span className="time-dot" aria-hidden="true" />}
      <div className={`main${canEdit(p) ? '' : ' readonly'}`} {...(canEdit(p) ? { onClick: () => startEdit(p), role: 'button', tabIndex: 0, onKeyDown: e => e.key === 'Enter' && startEdit(p), 'aria-label': `Edit ${p.title}` } : {})}>
        {(showDate || p.plan_time) && <div className="when">{showDate ? whenLabel(p, now) : timeRange(p)}</div>}
        <div className="name"><span className={`tag kind-${p.kind}`}>{KINDS[p.kind]}</span> {p.title}</div>
        {p.place && <div className="meta"><a href={mapLink(p.place)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{p.place}</a></div>}
        {p.notes && <div className="meta">{p.notes}</div>}
      </div>
      {canEdit(p) && <ConfirmButton label={`Delete ${p.title}`} confirmLabel="Delete?" onConfirm={() => { if (editingId === p.id) reset(); actions.removePlan(p); }}><Icon.trash /></ConfirmButton>}
    </div>
  );

  return (
    <section>
      <div className="bento">
        <button type="button" className="tile" onClick={() => setDay(today)}>
          <Ring value={todaysDone} total={todays.length || 1}>{todays.length - todaysDone}</Ring>
          <div className="tile-title">Today</div>
          <div className="tile-sub">{todays.length ? `${todaysDone} of ${todays.length} done` : 'Nothing planned'}</div>
        </button>
        <button type="button" className="tile" onClick={() => next && setDay(next.plan_date)}>
          <BigValue value={nextBig.value} unit={nextBig.unit} className={next ? '' : 'dim'} />
          <div className="tile-title clamp">{next ? next.title : 'Nothing next'}</div>
          <div className="tile-sub">{next ? `${untilLabel(next, now)}${next.owner ? ' · your schedule' : ''}` : 'Add a plan below'}</div>
        </button>
        <div className="tile wide">
          <div className="dots">
            {months.map(m => (
              <div key={m.key} className="dots-month">
                <div className="dots-label">{m.label}</div>
                <div className="dots-grid">
                  {m.cells.map((c, i) => c === null ? <span key={i} className="dot-cell blank" /> : (
                    <button key={c} type="button" data-haptic="tick" onClick={() => setDay(c)} aria-label={dayTitle(c, now)}
                      className={`dot-cell${planDays.has(c) ? ' has' : ''}${c < today ? ' past' : ''}${c === today ? ' today' : ''}${c === day ? ' sel' : ''}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="tile-foot">
            <Ring value={aheadDays} total={daysInView} size={50}>{ahead.length}</Ring>
            <div>
              <div className="tile-title">{ahead.length === 1 ? '1 plan ahead' : `${ahead.length} plans ahead`}</div>
              <div className="tile-sub">Next three months · yours and together</div>
            </div>
          </div>
        </div>
      </div>

      <Countdowns hh={hh} actions={actions} notify={notify} now={now} />

      <div className="label">Your days</div>
      <div className="strip" role="tablist" aria-label="Choose a day" onScroll={e => {
        // a soft tick for each day that scrolls past, like an iOS picker
        const i = Math.round(e.currentTarget.scrollLeft / 66);
        if (i !== stripTick.current) { stripTick.current = i; haptic('tick'); }
      }}>
        {strip.map(d => (
          <button key={d.value} role="tab" aria-selected={day === d.value} className="strip-day" data-haptic="select" onClick={() => setDay(d.value)}>
            <span className="wd">{d.weekday}</span>
            <span className="dn">{d.day}</span>
            <span className={`busy${busyDays.has(d.value) ? ' on' : ''}`} />
          </button>
        ))}
        <button role="tab" aria-selected={day === IDEAS} className="strip-day ideas" onClick={() => setDay(IDEAS)}>
          <span className="wd">Ideas</span>
          <span className="dn">{ideas.length}</span>
          <span className="busy" />
        </button>
      </div>
      <label className="pick-date">Another date
        <input id="jumpDate" type="date" min={today} value={day !== IDEAS && !strip.some(s => s.value === day) ? day : ''} onChange={e => e.target.value && setDay(e.target.value)} />
      </label>

      {!hh.loaded ? <Empty title="Loading…" /> : day === IDEAS ? (
        <>
          <div className="day-title">Ideas for later</div>
          {ideas.length ? <div className="list">{ideas.map(p => row(p))}</div>
            : <Empty title="No ideas saved">A café you want to try, a trip for someday, a movie to watch together. Add it below without a date.</Empty>}
        </>
      ) : (
        <>
          <div className="day-title">{(([first, ...rest]) => <>{first}{rest.length > 0 && <span className="tone">, {rest.join(', ')}</span>}</>)(dayTitle(day, now).split(', '))}</div>

          <div className="label">Together <span className="count">{together.length}</span></div>
          {together.length ? <div className="list">{together.map(p => row(p))}</div>
            : <p className="none">No plans together on this day.</p>}

          {people.map(m => {
            const items = onDay.filter(p => p.owner === m.user_id);
            return (
              <div key={m.user_id}>
                <div className="label">{m.user_id === me ? 'Your schedule' : `${nameOf(m.user_id)}'s schedule`} <span className="count">{items.length}</span></div>
                {items.length ? <div className="list">{items.map(p => row(p))}</div>
                  : <p className="none">{m.user_id === me ? 'Nothing on your schedule. Add work, appointments or errands below so your partner can see your day.' : `${nameOf(m.user_id)} hasn't added anything for this day.`}</p>}
              </div>
            );
          })}
        </>
      )}

      <div className="label" ref={formRef}>{editingId ? 'Edit plan' : day === IDEAS ? 'Add an idea' : `Add to ${dayTitle(day, now).split(',')[0]}`}</div>
      <form className="form plan-form" onSubmit={submit} autoComplete="off">
        <div className="seg" role="radiogroup" aria-label="Whose plan">
          <button type="button" role="radio" aria-checked={draft.whose === 'together'} onClick={() => chooseWhose('together')}>Together</button>
          <button type="button" role="radio" aria-checked={draft.whose === 'me'} onClick={() => chooseWhose('me')}>My schedule</button>
        </div>
        <input ref={titleRef} id="planTitle" className="title-input" required maxLength={100} value={draft.title} onChange={e => set('title', e.target.value)}
          placeholder={draft.whose === 'me' ? 'Office, meeting with client, gym…' : 'Dinner at Third Wave Coffee'} aria-label="What's the plan?" />
        <div className="kinds" role="radiogroup" aria-label="Type of plan">
          {(draft.whose === 'me' ? MY_KINDS : TOGETHER_KINDS).map(k => (
            <button key={k} type="button" role="radio" aria-checked={draft.kind === k} className={`kind kind-${k}`} onClick={() => set('kind', k)}>{KINDS[k]}</button>
          ))}
        </div>
        <label className="field"><span>Date</span>
          <input id="planDate" type="date" value={draft.plan_date} onChange={e => set('plan_date', e.target.value)} required={draft.whose === 'me'} />
        </label>
        {draft.whose === 'together' && draft.plan_date && (
          <button type="button" className="link" onClick={() => set('plan_date', '')}>No date yet, save as an idea</button>
        )}
        <div className="two">
          <label className="field"><span>Starts (optional)</span><input id="planTime" type="time" value={draft.plan_time} onChange={e => set('plan_time', e.target.value)} /></label>
          <label className="field"><span>Ends (optional)</span><input id="planEnd" type="time" value={draft.end_time} onChange={e => set('end_time', e.target.value)} /></label>
        </div>
        <label className="field"><span>Place (optional)</span><input id="planPlace" maxLength={120} value={draft.place} onChange={e => set('place', e.target.value)} placeholder={draft.whose === 'me' ? 'Office, Whitefield' : 'Indiranagar, Bengaluru'} /></label>
        {showMore
          ? <label className="field"><span>Notes</span><input id="planNotes" maxLength={500} value={draft.notes} onChange={e => set('notes', e.target.value)} placeholder="Book a table for 8 pm" /></label>
          : <button type="button" className="link" onClick={() => setShowMore(true)}>Add a note</button>}
        <div className="stack-row">
          <button className="btn">{editingId ? 'Save changes' : draft.whose === 'me' ? 'Add to my schedule' : draft.plan_date ? 'Add plan' : 'Save idea'}</button>
          {editingId && <button type="button" className="btn ghost" onClick={reset}>Cancel</button>}
        </div>
      </form>

      {comingUp.length > 0 && <>
        <div className="label">Coming up together</div>
        <div className="list">
          {comingUp.map(p => (
            <button key={p.id} className="row upcoming" onClick={() => setDay(p.plan_date)}>
              <div className="main">
                <div className="when">{whenLabel(p, now)}</div>
                <div className="name"><span className={`tag kind-${p.kind}`}>{KINDS[p.kind]}</span> {p.title}</div>
              </div>
            </button>
          ))}
        </div>
      </>}

      {done.length > 0 && <>
        <div className="label">Done <span className="count">{done.length}</span>
          <button type="button" className="btn ghost small push" onClick={() => setShowDone(s => !s)}>{showDone ? 'Hide' : 'Show'}</button>
        </div>
        {showDone && <div className="list">
          {done.slice(0, 30).map(p => (
            <div key={p.id} className="row done">
              {canEdit(p)
                ? <button className="check on" onClick={() => actions.togglePlanDone(p)} aria-label={`Mark ${p.title} as not done`}><Icon.check /></button>
                : <span className="time-dot" aria-hidden="true" />}
              <div className="main">
                <div className="name">{p.title}</div>
                <div className="meta">{whenLabel(p, now)}{p.owner && ` · ${p.owner === me ? 'your' : `${nameOf(p.owner)}'s`} schedule`}</div>
              </div>
              {canEdit(p) && <ConfirmButton label={`Delete ${p.title}`} confirmLabel="Delete?" onConfirm={() => actions.removePlan(p)}><Icon.trash /></ConfirmButton>}
            </div>
          ))}
        </div>}
      </>}
    </section>
  );
}
