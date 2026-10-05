// Renders the app icons in public/ from one SVG. Run with: npm run icons
// Design: a near-black glass tile with a clear lens and a soft rainbow rim
// (the same lens as the app's tab bar) and a white W for Weee.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

function icon({ rounded, scale }) {
  const s = scale; // lens size relative to the canvas (smaller for maskable safe zone)
  const r = 176 * s;
  const w = 26 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#232327"/><stop offset="1" stop-color="#0A0A0B"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.5" cy="0" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lens" cx="0.5" cy="0.18" r="0.85">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff6060"/><stop offset="0.25" stop-color="#ffd65a"/>
      <stop offset="0.5" stop-color="#60ffaa"/><stop offset="0.75" stop-color="#5ab4ff"/><stop offset="1" stop-color="#c478ff"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${2.2 * s}"/></filter>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${18 * s}"/></filter>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#sheen)"/>
  <circle cx="256" cy="${256 + 14 * s}" r="${r}" fill="#000" opacity="0.55" filter="url(#shadow)"/>
  <circle cx="256" cy="256" r="${r}" fill="url(#lens)"/>
  <circle cx="256" cy="256" r="${r - 2 * s}" fill="none" stroke="url(#rim)" stroke-width="${5 * s}" opacity="0.75" filter="url(#soft)"/>
  <circle cx="256" cy="256" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="${2 * s}"/>
  <ellipse cx="256" cy="${256 - r * 0.74}" rx="${r * 0.46}" ry="${r * 0.1}" fill="#ffffff" opacity="0.09" filter="url(#soft)"/>
  <path d="M ${256 - 92 * s} ${256 - 58 * s} L ${256 - 50 * s} ${256 + 66 * s} L 256 ${256 - 14 * s} L ${256 + 50 * s} ${256 + 66 * s} L ${256 + 92 * s} ${256 - 58 * s}"
    fill="none" stroke="#F4F4F5" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const full = icon({ rounded: true, scale: 1 });
const square = icon({ rounded: false, scale: 1 });     // iOS rounds the corners itself
const maskable = icon({ rounded: false, scale: 0.78 }); // Android crops to a circle/squircle

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
