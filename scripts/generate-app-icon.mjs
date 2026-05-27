/**
 * Paced — generate the iOS App Store master icon + the PWA icons.
 *
 * Reads assets/icon-only.svg (full-bleed, no rounded corners) and
 * assets/icon.svg (rounded PWA variant) and produces:
 *
 *   assets/icon-only.png         1024×1024, sRGB, NO alpha (App Store master)
 *   assets/icon-192.png            192×192, with rounded corners (PWA)
 *   assets/icon-512.png            512×512, with rounded corners (PWA)
 *   assets/apple-touch-icon-180.png 180×180, with rounded corners (iOS PWA)
 *
 * Run:
 *   npm run gen:icon
 *
 * The 1024 master is what you upload to App Store Connect and what
 * @capacitor/assets reads to generate the full ios/App/App/Assets.xcassets/
 * AppIcon.appiconset/ catalog.
 *
 * Why no alpha on the App Store master:
 *   Apple silently rejects icons with an alpha channel — transparent
 *   corners would render with grey corners on the home screen instead
 *   of being properly masked. We flatten on a solid background that
 *   matches the SVG's outer-radial stop.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const MASTER_SRC  = resolve(root, 'assets/icon-only.svg');
const ROUNDED_SRC = resolve(root, 'assets/icon.svg');

// Cream base — matches the SVG's outer-radial stop. Flattening on this
// keeps the gradient looking continuous if the SVG ever loses transparency.
const FLATTEN_BG = { r: 245, g: 241, b: 232 }; // #F5F1E8

const OUTPUTS = [
  { src: MASTER_SRC,  dest: 'assets/icon-only.png',           size: 1024, flatten: true  },
  { src: ROUNDED_SRC, dest: 'assets/icon-192.png',            size: 192,  flatten: false },
  { src: ROUNDED_SRC, dest: 'assets/icon-512.png',            size: 512,  flatten: false },
  { src: ROUNDED_SRC, dest: 'assets/apple-touch-icon-180.png', size: 180,  flatten: false },
];

async function generate({ src, dest, size, flatten }) {
  const out = resolve(root, dest);
  await mkdir(dirname(out), { recursive: true });

  let pipeline = sharp(src, { density: Math.max(384, size) })
    .resize(size, size, { fit: 'contain', background: FLATTEN_BG });

  if (flatten) pipeline = pipeline.flatten({ background: FLATTEN_BG });

  await pipeline
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(out);

  const meta = await sharp(out).metadata();
  const ok = meta.width === size && meta.height === size && (!flatten || !meta.hasAlpha);
  console.log(`${ok ? '✓' : '✗'} ${dest}  ${meta.width}×${meta.height}  alpha=${meta.hasAlpha}`);
  if (!ok) process.exit(1);
}

for (const job of OUTPUTS) await generate(job);
