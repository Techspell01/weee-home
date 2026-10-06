import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar, ConfirmButton, Empty, Icon } from '../components/ui.jsx';
import { toDateString, daysUntil } from '../lib/plans.js';
import { splitLinks, visibleMessages } from '../lib/chat.js';
import { haptic } from '../lib/haptics.js';

const GROUP_GAP_MS = 5 * 60000;
const EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🙏'];
const SWIPE_TO_REPLY = 56;   // px to the right
const DOUBLE_TAP_MS = 280;

function dayLabel(iso, now) {
  const d = daysUntil(toDateString(new Date(iso)), now);
  if (d === 0) return 'Today';
  if (d === -1) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}
// ✓ sent · ✓✓ delivered (their app has been open since) · blue ✓✓ seen
function Ticks({ state }) {
  const one = 'M3.5 12.5l4 4 8.5-9';
  const two = 'M8.5 12.5l4 4 8.5-9';
  return (
    <svg className={`ticks ${state}`} width="18" height="12" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={state === 'seen' ? 'Seen' : state === 'delivered' ? 'Delivered' : 'Sent'}>
      <path d={one} transform="translate(0 -2)" />
      {state !== 'sent' && <path d={two} transform="translate(0 -2)" />}
    </svg>
  );
}

const timeOf = iso => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
const clip = (s, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export default function ChatTab({ hh, actions, nameOf, notify, me, now, avatars = {} }) {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [burst, setBurst] = useState(null);       // message id showing the double-tap heart
  const [pinIndex, setPinIndex] = useState(0);
  const [sentHeart, setSentHeart] = useState(0);
  const [, tick] = useState(0);
  const inputRef = useRef(null);
  const firstScroll = useRef(true);
  const tap = useRef({ id: null, at: 0, timer: 0 });
  const swipe = useRef(null);
  const msgs = visibleMessages(hh, me);
  const byId = new Map(hh.messages.map(m => [m.id, m]));
  const others = hh.members.filter(m => m.user_id !== me);
  const pinned = msgs.filter(m => m.pinned_at).sort((a, b) => Date.parse(b.pinned_at) - Date.parse(a.pinned_at));
  const pin = pinned[Math.min(pinIndex, pinned.length - 1)];

  // Read receipts: opening the chat (or a new message arriving while it is open) marks it read.
  useEffect(() => {
    if (document.visibilityState === 'visible') actions.markChatRead();
    const onVisible = () => { if (document.visibilityState === 'visible') actions.markChatRead(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [msgs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start at the newest message; follow new ones if already near the bottom.
  useLayoutEffect(() => {
    const nearBottom = window.innerHeight + window.scrollY > document.body.scrollHeight - 220;
    if (firstScroll.current || nearBottom) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: firstScroll.current ? 'auto' : 'smooth' });
      if (msgs.length) firstScroll.current = false;
    }
  }, [msgs.length]);

  // Keep the composer above the iPhone keyboard (and hide the tab bar while typing).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${kb}px`);
      document.body.classList.toggle('kb-open', kb > 120);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.body.classList.remove('kb-open');
      document.documentElement.style.removeProperty('--kb');
    };
  }, []);

  // Tapping a message near the bottom: lift its options above the message box.
  useEffect(() => {
    if (!selected) return;
    const el = document.querySelector(`#msg-${CSS.escape(selected)} .msg-actions`);
    if (!el) return;
    const box = document.querySelector('.composer')?.getBoundingClientRect();
    const limit = (box ? box.top : window.innerHeight) - 12;
    const over = el.getBoundingClientRect().bottom - limit;
    if (over > 0) window.scrollBy({ top: over, behavior: 'smooth' });
  }, [selected]);

  // header trash button asks to clear the chat
  useEffect(() => {
    const ask = () => { setConfirmClear(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    window.addEventListener('weee:clear-chat', ask);
    return () => window.removeEventListener('weee:clear-chat', ask);
  }, []);

  // header "+" focuses the message box
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('weee:add', focus);
    return () => window.removeEventListener('weee:add', focus);
  }, []);

  // "typing…" fades after 4 s, so re-render while someone is typing
  const typingNames = Object.entries(hh.typing).filter(([, t]) => Date.now() - t < 4000).map(([id]) => nameOf(id));
  useEffect(() => {
    if (!typingNames.length) return;
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [typingNames.length]);

  // "Seen" under my latest message once everyone else has read past it
  const lastMine = [...msgs].reverse().find(m => m.user_id === me && !m.pending);
  const seen = lastMine && others.length > 0 && others.every(o => o.chat_read_at && Date.parse(o.chat_read_at) >= Date.parse(lastMine.created_at));
  const tickState = m => {
    const at = Date.parse(m.created_at);
    if (others.length && others.every(o => o.chat_read_at && Date.parse(o.chat_read_at) >= at)) return 'seen';
    if (others.length && others.every(o => hh.online.includes(o.user_id) || (o.last_seen && Date.parse(o.last_seen) >= at))) return 'delivered';
    return 'sent';
  };

  function grow(el) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    const reply = replyTo?.id || null;
    setText('');
    setReplyTo(null);
    if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.focus(); }
    await actions.sendMessage(body, reply);
  }

  async function sendHeart() {
    if (await actions.sendNudge()) {
      setSentHeart(n => n + 1);
      notify(`Heart sent to ${others.map(o => o.display_name).join(' and ') || 'your household'} 💗`);
    }
  }

  function jumpTo(id) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth; // restart the highlight
    el.classList.add('flash');
  }

  // Tap: show actions. Double-tap: ❤️ (with a heart burst).
  function onBubbleTap(m) {
    if (m.pending) return;
    const t = tap.current, at = Date.now();
    if (t.id === m.id && at - t.at < DOUBLE_TAP_MS) {
      clearTimeout(t.timer);
      tap.current = { id: null, at: 0, timer: 0 };
      setBurst(m.id);
      setTimeout(() => setBurst(b => (b === m.id ? null : b)), 750);
      const mineNow = hh.reactions.find(r => r.message_id === m.id && r.user_id === me);
      if (mineNow?.emoji !== '❤️') actions.react(m, '❤️');
      else haptic('select');
      return;
    }
    clearTimeout(t.timer);
    tap.current = { id: m.id, at, timer: setTimeout(() => { setSelected(s => (s === m.id ? null : m.id)); tap.current.id = null; }, DOUBLE_TAP_MS) };
  }

  // Swipe a message to the right to reply to it.
  const onPointerDown = (m, e) => {
    if (m.pending || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swipe.current = { id: m.id, x: e.clientX, y: e.clientY, dx: 0, active: false, el: e.currentTarget, fired: false };
  };
  const onPointerMove = e => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe.current = null; return; } // scrolling
      if (dx < 10) return;
      s.active = true;
    }
    s.dx = Math.max(0, Math.min(90, dx));
    s.el.style.transform = `translateX(${s.dx}px)`;
    s.el.classList.toggle('reply-ready', s.dx >= SWIPE_TO_REPLY);
    if (s.dx >= SWIPE_TO_REPLY && !s.fired) { s.fired = true; haptic('select'); }
  };
  const onPointerUp = () => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !s.active) return;
    s.el.style.transition = 'transform .25s cubic-bezier(.3,.8,.3,1.2)';
    s.el.style.transform = '';
    s.el.classList.remove('reply-ready');
    setTimeout(() => { s.el.style.transition = ''; }, 260);
    if (s.dx >= SWIPE_TO_REPLY) {
      const m = byId.get(s.id);
      if (m) { setReplyTo(m); inputRef.current?.focus(); }
    }
    clearTimeout(tap.current.timer);
    tap.current = { id: null, at: 0, timer: 0 };
  };

  const items = [];
  msgs.forEach((m, i) => {
    const prev = msgs[i - 1], next = msgs[i + 1];
    const day = dayLabel(m.created_at, now);
    if (!prev || dayLabel(prev.created_at, now) !== day) items.push(<div key={`d-${m.id}`} className="chat-day">{day}</div>);
    const joinsPrev = prev && prev.user_id === m.user_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < GROUP_GAP_MS && dayLabel(prev.created_at, now) === day;
    const joinsNext = next && next.user_id === m.user_id && Date.parse(next.created_at) - Date.parse(m.created_at) < GROUP_GAP_MS && dayLabel(next.created_at, now) === day;
    const mine = m.user_id === me;
    const quoted = m.reply_to ? byId.get(m.reply_to) : null;
    const reactions = hh.reactions.filter(r => r.message_id === m.id);
    const counts = EMOJIS.map(e => [e, reactions.filter(r => r.emoji === e)]).filter(([, rs]) => rs.length);
    const myReaction = reactions.find(r => r.user_id === me)?.emoji;

    items.push(
      <div key={m.id} id={`msg-${m.id}`} className={`msg${mine ? ' mine' : ''}${joinsPrev ? ' joins-prev' : ''}${joinsNext && !counts.length ? ' joins-next' : ''}${m.pending ? ' pending' : ''}`}>
        {!mine && !joinsPrev && others.length > 1 && <div className="msg-who">{nameOf(m.user_id)}</div>}
        <div className="swipe" onPointerDown={e => onPointerDown(m, e)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span className="reply-hint" aria-hidden="true"><Icon.reply /></span>
          {!mine && <span className="msg-avatar">{!(joinsNext && !counts.length) && <Avatar url={avatars[m.user_id]} name={nameOf(m.user_id)} size={28} />}</span>}
          <div className={`bubble${selected === m.id ? ' picked' : ''}${m.pinned_at ? ' is-pinned' : ''}`} onClick={() => onBubbleTap(m)}>
            {m.reply_to && (
              <button type="button" className="quote" onClick={e => { e.stopPropagation(); if (quoted) jumpTo(quoted.id); }}>
                <b>{quoted ? (quoted.user_id === me ? 'You' : nameOf(quoted.user_id)) : 'Message'}</b>
                <span>{quoted ? clip(quoted.body, 80) : 'This message was unsent'}</span>
              </button>
            )}
            {m.pinned_at && <span className="pin-mark" aria-label="Pinned"><Icon.pin /></span>}
            {splitLinks(m.body).map((part, i) => part.url
              ? <a key={i} href={part.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{/maps\.google\./.test(part.url) ? 'Open in Maps' : part.url}</a>
              : part.text)}
            {burst === m.id && <span className="heart-burst" aria-hidden="true">❤️</span>}
          </div>
        </div>
        {counts.length > 0 && (
          <button type="button" className="reactions" onClick={() => setSelected(m.id)} aria-label="Reactions">
            {counts.map(([e, rs]) => <span key={e} className={rs.some(r => r.user_id === me) ? 'mine' : ''}>{e}{rs.length > 1 ? ` ${rs.length}` : ''}</span>)}
          </button>
        )}
        {selected === m.id && (
          <div className="msg-actions">
            <div className="emoji-row">
              {EMOJIS.map(e => (
                <button key={e} type="button" className={`emoji${myReaction === e ? ' on' : ''}`} onClick={() => { actions.react(m, e); setSelected(null); }} aria-label={`React ${e}`}>{e}</button>
              ))}
            </div>
            <div className="stack-row">
              <button type="button" className="btn ghost small" onClick={() => { setReplyTo(m); setSelected(null); inputRef.current?.focus(); }}><Icon.reply /> Reply</button>
              <button type="button" className="btn ghost small" onClick={() => { actions.pinMessage(m, !m.pinned_at); setSelected(null); }}><Icon.pin /> {m.pinned_at ? 'Unpin' : 'Pin'}</button>
              <button type="button" className="btn ghost small" onClick={() => { setSelected(null); actions.hideMessage(m); }}><Icon.trash /> Delete for me</button>
              {mine && <ConfirmButton className="btn danger small" label="Unsend for everyone" confirmLabel="Tap to unsend"
                onConfirm={() => { setSelected(null); actions.unsendMessage(m); }}>Unsend</ConfirmButton>}
            </div>
          </div>
        )}
        {(!joinsNext || counts.length > 0) && (
          <div className="msg-time">
            {m.pending ? 'Sending…' : timeOf(m.created_at)}
            {mine && !m.pending && <Ticks state={tickState(m)} />}
            {mine && m.id === lastMine?.id && seen && <span className="seen-label">Seen</span>}
          </div>
        )}
      </div>,
    );
  });

  return (
    <section className="chat">
      {confirmClear && (
        <div className="panel clear-panel">
          <div className="panel-title">Clear this chat?</div>
          <p className="sub tight">All messages are removed for you. {others.length ? `${others.map(o => o.display_name).join(' and ')} keep${others.length === 1 ? 's' : ''} their copy.` : ''}</p>
          <div className="stack-row">
            <button type="button" className="btn danger" onClick={async () => { if (await actions.clearChat()) setConfirmClear(false); }}>Clear chat</button>
            <button type="button" className="btn ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        </div>
      )}

      {pin && (
        <div className="pinned-bar">
          <span className="pin-icon"><Icon.pin /></span>
          <button type="button" className="pinned-text" onClick={() => { jumpTo(pin.id); if (pinned.length > 1) setPinIndex(i => (i + 1) % pinned.length); }}>
            <b>Pinned{pinned.length > 1 ? ` · ${Math.min(pinIndex, pinned.length - 1) + 1}/${pinned.length}` : ''}</b>
            <span>{clip(pin.body, 70)}</span>
          </button>
          <button type="button" className="icon" onClick={() => actions.pinMessage(pin, false)} aria-label="Unpin"><Icon.x /></button>
        </div>
      )}

      {!hh.loaded ? <Empty title="Loading…" /> : msgs.length === 0 ? (
        <Empty title="No messages yet">
          {others.length ? `Say hi to ${others.map(o => o.display_name).join(' and ')}. ` : 'Invite your partner from Settings to start chatting. '}
          Messages here are only for your household.
        </Empty>
      ) : <div className="chat-list">{items}</div>}

      {typingNames.length > 0 && <div className="typing"><span className="typing-dots"><i /><i /><i /></span>{typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing</div>}

      <form className={`composer${replyTo ? ' replying' : ''}`} onSubmit={send}>
        {replyTo && (
          <div className="reply-preview">
            <span className="reply-bar" aria-hidden="true" />
            <span className="reply-text">
              <b>Replying to {replyTo.user_id === me ? 'yourself' : nameOf(replyTo.user_id)}</b>
              <span>{clip(replyTo.body, 80)}</span>
            </span>
            <button type="button" className="icon" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><Icon.x /></button>
          </div>
        )}
        <div className="composer-row">
          <button type="button" key={sentHeart} className={`heart-btn${sentHeart ? ' sent' : ''}`} onClick={sendHeart} aria-label="Send a heart" data-haptic="heartbeat"><Icon.heart /></button>
          <textarea ref={inputRef} id="chatInput" rows={1} value={text} placeholder="Message" enterKeyHint="send" aria-label="Message"
            onChange={e => { setText(e.target.value); grow(e.target); if (e.target.value) hh.sendTyping(); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="send" disabled={!text.trim()} aria-label="Send" data-haptic="success"><Icon.send /></button>
        </div>
      </form>
    </section>
  );
}
