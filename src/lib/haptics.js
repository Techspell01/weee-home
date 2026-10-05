// Tap feedback for buttons.
// Android browsers support navigator.vibrate. iPhone Safari does not, but on
// iOS 18+ toggling a hidden <input type="checkbox" switch> gives a system haptic
// tick, so we use that there. In the Android app (Capacitor) this can later
// switch to @capacitor/haptics for richer feedback.

const PATTERNS = {
  tick: 4,                       // scrolling past a day, steppers
  light: 8,                      // any tap
  select: 12,                    // choosing a tab, chip or option
  success: [12, 50, 20],         // saved, ticked off, done
  warn: [25, 40, 25],            // confirming a delete
  error: [30, 60, 30, 60, 30],   // something failed
  notify: [10, 80, 10, 80, 18],  // your partner just added something
};
const STORAGE_KEY = 'homelist-haptics';

const isIOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

let iosSwitch = null;

function iosTick() {
  if (!iosSwitch) {
    iosSwitch = document.createElement('label');
    iosSwitch.setAttribute('aria-hidden', 'true');
    iosSwitch.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    iosSwitch.appendChild(input);
    document.body.appendChild(iosSwitch);
  }
  iosSwitch.click();
}

export function hapticsEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}
export function setHapticsEnabled(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}
export const hapticsSupported = () => isIOS || (typeof navigator !== 'undefined' && 'vibrate' in navigator);

export function haptic(kind = 'light') {
  if (!hapticsEnabled()) return;
  try {
    if (isIOS) iosTick();
    else if (navigator.vibrate) navigator.vibrate(PATTERNS[kind] ?? PATTERNS.light);
  } catch { /* feedback is best-effort */ }
}

// One listener for the whole app: any button tap gets feedback. Buttons can ask
// for a different feel with data-haptic="success" | "warn" | "select".
export function installHaptics() {
  document.addEventListener('click', e => {
    if (iosSwitch && iosSwitch.contains(e.target)) return; // our own iOS tick
    const el = e.target.closest('button, [role="button"], [role="tab"], input[type="checkbox"], select');
    if (!el || el.disabled) return;
    haptic(el.dataset?.haptic || 'light');
  }, true);
}
