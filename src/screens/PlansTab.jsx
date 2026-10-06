import { useEffect, useRef, useState } from 'react';
import { KINDS, MY_KINDS, TOGETHER_KINDS, dayStrip, dayTitle, formatTime, mapLink, monthCells, sortPlans, toDateString, untilLabel, whenLabel } from '../lib/plans.js';
import { AvatarStack, BigValue, ConfirmButton, Icon, Sheet } from '../components/ui.jsx';
import { haptic } from '../lib/haptics.js';
import { togetherInfo, togetherSince } from '../lib/together.js';
import { NOTES, NOTE_KINDS } from '../lib/notes.js';
import { ago } from '../lib/time.js';

const IDEAS = 'ideas';

function blank(day, whose = 'together') {
  return { whose, title: '', kind: whose === 'me' ? 'work' : 'date', plan_date: day === IDEAS ? '' : day, plan_time: '', end_time: '', place: '', notes: '' };
}

export default function PlansTab({ hh, actions, nameOf, notify, me, now, household, avatars = {} }) {
  const today = toDateString(new Date(now));
  const [day, setDay] = useState(today);
  const [draft, setDraft] = useState(() => blank(today));
  const [editingId, setEditingId] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showMonth, setShowMonth] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const stripTick = useRef(0);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  // ---- people ----
  const people = [...hh.members].sort((a, b) => (a.user_id === me ? -1 : b.user_id === me ? 1 : 0));
  const person = id => ({ id, name: id === me ? (people.find(m => m.user_id === me)?.display_name || 'You') : nameOf(id), url: avatars[id] });
  const couple = people.map(m => person(m.user_id));
  const tg = togetherInfo(togetherSince(household, hh.countdowns), now);

  // ---- love notes ----
  const [sentPop, setSentPop] = useState({});
  const others = people.filter(m => m.user_id !== me);
  const sendTo = others.length === 1 ? others[0].display_name : others.length ? 'everyone' : null;
  const lastGot = hh.nudges.find(n => n.from_user !== me && now - Date.parse(n.created_at) < 86400000);
  async function sendNote(kind) {
    if (await actions.sendNudge(kind)) {
      setSentPop(p => ({ ...p, [kind]: (p[kind] || 0) + 1 }));
      notify(NOTES[kind].sent);
    }
  }

  // ---- plans ----
  const open = hh.plans.filter(p => !p.done);
  const done = hh.plans.filter(p => p.done).sort((a, b) => Date.parse(b.done_at || 0) - Date.parse(a.done_at || 0));
  const ours = p => !p.owner || p.owner === me;
  const canEdit = p => !p.owner || p.owner === me;
  const strip = dayStrip(now, 21);
  const busyDays = new Set(open.map(p => p.plan_date).filter(Boolean));
  const ideas = open.filter(p => !p.plan_date).sort(sortPlans);
  const onDay = open.filter(p => p.plan_date === day).sort(sortPlans);
  const todayCount = open.filter(p => p.plan_date === today && ours(p)).length;
  const nowD = new Date(now);
  const nowHM = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
  const next = open.filter(p => ours(p) && p.plan_date && (p.plan_date > today || (p.plan_date === today && (!p.plan_time || p.plan_time.slice(0, 5) >= nowHM)))).sort(sortPlans)[0];
  const comingUp = open.filter(p => !p.owner && p.plan_date && p.plan_date > today && p.plan_date !== day).sort(sortPlans).slice(0, 3);
  const months = [0, 1, 2].map(k => {
    const d = new Date(nowD.getFullYear(), nowD.getMonth() + k, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-IN', { month: 'short' }), cells: monthCells(d.getFullYear(), d.getMonth()) };
  });
  const planDays = new Set(open.filter(ours).map(p => p.plan_date).filter(Boolean));

  // header "+" opens a new plan for the selected day
  useEffect(() => {
    const openNew = () => newPlan();
    window.addEventListener('weee:add', openNew);
    return () => window.removeEventListener('weee:add', openNew);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function newPlan(whose = draft.whose) {
    setEditingId(null);
    setShowMore(false);
    setDraft(blank(day, whose));
    setSheet(true);
  }
  function startEdit(p) {
    if (!canEdit(p)) return;
    setEditingId(p.id);
    setDraft({ whose: p.owner ? 'me' : 'together', title: p.title, kind: p.kind, plan_date: p.plan_date || '', plan_time: (p.plan_time || '').slice(0, 5), end_time: (p.end_time || '').slice(0, 5), place: p.place, notes: p.notes });
    setShowMore(Boolean(p.notes));
    setSheet(true);
  }
  function closeSheet() { setSheet(false); setEditingId(null); }
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
      setDay(row.plan_date || IDEAS);
      closeSheet();
    }
  }

  const whoFor = p => (p.owner ? [person(p.owner)] : couple);

  const card = (p, { showDate = false } = {}) => (
    <div key={p.id} className={`agenda-card kind-${p.kind}${canEdit(p) ? '' : ' readonly'}`}>
      {canEdit(p)
        ? <button className="check" data-haptic="success" onClick={() => actions.togglePlanDone(p)} aria-label={`Mark ${p.title} as done`} />
        : <span className="kind-dot" aria-hidden="true" />}
      <div className="agenda-body" role={canEdit(p) ? 'button' : undefined} tabIndex={canEdit(p) ? 0 : undefined}
        onClick={() => startEdit(p)} onKeyDown={e => e.key === 'Enter' && startEdit(p)}>
        <div className="name">{p.title}</div>
        <div className="meta">
          <span className={`tag kind-${p.kind}`}>{KINDS[p.kind]}</span>
          {showDate ? whenLabel(p, now) : p.owner ? `${p.owner === me ? 'Your' : `${nameOf(p.owner)}'s`} schedule` : 'Together'}
          {p.place && <> · <a href={mapLink(p.place)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{p.place}</a></>}
        </div>
        {p.notes && <div className="meta note">{p.notes}</div>}
      </div>
      <AvatarStack people={whoFor(p)} size={26} />
    </div>
  );

  const agenda = onDay.map(p => (
    <div key={p.id} className="agenda-row">
      <div className="agenda-time">
        {p.plan_time ? <><b>{formatTime(p.plan_time)}</b>{p.end_time && <span>{formatTime(p.end_time)}</span>}</> : <span>Any time</span>}
      </div>
      {card(p)}
    </div>
  ));

  return (
    <section className="plans">
      {/* ---- the two of you ---- */}
      <div className={`couple-card${tg?.milestone ? ' milestone' : ''}`}>
        <div className="couple-top">
          <AvatarStack people={couple} size={60} />
          <div className="couple-days">
            {tg ? <>
              <BigValue value={tg.days.toLocaleString('en-IN')} unit={tg.days === 1 ? 'day' : 'days'} />
              <div className="couple-sub">{tg.milestone ? `✨ ${tg.milestone}` : `together${tg.years ? ` · ${tg.years} ${tg.years === 1 ? 'year' : 'years'}` : ''}`}</div>
            </> : <>
              <div className="couple-names">{couple.map(p => p.name).join(' & ')}</div>
              <button type="button" className="link" onClick={() => window.dispatchEvent(new Event('weee:open-settings'))}>Add the day you got together</button>
            </>}
          </div>
        </div>
        <div className="couple-stats">
          <button type="button" className="cs" onClick={() => setDay(today)}>
            <span className="cs-label">Today</span>
            <span className="cs-value">{todayCount ? `${todayCount} ${todayCount === 1 ? 'plan' : 'plans'}` : 'Free'}</span>
          </button>
          <button type="button" className="cs" onClick={() => next && setDay(next.plan_date)}>
            <span className="cs-label">Next{next ? ` · ${untilLabel(next, now)}` : ''}</span>
            <span className="cs-value clamp">{next ? next.title : 'Nothing planned'}</span>
          </button>
        </div>
      </div>

      {/* ---- love notes ---- */}
      <div className="notes-card">
        <div className="notes-head">
          <span className="notes-title">{sendTo ? `Send to ${sendTo}` : 'Love notes'}</span>
          {lastGot
            ? <span className="notes-got">{NOTES[lastGot.kind]?.emoji || '💗'} from {nameOf(lastGot.from_user)} · {ago(lastGot.created_at, now)}</span>
            : !sendTo && <span className="notes-got">Invite your partner from Settings</span>}
        </div>
        <div className="notes-grid">
          {NOTE_KINDS.map(k => (
            <button key={`${k}-${sentPop[k] || 0}`} type="button" className={`note-btn note-${k}${sentPop[k] ? ' sent' : ''}`} onClick={() => sendNote(k)}>
              <span className="note-emoji" aria-hidden="true">{NOTES[k].emoji}</span>
              <span className="note-label">{NOTES[k].label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---- the selected day ---- */}
      <div className="section-head">
        <div className="day-title">
          {day === IDEAS ? 'Ideas for later'
            : (([first, ...rest]) => <>{first}{rest.length > 0 && <span className="tone">, {rest.join(', ')}</span>}</>)(dayTitle(day, now).split(', '))}
        </div>
        <button type="button" className={`icon round-ic${showMonth ? ' on' : ''}`} onClick={() => setShowMonth(s => !s)} aria-label="Month view" aria-pressed={showMonth}><Icon.calendar /></button>
      </div>

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

      {showMonth && (
        <div className="tile wide month-card">
          <div className="dots">
            {months.map(m => (
              <div key={m.key} className="dots-month">
                <div className="dots-label">{m.label}</div>
                <div className="dots-grid">
                  {m.cells.map((c, i) => c === null ? <span key={i} className="dot-cell blank" /> : (
                    <button key={c} type="button" data-haptic="tick" onClick={() => { setDay(c); setShowMonth(false); }} aria-label={dayTitle(c, now)}
                      className={`dot-cell${planDays.has(c) ? ' has' : ''}${c < today ? ' past' : ''}${c === today ? ' today' : ''}${c === day ? ' sel' : ''}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="agenda">
        {!hh.loaded ? <p className="none">Loading…</p>
          : day === IDEAS ? (ideas.length ? ideas.map(p => card(p)) : <p className="agenda-empty">No ideas saved yet. A café to try, a trip for someday, a movie to watch together.</p>)
          : agenda.length ? agenda
          : <p className="agenda-empty">Nothing planned{day === today ? ' today' : ''}. A free day.</p>}
        <button type="button" className="btn ghost add-plan" onClick={() => newPlan()}><Icon.plus /> {day === IDEAS ? 'Add an idea' : 'Add plan'}</button>
      </div>

      {comingUp.length > 0 && <>
        <div className="label">Coming up together</div>
        <div className="list">
          {comingUp.map(p => (
            <button key={p.id} className="row upcoming" onClick={() => setDay(p.plan_date)}>
              <div className="main">
                <div className="when">{whenLabel(p, now)}</div>
                <div className="name">{p.title}</div>
              </div>
              <AvatarStack people={couple} size={24} />
            </button>
          ))}
        </div>
      </>}

      {done.length > 0 && (
        <button type="button" className="link small-link done-link" onClick={() => setShowDone(s => !s)}>{showDone ? 'Hide done' : `Done · ${done.length}`}</button>
      )}
      {showDone && <div className="list">
        {done.slice(0, 30).map(p => (
          <div key={p.id} className="row done">
            {canEdit(p)
              ? <button className="check on" onClick={() => actions.togglePlanDone(p)} aria-label={`Mark ${p.title} as not done`}><Icon.check /></button>
              : <span className="kind-dot" aria-hidden="true" />}
            <div className="main">
              <div className="name">{p.title}</div>
              <div className="meta">{whenLabel(p, now)}</div>
            </div>
          </div>
        ))}
      </div>}

      {/* ---- add / edit ---- */}
      <Sheet open={sheet} title={editingId ? 'Edit plan' : draft.whose === 'me' ? 'Add to my schedule' : 'New plan'} onClose={closeSheet}>
        <form className="plan-form sheet-form" onSubmit={submit} autoComplete="off">
          <div className="seg" role="radiogroup" aria-label="Whose plan">
            <button type="button" role="radio" aria-checked={draft.whose === 'together'} onClick={() => chooseWhose('together')}>Together</button>
            <button type="button" role="radio" aria-checked={draft.whose === 'me'} onClick={() => chooseWhose('me')}>My schedule</button>
          </div>
          <input id="planTitle" className="title-input" required maxLength={100} value={draft.title} onChange={e => set('title', e.target.value)}
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
            <label className="field"><span>Starts</span><input id="planTime" type="time" value={draft.plan_time} onChange={e => set('plan_time', e.target.value)} /></label>
            <label className="field"><span>Ends</span><input id="planEnd" type="time" value={draft.end_time} onChange={e => set('end_time', e.target.value)} /></label>
          </div>
          <label className="field"><span>Place</span><input id="planPlace" maxLength={120} value={draft.place} onChange={e => set('place', e.target.value)} placeholder={draft.whose === 'me' ? 'Office, Whitefield' : 'Indiranagar, Bengaluru'} /></label>
          {showMore
            ? <label className="field"><span>Notes</span><input id="planNotes" maxLength={500} value={draft.notes} onChange={e => set('notes', e.target.value)} placeholder="Book a table for 8 pm" /></label>
            : <button type="button" className="link" onClick={() => setShowMore(true)}>Add a note</button>}
          <div className="stack-row">
            <button className="btn">{editingId ? 'Save changes' : draft.whose === 'me' ? 'Add to my schedule' : draft.plan_date ? 'Add plan' : 'Save idea'}</button>
            {editingId && <ConfirmButton className="btn danger" label="Delete plan" confirmLabel="Tap to delete"
              onConfirm={() => { const p = hh.plans.find(x => x.id === editingId); closeSheet(); if (p) actions.removePlan(p); }}><Icon.trash /> Delete</ConfirmButton>}
          </div>
        </form>
      </Sheet>
    </section>
  );
}
