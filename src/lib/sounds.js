// In-app sounds, synthesised with Web Audio (no audio files).
//   chat   – a soft two-note "pop" for a new message
//   soft   – a quiet tick for a message while the chat is already open
//   heart  – a warm two-beat chime for "thinking of you"
// Phones only allow sound after the person has touched the page, so the audio
// engine is unlocked on the first tap (see unlockAudio in main.jsx). Like other
// app sounds on iPhone, these follow the ring/silent switch.

const STORAGE_KEY = 'weee-sounds';
let ctx = null;

export function soundsEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}
export function setSoundsEnabled(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no audio on this device */ }
}

// A bell-like note: a sine with a quieter octave above, quick attack, soft decay.
function note(freq, at, length, volume) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(volume, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  g.connect(ctx.destination);
  for (const [mult, level] of [[1, 1], [2, 0.28], [3, 0.08]]) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * mult, at);
    og.gain.value = level;
    o.connect(og).connect(g);
    o.start(at);
    o.stop(at + length + 0.05);
  }
}

const PATTERNS = {
  chat: [[988, 0, 0.16, 0.16], [1319, 0.09, 0.22, 0.13]],
  soft: [[1319, 0, 0.12, 0.06]],
  heart: [[523, 0, 0.22, 0.13], [659, 0.16, 0.22, 0.13], [784, 0.62, 0.22, 0.12], [1047, 0.78, 0.5, 0.13]],
};

export function playSound(kind) {
  if (!soundsEnabled()) return;
  unlockAudio();
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.02;
  for (const [freq, offset, length, volume] of PATTERNS[kind] || []) note(freq, t + offset, length, volume);
}
