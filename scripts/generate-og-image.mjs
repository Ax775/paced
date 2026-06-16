/**
 * generate-og-image.mjs — produce the social share image.
 *
 *   assets/og-image.png   1200×630, sRGB  (Open Graph / Twitter card)
 *
 * Referenced by index.html (og:image, twitter:image) and the JSON-LD. Social
 * crawlers (WhatsApp, LinkedIn, iMessage, Facebook, X) don't run JavaScript,
 * so this static image is what every shared paced.nl link shows.
 *
 * Run:
 *   npm run gen:og
 *
 * Rendered with system serif/sans via fontconfig (run on macOS); the output
 * PNG is committed, so production never depends on font availability.
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const W = 1200;
const H = 630;
const CREAM = '#FBF9F3';
const INK = '#2A2823';
const INK_SOFT = '#5F5A4E';
const TERRA = '#B06849';

// Brand icon, embedded as base64 so librsvg composites it inline.
const iconB64 = readFileSync('assets/icon-512.png').toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect x="0" y="0" width="14" height="${H}" fill="${TERRA}"/>
  <image x="96" y="${H / 2 - 110}" width="220" height="220" href="data:image/png;base64,${iconB64}"/>
  <g font-family="Georgia, 'Times New Roman', serif">
    <text x="370" y="270" font-size="104" font-weight="700" fill="${INK}">Paced</text>
  </g>
  <g font-family="Helvetica, Arial, sans-serif">
    <text x="374" y="340" font-size="40" fill="${INK_SOFT}">Rustige cyclus- &amp; welzijnstracker</text>
    <text x="374" y="402" font-size="29" fill="${TERRA}" font-weight="600">Zonder account · zonder tracking · alles op je toestel</text>
  </g>
</svg>`;

const out = 'assets/og-image.png';
const buf = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(out, buf);
const meta = await sharp(buf).metadata();
console.log(`✓ wrote ${out} (${meta.width}×${meta.height})`);
