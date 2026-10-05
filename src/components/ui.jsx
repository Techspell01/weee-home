import { useCallback, useEffect, useRef, useState } from 'react';

const svg = (children, size = 18, extra = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra}>{children}</svg>
);

const STAR = 'M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 2.9 1.1-6.3L2.9 9.5l6.3-.9z';

export const Icon = {
  check: () => svg(<path d="M5 12l5 5L20 7" />, 14, { strokeWidth: 3 }),
  x: () => svg(<path d="M6 6l12 12M18 6L6 18" />, 16),
  undo: () => svg(<><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>, 16),
  star: on => svg(<path d={STAR} />, 18, on ? { fill: 'currentColor', strokeWidth: 1.5 } : { strokeWidth: 2 }),
  gear: () => svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>, 22, { strokeWidth: 1.8 }),
  trash: () => svg(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>, 17, { strokeWidth: 2 }),
  back: () => svg(<path d="M15 18l-6-6 6-6" />, 22),
  calendar: () => svg(<><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M12 13.6l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 15.7l2-.3z" strokeWidth="1.4" /></>, 22, { strokeWidth: 2 }),
  cart: () => svg(<><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" /><circle cx="10" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></>, 22, { strokeWidth: 2 }),
  tracker: () => svg(<><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 2M5 4.5L2.5 7M19 4.5L21.5 7" /></>, 22, { strokeWidth: 2 }),
  briefcase: () => svg(<><rect x="3" y="7.5" width="18" height="12" rx="2.5" /><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M3 13h18" /></>, 20, { strokeWidth: 2 }),
  task: () => svg(<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.3 4.6-4.8" /></>, 20, { strokeWidth: 2 }),
  link: () => svg(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>, 16, { strokeWidth: 2 }),
  heart: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.3-9.6C1.5 7.5 3.6 4.5 6.9 4.5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.3 0 5.4 3 4.2 6.4-1.8 5-9.3 9.6-9.3 9.6z" />
    </svg>
  ),
  reply: () => svg(<path d="M10 8L5 12.5l5 4.5M5.5 12.5H14a5 5 0 0 1 5 5V19" />, 16, { strokeWidth: 2.2 }),
  pin: () => svg(<><path d="M9 4h6l-1 5 3 3v1.5H7V12l3-3z" /><path d="M12 13.5V20" /></>, 15, { strokeWidth: 2 }),
  plus: () => svg(<path d="M12 5v14M5 12h14" />, 22, { strokeWidth: 2 }),
  discover: () => svg(<><circle cx="12" cy="12" r="9" /><path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2z" /></>, 22, { strokeWidth: 2 }),
  chat: () => svg(<path d="M4 11.5a7.5 7 0 0 1 15 0 7.5 7 0 0 1-10.6 6.4L4 19.5l1.4-3.6A6.8 6.8 0 0 1 4 11.5z" />, 22, { strokeWidth: 2 }),
  send: () => svg(<><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>, 20, { strokeWidth: 2.4 }),
  money: () => svg(<path d="M6 4h12M6 9h12M9 4c4 0 6 2 6 5s-2 5-6 5H7l8 7" />, 22, { strokeWidth: 2 }),
};

// A delete button that needs a second tap within 3 seconds.
export function ConfirmButton({ onConfirm, label, confirmLabel = 'Sure?', className = 'icon', children }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`${className}${armed ? ' armed' : ''}`} aria-label={label} data-haptic={armed ? 'warn' : 'select'}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? <span className="armed-text">{confirmLabel}</span> : children}
    </button>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const id = useRef(0);
  const notify = useCallback(text => {
    const key = ++id.current;
    setToasts(t => [...t.slice(-2), { key, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.key !== key)), 3600);
  }, []);
  return [toasts, notify];
}

export function Toasts({ toasts }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => <div key={t.key} className="toast">{t.text}</div>)}
    </div>
  );
}

// Start screen: the app icon's glass lens forms, its rainbow rim lights up,
// and the W draws itself in. (index.html shows the same mark before the app loads.)
export function Splash({ text }) {
  return (
    <div className="splash" style={{ '--elapsed': `${-Math.round(Math.min(performance.now(), 3000))}ms` }}>
      <svg className="splash-mark" viewBox="0 0 200 200" width="132" height="132" aria-hidden="true">
        <defs>
          <linearGradient id="splashRim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff6060" /><stop offset="0.25" stopColor="#ffd65a" />
            <stop offset="0.5" stopColor="#60ffaa" /><stop offset="0.75" stopColor="#5ab4ff" /><stop offset="1" stopColor="#c478ff" />
          </linearGradient>
          <radialGradient id="splashLens" cx="0.5" cy="0.15" r="0.9">
            <stop offset="0" stopColor="#fff" stopOpacity="0.22" /><stop offset="0.6" stopColor="#fff" stopOpacity="0.04" /><stop offset="1" stopColor="#fff" stopOpacity="0.02" />
          </radialGradient>
        </defs>
        <circle className="splash-lens" cx="100" cy="100" r="78" fill="url(#splashLens)" />
        <circle className="splash-rim" cx="100" cy="100" r="77" fill="none" stroke="url(#splashRim)" strokeWidth="3" pathLength="1" />
        <path className="splash-w" d="M60 76 L78 128 L100 92 L122 128 L140 76" fill="none" stroke="#F4F4F5" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
      </svg>
      <div className="splash-name">Weee</div>
      {text && <p className="splash-text">{text}</p>}
    </div>
  );
}

export function Empty({ title, children }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

// Thin circular progress ring (like an activity ring) with a value in the middle.
export function Ring({ value = 0, total = 1, size = 62, stroke = 3, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ring-arc" />
      </svg>
      <span className="ring-value">{children}</span>
    </div>
  );
}

// Big number with a smaller grey unit, e.g. 7 items, 8:30 pm, 82 %.
export function BigValue({ value, unit, className = '' }) {
  return <div className={`big-value ${className}`}>{value}{unit && <span className="unit">{unit}</span>}</div>;
}

// Popup banner that slides down from the top (arrivals, departures, messages).
export function AlertBanner({ alert, onOpen, onClose }) {
  if (!alert) return null;
  const Glyph = alert.kind === 'chat' ? Icon.chat : Icon.tracker;
  return (
    <div className={`alert-banner kind-${alert.kind}`} key={alert.key} role="alert" onClick={onOpen}>
      <span className="alert-icon"><Glyph /></span>
      <span className="alert-text">
        <b>{alert.title}</b>
        {alert.body && <span>{alert.body}</span>}
      </span>
      <button type="button" className="icon alert-close" aria-label="Dismiss" onClick={e => { e.stopPropagation(); onClose(); }}><Icon.x /></button>
    </div>
  );
}

// Full-screen "thinking of you" moment when a heart arrives.
export function HeartOverlay({ heart, onSendBack, onClose }) {
  if (!heart) return null;
  return (
    <div className="heart-overlay" key={heart.key} role="dialog" aria-label={`${heart.from} is thinking of you`} onClick={onClose}>
      <div className="heart-card" onClick={e => e.stopPropagation()}>
        {heart.url && <img className="heart-photo" src={heart.url} alt="" />}
        <span className="big-heart" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="120" height="120" fill="currentColor"><path d="M12 20.5s-7.5-4.6-9.3-9.6C1.5 7.5 3.6 4.5 6.9 4.5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.3 0 5.4 3 4.2 6.4-1.8 5-9.3 9.6-9.3 9.6z" /></svg>
        </span>
        <div className="heart-title">{heart.from} is thinking of you</div>
        <div className="stack-row center-row">
          <button type="button" className="btn" data-haptic="heartbeat" onClick={onSendBack}>Send one back 💗</button>
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// A person's photo, or their initial on a soft circle when there's no photo.
export function Avatar({ url, name, size = 40, className = '' }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <span className={`avatar-img ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-label={name}>
      {url ? <img src={url} alt="" draggable="false" /> : initial}
    </span>
  );
}

// Two (or more) overlapping photos, like a couple's portrait.
export function AvatarStack({ people, size = 56 }) {
  return (
    <span className="avatar-stack" style={{ '--s': `${size}px` }}>
      {people.map(p => <Avatar key={p.id} url={p.url} name={p.name} size={size} />)}
    </span>
  );
}

// Bottom sheet that slides up over the page (forms that used to sit inline).
export function Sheet({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.body.classList.add('sheet-open');
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('sheet-open'); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div className="panel-title">{title}</div>
          <button type="button" className="icon" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
