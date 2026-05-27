/**
 * Aura — generate the iOS App Store master icon.
 *
 * Reads assets/icon-only.svg and produces:
 *   assets/icon-only.png    1024×1024, sRGB, NO alpha (App Store master)
 *
 * Run:
 *   npm run gen:icon
 *
 * The 1024 master is what:
 *   - You upload to App Store Connect → App Information
 *   - @capacitor/assets reads to generate the full ios/App/App/
 *     Assets.xcassets/AppIcon.appiconset/ catalog
 *
 * Why no alpha:
 *   Apple silently rejects icons with an alpha channel — a PNG with
 *   transparent corners would render with grey corners on the home
 *   screen instead of being properly masked. We flatten on a solid
 *   background (matches the SVG's own gradient base) to be safe.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const SRC  = resolve(root, 'assets/icon-only.svg');
const DEST = resolve(root, 'assets/icon-only.png');

// Cream base — matches the SVG's outer-radial stop. Flattening on this
// keeps the gradient looking continuous if the SVG ever loses transparency.
const FLATTEN_BG = { r: 245, g: 241, b: 232 }; // #F5F1E8

async function main() {
  await mkdir(dirname(DEST), { recursive: true });

  const buffer = await sharp(SRC, { density: 384 })
    .resize(1024, 1024, { fit: 'contain', background: FLATTEN_BG })
    .flatten({ background: FLATTEN_BG })          // strip any alpha channel
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  await sharp(buffer).toFile(DEST);

  const { width, height, channels, hasAlpha } = await sharp(DEST).metadata();
  console.log(`✓ ${DEST}`);
  console.log(`  ${width}×${height} · ${channels} channels · alpha: ${hasAlpha}`);

  if (hasAlpha) {
    console.error('✗ Output still has alpha channel — Apple will reject this.');
    process.exit(1);
  }
  if (width !== 1024 || height !== 1024) {
    console.error(`✗ Expected 1024×1024, got ${width}×${height}.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
