// Renders the app icons in public/ from one SVG. Run with: npm run icons
// Design: a near-black glass tile with a clear lens and a soft rainbow rim
// (the same lens as the app's tab bar) and a white W for Weee.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

function icon({ rounded, scale }) {
  // The start-screen logo: a glass lens, a crisp rainbow ring and a white W on near-black.
  const r = 182 * scale;           // ring radius on a 512 canvas
  const k = r / 78;                // the start screen draws it at r = 78 on a 200 canvas
  const p = (x, y) => `${(256 + x * k).toFixed(1)} ${(256 + y * k).toFixed(1)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff6060"/><stop offset="0.25" stop-color="#ffd65a"/>
      <stop offset="0.5" stop-color="#60ffaa"/><stop offset="0.75" stop-color="#5ab4ff"/><stop offset="1" stop-color="#c478ff"/>
    </linearGradient>
    <radialGradient id="lens" cx="0.5" cy="0.15" r="0.9">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0.02"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#0A0A0B"/>
  <circle cx="256" cy="256" r="${r}" fill="url(#lens)"/>
  <circle cx="256" cy="256" r="${r - 1.5 * k}" fill="none" stroke="url(#rim)" stroke-width="${3 * k}"/>
  <path d="M ${p(-40, -24)} L ${p(-22, 28)} L ${p(0, -8)} L ${p(22, 28)} L ${p(40, -24)}"
    fill="none" stroke="#F4F4F5" stroke-width="${12 * k}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const full = icon({ rounded: true, scale: 1 });
const square = icon({ rounded: false, scale: 1 });     // iOS rounds the corners itself
const maskable = icon({ rounded: false, scale: 0.86 }); // Android crops to a circle/squircle

await writeFile('public/favicon.svg', full);
for (const [file, svg, size] of [
  ['public/pwa-192.png', full, 192],
  ['public/pwa-512.png', full, 512],
  ['public/pwa-maskable-512.png', maskable, 512],
  ['public/apple-touch-icon.png', square, 180],
]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log('wrote', file);
}
