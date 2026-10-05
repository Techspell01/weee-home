import { useLayoutEffect, useRef } from 'react';
import { haptic } from '../lib/haptics.js';

// iOS liquid-glass tab bar. At rest the selected tab sits in a clear lens.
// Tapping another tab lifts the lens, stretches it like liquid toward the new
// tab, then squashes and settles. Pressing and sliding along the bar drags the
// lens with your finger (a tick for each tab passed) and drops it where you let go.

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.3, .7, .25, 1)';

export default function TabBar({ tabs, current, onSelect, badges = {} }) {
  const navRef = useRef(null);
  const inRef = useRef(null);
  const pillRef = useRef(null);
  const index = tabs.findIndex(t => t.id === current);
  const prevIndex = useRef(index);
  const drag = useRef(null);
  const skipNext = useRef(false);
  const suppressClick = useRef(false);
  const n = tabs.length;

  const setMoving = on => navRef.current?.classList.toggle('moving', on);

  // Move the lens whenever the selected tab changes.
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const from = prevIndex.current;
    prevIndex.current = index;
    if (!pill) return;
    pill.style.opacity = index < 0 ? '0' : '1';
    if (index < 0) return;
    pill.style.transform = `translateX(${index * 100}%)`;
    if (skipNext.current) { skipNext.current = false; return; } // a drag already animated it
    if (from < 0 || from === index || reduceMotion()) return;

    const dir = Math.sign(index - from);
    const dist = Math.abs(index - from);
    const mid = ((from + index) / 2) * 100;
    setMoving(true);
    const anim = pill.animate([
      { transform: `translateX(${from * 100}%) scale(1, 1)` },
      { transform: `translateX(${from * 100 + dir * 10}%) scale(1.16, 1.14)`, offset: 0.18 },
      { transform: `translateX(${mid}%) scale(${1.15 + 0.32 * dist}, 1.06)`, offset: 0.52 },
      { transform: `translateX(${index * 100 + dir * 4}%) scale(0.92, 1.1)`, offset: 0.8 },
      { transform: `translateX(${index * 100}%) scale(1.03, 0.98)`, offset: 0.92 },
      { transform: `translateX(${index * 100}%) scale(1, 1)` },
    ], { duration: 560 + 90 * (dist - 1), easing: EASE });
    anim.onfinish = anim.oncancel = () => setMoving(false);
  }, [index]);

  // ---- press and slide ----
  function onPointerDown(e) {
    if (index < 0 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const rect = inRef.current.getBoundingClientRect();
    drag.current = { id: e.pointerId, startX: e.clientX, rect, slot: index, active: false, x: 0 };
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.startX;
    if (!d.active) {
      if (Math.abs(dx) < 8) return;
      d.active = true;
      inRef.current.setPointerCapture?.(d.id);
      setMoving(true);
      navRef.current.classList.add('dragging');
    }
    const w = d.rect.width / n;
    const x = Math.max(-w * 0.12, Math.min(w * (n - 1) + w * 0.12, e.clientX - d.rect.left - w / 2));
    d.x = x;
    pillRef.current.style.transform = `translateX(${x}px) scale(1.14, 1.1)`;
    const slot = Math.max(0, Math.min(n - 1, Math.round(x / w)));
    if (slot !== d.slot) { d.slot = slot; haptic('tick'); }
  }

  function onPointerUp(e) {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.active) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    navRef.current.classList.remove('dragging');
    const pill = pillRef.current;
    const end = `translateX(${d.slot * 100}%)`;
    pill.style.transform = end;
    const anim = pill.animate([
      { transform: `translateX(${d.x}px) scale(1.14, 1.1)` },
      { transform: `translateX(${d.slot * 100}%) scale(0.94, 1.06)`, offset: 0.65 },
      { transform: `${end} scale(1, 1)` },
    ], { duration: reduceMotion() ? 1 : 380, easing: EASE });
    anim.onfinish = anim.oncancel = () => setMoving(false);
    const target = tabs[d.slot];
    if (target.id !== current) { skipNext.current = true; haptic('select'); onSelect(target.id); }
  }

  return (
    <nav className="tabs" aria-label="Sections" ref={navRef}>
      <div className="in" role="tablist" ref={inRef} style={{ '--tab-count': n }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <span className="tab-pill" aria-hidden="true" ref={pillRef} />
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={current === t.id} data-haptic="select"
            onClick={() => { if (!suppressClick.current) onSelect(t.id); }}>
            <t.icon />{t.label}
            {badges[t.id] > 0 && <span className="badge">{badges[t.id]}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
