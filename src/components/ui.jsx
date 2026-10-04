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
  pantry: () => svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M5 10h14M5 15h14" /></>, 22, { strokeWidth: 2 }),
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
