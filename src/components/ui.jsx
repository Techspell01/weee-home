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
  map: () => svg(<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>, 22, { strokeWidth: 2 }),
  plus: () => svg(<path d="M12 5v14M5 12h14" />, 22, { strokeWidth: 2 }),
  locate: () => svg(<><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /><circle cx="12" cy="12" r="7" /></>, 20, { strokeWidth: 1.8 }),
  bell: on => svg(on
    ? <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>
    : <><path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8" /><path d="M10 20.5a2 2 0 0 0 4 0M3 3l18 18" /></>, 18, { strokeWidth: 1.9 }),
  battery: (level, charging) => (
    <svg width="22" height="12" viewBox="0 0 26 14" aria-hidden="true" className="batt">
      <rect x="0.75" y="0.75" width="21.5" height="12.5" rx="3.2" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.5" />
      <rect x="23.4" y="4.5" width="1.9" height="5" rx="0.9" fill="currentColor" fillOpacity=".45" />
      <rect x="2.6" y="2.6" width={Math.max(1.5, 17.8 * (level ?? 0) / 100)} height="8.8" rx="1.8" fill={charging ? '#7DDB9B' : level != null && level <= 20 ? '#FF8A70' : 'currentColor'} />
    </svg>
  ),
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

export function Splash({ text = 'Loading…' }) {
  return <div className="splash"><div className="brand">Weee</div><p>{text}</p></div>;
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
