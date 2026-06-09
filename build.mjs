/**
 * Paced production build.
 *
 *   src/  +  index.html (dev)  →  dist/  (prod)
 *
 * What it does:
 *   1. Bundle src/app.jsx + lib/* + React + lucide-react → dist/app.js
 *      (one minified module — no runtime fetches to esm.sh)
 *   2. Compile Tailwind utilities used in the source → dist/styles.css
 *      (replaces the runtime cdn.tailwindcss.com JIT pass)
 *   3. Transform index.html: strip the dev-only Tailwind/Babel/importmap
 *      tags, inject <link> to styles.css, swap the JSX entry script for a
 *      plain ES module import. Keeps the inline <style> block (animations,
 *      dark-mode overrides) and the theme-init / SW-registration scripts.
 *   4. Copy static assets (manifest, sw.js, _headers, assets/) into dist.
 *
 * The original index.html keeps working with no build step (open it
 * directly in a browser) so dev iteration stays instant.
 */

import { build as esbuild } from 'esbuild';
import { execSync }         from 'node:child_process';
import { createHash }       from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, rmSync, existsSync } from 'node:fs';

const distDir = 'dist';

console.log('🔨 Paced build');
console.log('─'.repeat(48));

// ── 0. Clean dist ─────────────────────────────────────────────────────────
if (existsSync(distDir)) rmSync(distDir, { recursive: true });
mkdirSync(distDir, { recursive: true });

// ── 1. Bundle JSX ─────────────────────────────────────────────────────────
//
// Sourcemap is opt-in via `BUILD_SOURCEMAP=1` (or `--sourcemap`). Default
// off — een 900 KB .map naar productie pushen kost bandbreedte (en op
// Cloudflare Pages telt het ook mee voor je build-cache) zonder meet-
// bare opbrengst voor eindgebruikers; devtools laten 'm pas zien als
// iemand expliciet open klikt. Voor remote debugging op een staging-
// deploy: `BUILD_SOURCEMAP=1 npm run build`.
const wantSourcemap =
  process.argv.includes('--sourcemap') || process.env.BUILD_SOURCEMAP === '1';

console.log(`• Bundling app.jsx → dist/app.js  (sourcemap: ${wantSourcemap ? 'on' : 'off'})`);
await esbuild({
  entryPoints: ['src/app.jsx'],
  bundle:      true,
  outfile:     `${distDir}/app.js`,
  format:      'esm',
  platform:    'browser',
  target:      ['es2020', 'safari14', 'firefox100', 'chrome100'],
  loader:      { '.js': 'jsx', '.jsx': 'jsx' },
  jsx:         'transform', // matches the existing `import React` style
  minify:      true,
  sourcemap:   wantSourcemap,
  legalComments: 'none',
});

// Sentry lives in its OWN bundle (dist/sentry.js) so the ~110 KB-gzip SDK
// never lands on the first-paint critical path. monitoring.js loads it at
// runtime via a non-literal dynamic import (so it stays out of app.js) and
// only when window.PACED_SENTRY_DSN is set. Always emitted so the path is
// stable; it's just never fetched when monitoring is off.
console.log('• Bundling sentry chunk → dist/sentry.js');
await esbuild({
  entryPoints: ['src/lib/sentry-chunk.js'],
  bundle:      true,
  outfile:     `${distDir}/sentry.js`,
  format:      'esm',
  platform:    'browser',
  target:      ['es2020', 'safari14', 'firefox100', 'chrome100'],
  minify:      true,
  sourcemap:   wantSourcemap,
  legalComments: 'none',
});

// ── 2. Compile Tailwind ──────────────────────────────────────────────────
console.log('• Compiling Tailwind → dist/styles.css');
execSync(
  `npx tailwindcss -c tailwind.config.cjs -i tailwind.css -o ${distDir}/styles.css --minify`,
  { stdio: 'inherit' }
);

// ── 3. Transform index.html ──────────────────────────────────────────────
console.log('• Transforming index.html → dist/index.html');
let html = readFileSync('index.html', 'utf8');

// Removals — each must match exactly once. We assert so a future edit to
// index.html that breaks one of these patterns fails the build loudly.
const removals = [
  // Tailwind CDN script
  /\s*<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/,
  // Inline Tailwind config block (matched by leading comment)
  /\s*<script>\s*\/\/ Quiet Luxury palette[\s\S]*?<\/script>/,
  // ES module importmap
  /\s*<script type="importmap">[\s\S]*?<\/script>/,
  // Babel standalone
  /\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone\/babel\.min\.js"><\/script>/,
  // The HTML comment + script that registers the absolute-imports Babel plugin
  /\s*<!-- Fix: Babel compiles[\s\S]*?<\/script>/,
];
for (const rx of removals) {
  if (!rx.test(html)) {
    throw new Error(`build.mjs: pattern not found in index.html — ${rx}`);
  }
  html = html.replace(rx, '');
}

// Replace the Babel JSX entry script with a plain ES module import.
const entryRx = /<script type="text\/babel"[^>]*src="\.\/src\/app\.jsx"><\/script>/;
if (!entryRx.test(html)) {
  throw new Error('build.mjs: app.jsx entry script not found in index.html');
}
html = html.replace(entryRx, '<script type="module" src="./app.js"></script>');

// Inject the compiled stylesheet just before </head>. We put it BEFORE the
// inline <style> so the inline rules (dark-mode overrides) win on tie.
html = html.replace(
  /<style>/,
  '<link rel="stylesheet" href="./styles.css" />\n  <style>'
);

writeFileSync(`${distDir}/index.html`, html);

// ── 4. Copy static assets ────────────────────────────────────────────────
console.log('• Copying static assets');
copyFileSync('manifest.webmanifest', `${distDir}/manifest.webmanifest`);
copyFileSync('_headers',             `${distDir}/_headers`);
copyFileSync('robots.txt',           `${distDir}/robots.txt`);

// sw.js gets a content-derived cache name so a deploy auto-evicts the old
// shell cache — no more hand-bumping `paced-shell-v1` on every release. The
// root sw.js stays the static (un-hashed) dev version; only dist/sw.js is
// rewritten. Hashing dist/app.js means the cache rolls exactly when the
// bundle changes and stays stable across no-op rebuilds.
const swHash = createHash('sha256')
  .update(readFileSync(`${distDir}/app.js`))
  .digest('hex')
  .slice(0, 8);
let swContent = readFileSync('sw.js', 'utf8');
swContent = swContent.replace(
  /const CACHE\s*=\s*['"]paced-shell-[^'"]*['"]/,
  `const CACHE = 'paced-shell-${swHash}'`
);
writeFileSync(`${distDir}/sw.js`, swContent);
console.log(`• Writing dist/sw.js  (cache: paced-shell-${swHash})`);

cpSync('assets', `${distDir}/assets`, { recursive: true });
// .well-known/ contains the apple-app-site-association manifest for iOS
// Universal Links. Must be served from the domain root (not /assets/).
if (existsSync('.well-known')) {
  cpSync('.well-known', `${distDir}/.well-known`, { recursive: true });
}

console.log('─'.repeat(48));
console.log('✓ Build complete → dist/');
