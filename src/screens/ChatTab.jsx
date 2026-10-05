import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConfirmButton, Empty, Icon } from '../components/ui.jsx';
import { toDateString, daysUntil } from '../lib/plans.js';
import { visibleMessages } from '../lib/chat.js';

const GROUP_GAP_MS = 5 * 60000;

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

export default function ChatTab({ hh, actions, nameOf, me, now }) {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [, tick] = useState(0);
  const inputRef = useRef(null);
  const firstScroll = useRef(true);
  const msgs = visibleMessages(hh, me);
  const others = hh.members.filter(m => m.user_id !== me);

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
    setText('');
    if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.focus(); }
    await actions.sendMessage(body);
  }

  const items = [];
  msgs.forEach((m, i) => {
    const prev = msgs[i - 1], next = msgs[i + 1];
    const day = dayLabel(m.created_at, now);
    if (!prev || dayLabel(prev.created_at, now) !== day) items.push(<div key={`d-${m.id}`} className="chat-day">{day}</div>);
    const joinsPrev = prev && prev.user_id === m.user_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < GROUP_GAP_MS && dayLabel(prev.created_at, now) === day;
    const joinsNext = next && next.user_id === m.user_id && Date.parse(next.created_at) - Date.parse(m.created_at) < GROUP_GAP_MS && dayLabel(next.created_at, now) === day;
    const mine = m.user_id === me;
    items.push(
      <div key={m.id} className={`msg${mine ? ' mine' : ''}${joinsPrev ? ' joins-prev' : ''}${joinsNext ? ' joins-next' : ''}${m.pending ? ' pending' : ''}`}>
        {!mine && !joinsPrev && others.length > 1 && <div className="msg-who">{nameOf(m.user_id)}</div>}
        <div className={`bubble${selected === m.id ? ' picked' : ''}`} onClick={() => !m.pending && setSelected(s => (s === m.id ? null : m.id))}>{m.body}</div>
        {selected === m.id && (
          <div className="msg-actions">
            <button type="button" className="btn ghost small" onClick={() => { setSelected(null); actions.hideMessage(m); }}><Icon.trash /> Delete for me</button>
            {mine && <ConfirmButton className="btn danger small" label="Unsend for everyone" confirmLabel="Tap to unsend"
              onConfirm={() => { setSelected(null); actions.unsendMessage(m); }}>Unsend for everyone</ConfirmButton>}
          </div>
        )}
        {!joinsNext && (
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
      {!hh.loaded ? <Empty title="Loading…" /> : msgs.length === 0 ? (
        <Empty title="No messages yet">
          {others.length ? `Say hi to ${others.map(o => o.display_name).join(' and ')}. ` : 'Invite your partner from Settings to start chatting. '}
          Messages here are only for your household.
        </Empty>
      ) : <div className="chat-list">{items}</div>}

      {typingNames.length > 0 && <div className="typing"><span className="typing-dots"><i /><i /><i /></span>{typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing</div>}

      <form className="composer" onSubmit={send}>
        <textarea ref={inputRef} id="chatInput" rows={1} value={text} placeholder="Message" enterKeyHint="send" aria-label="Message"
          onChange={e => { setText(e.target.value); grow(e.target); if (e.target.value) hh.sendTyping(); }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="send" disabled={!text.trim()} aria-label="Send" data-haptic="success"><Icon.send /></button>
      </form>
    </section>
  );
}
