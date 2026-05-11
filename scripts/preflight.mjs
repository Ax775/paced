/**
 * Aura — pre-merge / pre-deploy preflight check.
 *
 * Eén commando dat valideert dat een PR klaar is om te mergen:
 *   1. vitest (alle tests groen)
 *   2. productie-build (esbuild + Tailwind, geen sourcemap)
 *   3. Lighthouse mobile audit met drempels:
 *        accessibility    ≥ 95
 *        best-practices   ≥ 95
 *        seo              ≥ 90
 *        performance      ≥ 70   (mobile simulated; real-device > 90)
 *   4. Verplichte dist/-bestanden aanwezig
 *
 * Faalt op de eerste fout, exit code 1, zodat dit ook in CI past.
 *
 * Usage:
 *   npm run preflight
 *   npm run preflight -- --no-audit     (sla Lighthouse over voor snelle check)
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const THRESHOLDS = {
  performance:    70,
  accessibility:  95,
  'best-practices': 95,
  seo:            90,
};

const REQUIRED_DIST = [
  'index.html',
  'app.js',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  '_headers',
  'robots.txt',
  'assets/icon.svg',
  'assets/splash/1290x2796.png',
];

const skipAudit = process.argv.includes('--no-audit');

function step(name) {
  process.stdout.write(`\n▸ ${name}\n${'─'.repeat(60)}\n`);
}

function ok(msg)   { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); process.exitCode = 1; }

function runSync(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
}

async function main() {
  const start = Date.now();
  console.log('🛫  Aura preflight');

  // ── 1. Tests ──────────────────────────────────────────────────────────
  step('1/4 · Vitest');
  runSync('npm', ['test', '--silent']);
  ok('all tests passed');

  // ── 2. Build ──────────────────────────────────────────────────────────
  step('2/4 · Production build');
  runSync('node', ['build.mjs']);
  ok('build succeeded');

  // Verify required artefacts.
  for (const rel of REQUIRED_DIST) {
    const p = join(ROOT, 'dist', rel);
    try {
      const s = await stat(p);
      if (!s.isFile()) throw new Error('not a file');
      ok(`dist/${rel} (${(s.size / 1024).toFixed(1)} KB)`);
    } catch {
      fail(`dist/${rel} ontbreekt — build is incompleet`);
    }
  }

  if (process.exitCode === 1) throw new Error('Build artefact check failed');

  // ── 3. Lighthouse ─────────────────────────────────────────────────────
  if (skipAudit) {
    step('3/4 · Lighthouse  (overgeslagen via --no-audit)');
  } else {
    step('3/4 · Lighthouse audit');
    const scores = await runLighthouse();
    let auditOK = true;
    for (const [k, threshold] of Object.entries(THRESHOLDS)) {
      const s = scores[k];
      if (s == null) {
        fail(`${k}: score ontbreekt`);
        auditOK = false;
      } else if (s < threshold) {
        fail(`${k}: ${s} < drempel ${threshold}`);
        auditOK = false;
      } else {
        ok(`${k}: ${s} (≥ ${threshold})`);
      }
    }
    if (!auditOK) throw new Error('Lighthouse threshold(s) niet gehaald');
  }

  // ── 4. Done ───────────────────────────────────────────────────────────
  step('4/4 · Done');
  const dur = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  ✓ Preflight voltooid in ${dur}s — klaar om te mergen.\n`);
}

/* ----- Lighthouse helpers (mini, geen herhaling met audit-script) ----- */

const PORT = 8766; // ander dan audit:quick zodat ze parallel kunnen draaien
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

async function runLighthouse() {
  const server = await new Promise((resolveStart, rejectStart) => {
    const srv = createServer(async (req, res) => {
      try {
        let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const filePath = join(ROOT, 'dist', pathname);
        const s = await stat(filePath).catch(() => null);
        if (!s || !s.isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, {
          'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(await readFile(filePath));
      } catch (err) { res.writeHead(500); res.end(String(err)); }
    });
    srv.on('error', rejectStart);
    srv.listen(PORT, '127.0.0.1', () => resolveStart(srv));
  });

  const out = join(tmpdir(), 'aura-preflight-' + Date.now() + '.json');
  const runOnce = () => new Promise((resolveRun, rejectRun) => {
    const child = spawn('npx', [
      '-y', 'lighthouse@13',
      `http://localhost:${PORT}/`,
      '--output=json', `--output-path=${out}`,
      '--form-factor=mobile', '--screenEmulation.mobile=true',
      `--only-categories=${Object.keys(THRESHOLDS).join(',')}`,
      '--quiet',
      '--chrome-flags=--headless --no-sandbox --disable-gpu --disable-dev-shm-usage',
      '--max-wait-for-load=90000',
    ], { stdio: ['ignore', 'ignore', 'pipe'], cwd: ROOT });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => code === 0 ? resolveRun() : rejectRun(new Error(stderr.trim() || `exit ${code}`)));
    child.on('error', rejectRun);
  });

  try {
    // Headless Chrome trips soms op NO_FCP onder load — retry één keer.
    try {
      await runOnce();
    } catch (err) {
      if (!/NO_FCP|did not paint/i.test(String(err.message || err))) throw err;
      console.log('  ↻ NO_FCP, retrying once…');
      await runOnce();
    }
    const report = JSON.parse(await readFile(out, 'utf8'));
    const scores = {};
    for (const k of Object.keys(THRESHOLDS)) {
      scores[k] = report.categories[k] ? Math.round(report.categories[k].score * 100) : null;
    }
    return scores;
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(`\n✗ Preflight failed: ${err.message || err}`);
  process.exit(1);
});
