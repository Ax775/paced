/**
 * Aura — generate iOS apple-touch-startup-image PNGs.
 *
 * iOS 16+ leidt de PWA-splash af van `manifest.background_color` plus
 * het maskable icon, maar 13–15 (en sommige third-party browsers) tonen
 * een blanke flits tenzij we expliciete startup-images leveren via
 * `<link rel="apple-touch-startup-image">` met device-specific media
 * queries. Eén script genereert ze allemaal vanuit de canonical SVG.
 *
 * Run:
 *   npm run gen:splash
 *
 * Output:
 *   assets/splash/<width>x<height>.png  voor de gangbare iPhone/iPad
 *   resoluties van iPhone SE 1 t/m iPad Pro 12.9".
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [
  [640,  1136],  // iPhone SE 1
  [750,  1334],  // iPhone 8 / SE 2/3
  [1125, 2436],  // iPhone X / XS / 11 Pro / 12 mini / 13 mini
  [1170, 2532],  // iPhone 12 / 13 / 14
  [1179, 2556],  // iPhone 14 Pro / 15 Pro
  [1242, 2688],  // iPhone XS Max / 11 Pro Max
  [1290, 2796],  // iPhone 14/15 Pro Max
  [1536, 2048],  // iPad Mini / Air
  [1668, 2388],  // iPad Pro 11"
  [2048, 2732],  // iPad Pro 12.9"
];

// Matches manifest.background_color — wat iOS gebruikt achter het icon
// tijdens de splash. Iedere mismatch zorgt voor een zichtbare flits.
const BG = { r: 251, g: 249, b: 243, alpha: 1 }; // #FBF9F3

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const iconPath = resolve(root, 'assets/icon.svg');
const outDir = resolve(root, 'assets/splash');

await mkdir(outDir, { recursive: true });

console.log('🖼  Generating iOS splash images');
console.log('─'.repeat(48));

for (const [w, h] of SIZES) {
  // 30 % van de korte zijde is een rustige logo-grootte — niet zo
  // klein dat het verloren raakt op iPad, niet zo groot dat het
  // schreeuwt op iPhone SE.
  const logoSize = Math.round(Math.min(w, h) * 0.30);

  const logo = await sharp(iconPath, { density: 600 })
    .resize(logoSize, logoSize, { fit: 'contain', background: BG })
    .png()
    .toBuffer();

  const file = resolve(outDir, `${w}x${h}.png`);
  await sharp({
    create: { width: w, height: h, channels: 3, background: BG },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(file);

  process.stdout.write(`  ✓ splash/${w}x${h}.png\n`);
}

console.log('─'.repeat(48));
console.log(`✓ ${SIZES.length} splash images → assets/splash/`);
