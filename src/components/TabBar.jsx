import { useLayoutEffect, useRef } from 'react';
import { haptic } from '../lib/haptics.js';

// iOS liquid-glass tab bar. At rest the selected tab sits in a clear lens.
// Tapping another tab moves the lens like a drop of liquid: the leading edge
// springs ahead, the trailing edge follows, so it stretches and then settles.
// Pressing and sliding along the bar drags the lens with your finger.
//
// Smoothness: only `transform` is animated (GPU-composited, no layout or
// re-blur of the bar), from densely sampled keyframes with linear interpolation.
// The lens itself has no blur of its own, so moving it costs the phone nothing.
// About 0.3 s per move, like the iPhone's own tab bar.

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// easing curves (t: 0..1)
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const springOut = t => { // ease-out with a small, soft overshoot
  const c1 = 0.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// Keyframes for moving from slot `from` to slot `to` (units = one tab width).
function liquidFrames(from, to, steps = 30) {
  const d = to - from;
  const frames = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lead = springOut(Math.min(1, t * 1.3));               // front edge: off at once
    const trail = easeOutCubic(Math.max(0, (t - 0.1) / 0.9));  // back edge: a beat behind, then catches up
    let left, right;
    if (d > 0) { right = from + 1 + d * lead; left = from + d * trail; }
    else { left = from + d * lead; right = from + 1 + d * trail; }
    const width = Math.max(0.85, right - left);
    const squash = 1 - Math.min(0.08, (width - 1) * 0.07); // a stretched drop gets a little thinner
    frames.push({ transform: `translateX(${left * 100}%) scale(${width.toFixed(4)}, ${squash.toFixed(4)})`, offset: t });
  }
  return frames;
}

export default function TabBar({ tabs, current, onSelect, badges = {} }) {
  const navRef = useRef(null);
  const inRef = useRef(null);
  const pillRef = useRef(null);
  const anim = useRef(null);
  const index = tabs.findIndex(t => t.id === current);
  const prevIndex = useRef(index);
  const drag = useRef(null);
  const skipNext = useRef(false);
  const suppressClick = useRef(false);
  const n = tabs.length;

  const setMoving = on => navRef.current?.classList.toggle('moving', on);
  const play = (frames, duration) => {
    anim.current?.cancel();
    setMoving(true);
    const a = pillRef.current.animate(frames, { duration, easing: 'linear' });
    anim.current = a;
    a.onfinish = () => { if (anim.current === a) { setMoving(false); anim.current = null; } };
  };

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
    play(liquidFrames(from, index), 300 + 45 * (Math.abs(index - from) - 1));
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- press and slide ----
  function onPointerDown(e) {
    if (index < 0 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { id: e.pointerId, startX: e.clientX, rect: inRef.current.getBoundingClientRect(), slot: index, active: false, x: 0, raf: 0 };
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    if (!d.active) {
      if (Math.abs(e.clientX - d.startX) < 8) return;
      d.active = true;
      inRef.current.setPointerCapture?.(d.id);
      anim.current?.cancel();
      setMoving(true);
      navRef.current.classList.add('dragging');
    }
    const w = d.rect.width / n;
    d.x = Math.max(-w * 0.1, Math.min(w * (n - 1) + w * 0.1, e.clientX - d.rect.left - w / 2));
    if (!d.raf) {
      d.raf = requestAnimationFrame(() => {
        d.raf = 0;
        // grown a little while held; offset keeps it centred under the finger
        pillRef.current.style.transform = `translateX(${d.x - w * 0.04}px) scale(1.08, 1.06)`;
      });
    }
    const slot = Math.max(0, Math.min(n - 1, Math.round(d.x / w)));
    if (slot !== d.slot) { d.slot = slot; haptic('tick'); }
  }

  function onPointerUp(e) {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.active) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    navRef.current.classList.remove('dragging');
    const w = d.rect.width / n;
    const pill = pillRef.current;
    pill.style.transform = `translateX(${d.slot * 100}%)`;
    if (!reduceMotion()) {
      const startPx = d.x - w * 0.04;
      const frames = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20, k = springOut(t);
        const px = startPx + (d.slot * w - startPx) * k;
        const sx = 1.08 + (1 - 1.08) * k, sy = 1.06 + (1 - 1.06) * k;
        frames.push({ transform: `translateX(${px.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`, offset: t });
      }
      play(frames, 280);
    } else setMoving(false);
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
