import { useRef, useState } from 'react';
import { ConfirmButton, Icon, Sheet } from './ui.jsx';
import { EMOJI_IDEAS, MAX_CUSTOM, NOTES, NOTE_KINDS, TEXT_IDEAS, noteFor, sentCounts } from '../lib/notes.js';
import { haptic } from '../lib/haptics.js';
import { ago } from '../lib/time.js';

// One-tap love notes on the home screen: the four built-in ones, your own
// ("Baby 🥰"), and how many times you've sent each one.
export default function LoveNotes({ hh, actions, notify, nameOf, me, now }) {
  const [pop, setPop] = useState({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ emoji: EMOJI_IDEAS[0], text: '' });
  const [saving, setSaving] = useState(false);
  const press = useRef({ timer: 0, long: false });

  const others = hh.members.filter(m => m.user_id !== me);
  const sendTo = others.length === 1 ? others[0].display_name : others.length ? 'everyone' : null;
  const lastGot = hh.nudges.find(n => n.from_user !== me && now - Date.parse(n.created_at) < 86400000);
  const counts = sentCounts(hh.counts, me);
  const mine = hh.loveNotes.filter(n => n.created_by === me);
  const full = mine.length >= MAX_CUSTOM;
  const tiles = [
    ...NOTE_KINDS.map(k => ({ key: k, kind: k, emoji: NOTES[k].emoji, label: NOTES[k].label, sent: NOTES[k].sent })),
    ...mine.map(n => ({ key: `custom:${n.id}`, kind: 'custom', id: n.id, emoji: n.emoji, label: n.text, sent: `"${n.text}" sent ${n.emoji}` })),
  ];
  const times = n => `${n} ${n === 1 ? 'time' : 'times'}`;

  async function send(t) {
    if (press.current.long) { press.current.long = false; return; } // that was a hold, not a tap
    if (await actions.sendNudge(t.kind, t.id || null)) {
      setPop(p => ({ ...p, [t.key]: (p[t.key] || 0) + 1 }));
      notify(t.sent);
    }
  }

  // Hold one of your own notes to manage them.
  const stopHold = () => clearTimeout(press.current.timer);
  const holdProps = t => (t.id ? {
    onPointerDown: () => {
      press.current.long = false;
      stopHold();
      press.current.timer = setTimeout(() => { press.current.long = true; haptic('select'); setEditing(true); }, 550);
    },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
    onContextMenu: e => e.preventDefault(),
  } : {});

  async function save(e) {
    e.preventDefault();
    const text = draft.text.trim();
    const emoji = draft.emoji.trim() || '💌';
    if (!text || full) return;
    setSaving(true);
    if (await actions.addLoveNote({ emoji, text })) {
      notify(`Added "${text}" ${emoji}`);
      setDraft(d => ({ ...d, text: '' }));
    }
    setSaving(false);
  }

  return (
    <>
      <div className="notes-card">
        <div className="notes-head">
          <span className="notes-title">{sendTo ? `Send to ${sendTo}` : 'Love notes'}</span>
          {lastGot
            ? <span className="notes-got">{noteFor(lastGot).emoji} from {nameOf(lastGot.from_user)} · {ago(lastGot.created_at, now)}</span>
            : !sendTo && <span className="notes-got">Invite your partner from Settings</span>}
        </div>
        <div className="notes-grid">
          {tiles.map(t => (
            <button key={`${t.key}-${pop[t.key] || 0}`} type="button" className={`note-btn note-${t.kind}${pop[t.key] ? ' sent' : ''}`}
              onClick={() => send(t)} {...holdProps(t)}
              aria-label={`Send ${t.label}${counts[t.key] ? `, sent ${times(counts[t.key])}` : ''}`}>
              <span className="note-emoji" aria-hidden="true">{t.emoji}</span>
              <span className="note-label">{t.label}</span>
              <span className="note-count" aria-hidden="true">{counts[t.key] ? `${counts[t.key].toLocaleString('en-IN')} sent` : ''}</span>
            </button>
          ))}
          <button type="button" className="note-btn note-add" onClick={() => setEditing(true)} aria-label="Add your own note">
            <span className="note-emoji" aria-hidden="true"><Icon.plus /></span>
            <span className="note-label">Your own</span>
            <span className="note-count" />
          </button>
        </div>
      </div>

      <Sheet open={editing} title="Your love notes" onClose={() => setEditing(false)}>
        <form className="sheet-form" onSubmit={save} autoComplete="off">
          <div className="note-preview" aria-hidden="true">
            <span className="note-preview-emoji">{draft.emoji.trim() || '💌'}</span>
            <span className="note-preview-text">{draft.text.trim() || 'Baby'}</span>
          </div>
          <div className="emoji-pick" role="radiogroup" aria-label="Emoji">
            {EMOJI_IDEAS.map(e => (
              <button key={e} type="button" role="radio" aria-checked={draft.emoji === e} className="emoji-opt"
                onClick={() => setDraft(d => ({ ...d, emoji: e }))}>{e}</button>
            ))}
            <input className="emoji-own" value={EMOJI_IDEAS.includes(draft.emoji) ? '' : draft.emoji} maxLength={8}
              onChange={e => setDraft(d => ({ ...d, emoji: e.target.value }))} placeholder="Any" aria-label="Or type any emoji" />
          </div>
          <input id="noteText" className="title-input" maxLength={40} value={draft.text}
            onChange={e => setDraft(d => ({ ...d, text: e.target.value }))} placeholder="Baby, Good night, a nickname…" aria-label="Your note" />
          <div className="chips">
            {TEXT_IDEAS.map(t => (
              <button key={t} type="button" className={`qd${draft.text === t ? ' on' : ''}`} onClick={() => setDraft(d => ({ ...d, text: t }))}>{t}</button>
            ))}
          </div>
          <button className="btn" disabled={saving || full || !draft.text.trim()}>
            {full ? `You have ${MAX_CUSTOM}. Remove one to add another` : saving ? 'Adding…' : 'Add note'}
          </button>
          <p className="meta">Only the two of you can see these. When you send one, {sendTo || 'your partner'} gets a notification with your words. Hold one of your notes on the home screen to come back here.</p>
        </form>

        {mine.length > 0 && <>
          <div className="label">Your notes <span className="count">{mine.length} of {MAX_CUSTOM}</span></div>
          <div className="list">
            {mine.map(n => (
              <div key={n.id} className="row">
                <span className="note-emoji small" aria-hidden="true">{n.emoji}</span>
                <div className="main">
                  <div className="name">{n.text}</div>
                  <div className="meta">{counts[`custom:${n.id}`] ? `Sent ${times(counts[`custom:${n.id}`])}` : 'Not sent yet'}</div>
                </div>
                <ConfirmButton label={`Remove ${n.text}`} onConfirm={() => actions.removeLoveNote(n)}><Icon.trash /></ConfirmButton>
              </div>
            ))}
          </div>
        </>}
      </Sheet>
    </>
  );
}
