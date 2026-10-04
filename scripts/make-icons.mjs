// Renders the app icons in public/ from one SVG. Run with: npm run icons
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const mark = (bg, inset) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${inset ? 0 : 112}" fill="${bg}"/>
  <g transform="translate(${inset ? 96 : 64} ${inset ? 96 : 64}) scale(${inset ? 0.625 : 0.75})">
    <path d="M256 70 L440 220 V430 a20 20 0 0 1 -20 20 H92 a20 20 0 0 1 -20 -20 V220 Z" fill="#F2F5F2"/>
    <path d="M168 300 l60 60 l120 -130" fill="none" stroke="#1D6A51" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="380" cy="150" r="34" fill="#E0A526"/>
  </g>
</svg>`;

const icon = mark('#1D6A51', false);
const maskable = mark('#1D6A51', true);

await writeFile('public/favicon.svg', icon);
for (const [file, svg, size] of [
  ['public/pwa-192.png', icon, 192],
  ['public/pwa-512.png', icon, 512],
  ['public/pwa-maskable-512.png', maskable, 512],
  ['public/apple-touch-icon.png', maskable, 180],
]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log('wrote', file);
}
