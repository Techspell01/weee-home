import { useEffect, useRef, useState } from 'react';
import { BigValue, ConfirmButton, Empty, Icon, Ring } from '../components/ui.jsx';
import { KINDS, REPEATS, STAGES, STAGE_LABEL, dueState, fromInputs, quickTimes, toInputs, whenText } from '../lib/tracker.js';
import { formatTime } from '../lib/plans.js';
import { ago } from '../lib/time.js';
import { isSubscribed, pushPermission } from '../lib/push.js';

function blank(now) {
  const d = new Date(now);
  d.setDate(d.getDate() + 3);
  d.setHours(10, 0, 0, 0);
  return { kind: 'job', title: '', details: '', link: '', stage: 'applied', repeat: 3, shared: false, remind: true, ...toInputs(d) };
}

const SECTIONS = [
  ['overdue', 'Due now'],
  ['today', 'Later today'],
  ['upcoming', 'Upcoming'],
  ['none', 'No reminder set'],
];

export default function TrackerTab({ hh, actions, nameOf, notify, me, now }) {
  const [draft, setDraft] = useState(() => blank(now));
  const [editingId, setEditingId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [note, setNote] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [pushReady, setPushReady] = useState(true);
  const formRef = useRef(null);
  const titleRef = useRef(null);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  useEffect(() => {
    if (pushPermission() !== 'granted') { setPushReady(false); return; }
    isSubscribed().then(setPushReady).catch(() => setPushReady(false));
  }, []);

  // header "+" jumps to the form
  useEffect(() => {
    const open = () => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => titleRef.current?.focus(), 400); };
    window.addEventListener('weee:add', open);
    return () => window.removeEventListener('weee:add', open);
  }, []);

  const mine = hh.trackers.filter(t => t.owner === me);
  const theirs = hh.trackers.filter(t => t.owner !== me && !t.done);
  const active = mine.filter(t => !t.done);
  const done = mine.filter(t => t.done);
  const byTime = (a, b) => (a.next_at ? Date.parse(a.next_at) : Infinity) - (b.next_at ? Date.parse(b.next_at) : Infinity) || Date.parse(b.created_at) - Date.parse(a.created_at);
  const groups = {};
  for (const t of [...active].sort(byTime)) (groups[dueState(t, now)] ??= []).push(t);
  const dueNow = groups.overdue?.length || 0;
  const next = [...(groups.today || []), ...(groups.upcoming || [])][0];
  const jobs = mine.filter(t => t.kind === 'job');
  const stageCount = s => jobs.filter(t => t.stage === s).length;

  const nextBig = !next ? { value: '–' } : (() => {
    const d = new Date(next.next_at);
    const [t, ap] = formatTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`).split(' ');
    return dueState(next, now) === 'today' ? { value: t, unit: ap } : { value: d.getDate(), unit: d.toLocaleDateString('en-IN', { month: 'short' }) };
  })();

  function startEdit(t) {
    setEditingId(t.id);
    const at = t.next_at ? new Date(t.next_at) : null;
    setDraft({
      kind: t.kind, title: t.title, details: t.details, link: t.link, stage: t.stage || 'applied',
      repeat: t.repeat_days || null, shared: t.shared, remind: Boolean(at),
      ...(at ? toInputs(at) : toInputs(new Date(now + 3 * 86400000))),
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function reset() { setEditingId(null); setDraft(blank(Date.now())); }

  async function submit(e) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    const next_at = draft.remind ? fromInputs(draft.date, draft.time) : null;
    const row = {
      kind: draft.kind,
      title: draft.title.trim(),
      details: draft.details.trim(),
      link: draft.link.trim(),
      stage: draft.kind === 'job' ? draft.stage : null,
      next_at,
      repeat_days: draft.remind ? draft.repeat : null,
      shared: draft.shared,
    };
    const ok = editingId ? await actions.updateTracker(editingId, row) : await actions.addTracker(row);
    if (ok) {
      notify(editingId ? 'Saved' : next_at ? `Saved. You'll be reminded ${whenText({ next_at }, Date.now()).toLowerCase()}` : 'Saved');
      reset();
    }
  }

  async function followUp(t) {
    if (await actions.followedUp(t, note)) {
      setNote('');
      const n = t.repeat_days ? 'next reminder set' : 'no reminder set; snooze to pick one';
      notify(`Follow-up logged · ${n}`);
    }
  }

  const row = (t, readOnly = false) => {
    const state = dueState(t, now);
    const open = openId === t.id;
    const log = Array.isArray(t.log) ? t.log : [];
    return (
      <div key={t.id} className={`row tracker due-${state}${open ? ' open' : ''}`}>
        <span className="tile-icon small" aria-hidden="true">{t.kind === 'job' ? <Icon.briefcase /> : <Icon.task />}</span>
        <div className="main" role="button" tabIndex={0} onClick={() => setOpenId(open ? null : t.id)} onKeyDown={e => e.key === 'Enter' && setOpenId(open ? null : t.id)}>
          <div className="name">{t.title}</div>
          <div className={`when${state === 'overdue' ? ' late' : ''}`}>{whenText(t, now)}{t.repeat_days ? ` · repeats every ${t.repeat_days} days` : ''}</div>
          <div className="meta">
            {t.kind === 'job' && t.stage && <span className={`tag stage-${t.stage}`}>{STAGE_LABEL[t.stage]}</span>}
            {t.followups ? `Followed up ${t.followups}× · last ${ago(t.last_followup_at, now)}` : 'Not followed up yet'}
            {readOnly && ` · ${nameOf(t.owner)}'s`}
          </div>
          {t.details && <div className="meta details">{t.details}</div>}
        </div>
        {open && !readOnly && (
          <div className="tracker-actions" onClick={e => e.stopPropagation()}>
            <div className="followup-row">
              <input id={`note-${t.id}`} value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional): emailed HR, no reply yet" maxLength={200} />
              <button type="button" className="btn small" data-haptic="success" onClick={() => followUp(t)}><Icon.check /> Followed up</button>
            </div>
            <div className="chips">
              <span className="meta">Snooze:</span>
              {quickTimes(Date.now()).map(q => (
                <button key={q.label} type="button" className="chip" onClick={async () => { if (await actions.snoozeTracker(t, q.at)) notify(`Reminder moved to ${whenText({ next_at: q.at.toISOString() }, Date.now()).toLowerCase()}`); }}>{q.label}</button>
              ))}
            </div>
            {t.kind === 'job' && (
              <div className="chips">
                <span className="meta">Status:</span>
                {STAGES.map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={t.stage === k} className="kind" onClick={() => actions.updateTracker(t.id, { stage: k })}>{label}</button>
                ))}
              </div>
            )}
            <div className="stack-row">
              {t.link && <a className="btn ghost small" href={/^https?:\/\//.test(t.link) ? t.link : `https://${t.link}`} target="_blank" rel="noreferrer"><Icon.link /> Open link</a>}
              <button type="button" className="btn ghost small" onClick={() => startEdit(t)}>Edit</button>
              <button type="button" className="btn ghost small" onClick={() => actions.updateTracker(t.id, { done: !t.done })}>{t.done ? 'Restore' : 'Archive'}</button>
              <ConfirmButton className="btn danger small" label={`Delete ${t.title}`} confirmLabel="Tap to delete" onConfirm={() => { setOpenId(null); actions.removeTracker(t); }}><Icon.trash /> Delete</ConfirmButton>
            </div>
            {log.length > 0 && (
              <div className="visits">
                {log.slice(0, 8).map((l, i) => (
                  <div key={i} className="visit">
                    <span className="visit-who">Followed up</span>
                    <span className="visit-when">{l.note || '—'}</span>
                    <span className="visit-len">{ago(l.at, now)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section>
      <div className="bento">
        <div className="tile">
          <Ring value={dueNow} total={Math.max(active.length, 1)}>{dueNow}</Ring>
          <div className="tile-title">Due now</div>
          <div className="tile-sub">{active.length ? `${active.length} active · ${groups.none?.length || 0} without reminder` : 'Nothing to follow up'}</div>
        </div>
        <div className="tile">
          <BigValue value={nextBig.value} unit={nextBig.unit} className={next ? '' : 'dim'} />
          <div className="tile-title clamp">{next ? next.title : 'No upcoming follow-up'}</div>
          <div className="tile-sub">{next ? whenText(next, now) : 'Add one below'}</div>
        </div>
        {jobs.length > 0 && (
          <div className="tile wide pipeline">
            <div className="tile-title">Job applications</div>
            <div className="pipe">
              {STAGES.map(([k, label]) => (
                <div key={k} className={`pipe-step stage-${k}`}>
                  <BigValue value={stageCount(k)} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!pushReady && (
        <div className="panel push-hint">
          <b>Turn on notifications for reminders</b>
          <span className="meta">Reminders reach you even when Weee is closed, once notifications are on for this phone.</span>
          <button type="button" className="btn ghost small" onClick={() => window.dispatchEvent(new Event('weee:open-settings'))}>Open Settings</button>
        </div>
      )}

      {!hh.loaded ? <Empty title="Loading…" /> : active.length === 0 && theirs.length === 0 ? (
        <><div className="label">Your follow-ups</div>
          <Empty title="Nothing to follow up yet">Add a job you applied for, or anything you need to chase, and pick when to follow up. Weee reminds you at that time, even when the app is closed.</Empty></>
      ) : SECTIONS.filter(([k]) => groups[k]).map(([k, label]) => (
        <div key={k}>
          <div className="label">{label} <span className="count">{groups[k].length}</span></div>
          <div className="list">{groups[k].map(t => row(t))}</div>
        </div>
      ))}

      {theirs.length > 0 && <>
        <div className="label">Shared with you <span className="count">{theirs.length}</span></div>
        <div className="list">{[...theirs].sort(byTime).map(t => row(t, true))}</div>
      </>}

      <div className="label" ref={formRef}>{editingId ? 'Edit follow-up' : 'Add a follow-up'}</div>
      <form className="form plan-form" onSubmit={submit} autoComplete="off">
        <div className="seg" role="radiogroup" aria-label="Type">
          {Object.entries(KINDS).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={draft.kind === k} onClick={() => set('kind', k)}>{label}</button>
          ))}
        </div>
        <input ref={titleRef} id="trackerTitle" className="title-input" required maxLength={100} value={draft.title} onChange={e => set('title', e.target.value)}
          placeholder={draft.kind === 'job' ? 'Infosys · Data Analyst' : 'Pay hostel fee, collect certificate…'} aria-label="What to follow up" />
        <label className="field"><span>{draft.kind === 'job' ? 'Details (recruiter, email, portal)' : 'Details (optional)'}</span>
          <input id="trackerDetails" maxLength={500} value={draft.details} onChange={e => set('details', e.target.value)} placeholder={draft.kind === 'job' ? 'Applied via LinkedIn · HR: priya@infosys.com' : 'Office opens at 10'} />
        </label>
        <label className="field"><span>Link (optional)</span>
          <input id="trackerLink" type="url" inputMode="url" maxLength={500} value={draft.link} onChange={e => set('link', e.target.value)} placeholder="https://careers.example.com/job/123" />
        </label>
        {draft.kind === 'job' && (
          <div className="field"><span>Status</span>
            <div className="kinds">
              {STAGES.map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={draft.stage === k} className="kind" onClick={() => set('stage', k)}>{label}</button>)}
            </div>
          </div>
        )}
        <label className="toggle-row"><span className="grow"><b>Remind me to follow up</b></span>
          <input id="trackerRemind" type="checkbox" role="switch" checked={draft.remind} onChange={e => set('remind', e.target.checked)} />
        </label>
        {draft.remind && <>
          <div className="quick">
            {quickTimes(now).map(q => {
              const v = toInputs(q.at);
              return <button key={q.label} type="button" className={`qd${draft.date === v.date && draft.time === v.time ? ' on' : ''}`} onClick={() => setDraft(d => ({ ...d, ...v }))}>{q.label}</button>;
            })}
          </div>
          <div className="two">
            <label className="field"><span>Date</span><input id="trackerDate" type="date" required value={draft.date} onChange={e => set('date', e.target.value)} /></label>
            <label className="field"><span>Time</span><input id="trackerTime" type="time" required value={draft.time} onChange={e => set('time', e.target.value)} /></label>
          </div>
          <div className="field"><span>After each follow-up</span>
            <div className="kinds">
              {REPEATS.map(([days, label]) => <button key={label} type="button" role="radio" aria-checked={draft.repeat === days} className="kind" onClick={() => set('repeat', days)}>{label}</button>)}
            </div>
          </div>
        </>}
        <label className="toggle-row"><span className="grow"><b>Share with {hh.members.filter(m => m.user_id !== me).map(m => m.display_name).join(' and ') || 'your household'}</b><span className="meta block">Off: only you can see it. Reminders always go only to you.</span></span>
          <input id="trackerShared" type="checkbox" role="switch" checked={draft.shared} onChange={e => set('shared', e.target.checked)} />
        </label>
        <div className="stack-row">
          <button className="btn">{editingId ? 'Save changes' : 'Add follow-up'}</button>
          {editingId && <button type="button" className="btn ghost" onClick={reset}>Cancel</button>}
        </div>
      </form>

      {done.length > 0 && <>
        <div className="label">Archived <span className="count">{done.length}</span>
          <button type="button" className="btn ghost small push" onClick={() => setShowDone(s => !s)}>{showDone ? 'Hide' : 'Show'}</button>
        </div>
        {showDone && <div className="list">{done.map(t => row(t))}</div>}
      </>}
    </section>
  );
}
