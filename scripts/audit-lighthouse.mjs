/**
 * Aura — local Lighthouse audit
 * ------------------------------
 * One-shot mobile audit against the production build in `dist/`.
 *
 * What it does:
 *   1. Boots a tiny static server on dist/ (no extra deps).
 *   2. Runs lighthouse 13 in headless Chrome with mobile throttling.
 *   3. Prints a compact scores table + actionable failures.
 *   4. Always tears the server down — even on Ctrl-C or crash.
 *
 * Headless Chrome occasionally trips on NO_FCP when the host is busy;
 * we retry once before giving up.
 *
 * Usage:
 *   npm run audit                # builds + audits
 *   node scripts/audit-lighthouse.mjs --skip-build
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');

const PORT = 8765;
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.map':  'application/json; charset=utf-8',
};

function startServer() {
  return new Promise((resolveStart, rejectStart) => {
    const server = createServer(async (req, res) => {
      try {
        let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const filePath = join(DIST, pathname);
        // Block path traversal (very lightweight check).
        if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end(); }
        const s = await stat(filePath).catch(() => null);
        if (!s || !s.isFile()) { res.writeHead(404); return res.end('not found'); }
        const body = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(body);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    server.on('error', rejectStart);
    server.listen(PORT, '127.0.0.1', () => resolveStart(server));
  });
}

function runLighthouse() {
  return new Promise((resolveRun, rejectRun) => {
    const out = join(tmpdir(), 'aura-lh-' + Date.now() + '.json');
    const args = [
      '-y', 'lighthouse@13',
      `http://localhost:${PORT}/`,
      '--output=json',
      `--output-path=${out}`,
      '--form-factor=mobile',
      '--screenEmulation.mobile=true',
      `--only-categories=${CATEGORIES.join(',')}`,
      '--quiet',
      // --headless (the legacy renderer) survives NO_FCP better than
      // --headless=new on macOS in our experience.
      '--chrome-flags=--headless --no-sandbox --disable-gpu --disable-dev-shm-usage',
      '--max-wait-for-load=60000',
    ];
    const child = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code !== 0) return rejectRun(new Error(stderr.trim() || `lighthouse exited ${code}`));
      resolveRun(out);
    });
    child.on('error', rejectRun);
  });
}

async function runWithRetry(maxAttempts = 2) {
  let lastErr;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await runLighthouse();
    } catch (err) {
      lastErr = err;
      const flaky = /NO_FCP|did not paint/i.test(String(err.message || err));
      if (!flaky || i === maxAttempts) throw err;
      console.warn(`  ↻ attempt ${i} hit NO_FCP, retrying once…`);
    }
  }
  throw lastErr;
}

function printSummary(report) {
  const cats = report.categories;
  console.log('\n┌─ Lighthouse · mobile ' + '─'.repeat(34) + '┐');
  for (const id of CATEGORIES) {
    const cat = cats[id];
    if (!cat) continue;
    const score = cat.score == null ? '—' : Math.round(cat.score * 100);
    const bar = '█'.repeat(Math.max(1, Math.round(score / 5)));
    const pad = String(score).padStart(3);
    console.log(`│  ${cat.title.padEnd(22)} ${pad}  ${bar}`);
  }
  console.log('└' + '─'.repeat(56) + '┘\n');

  const failures = [];
  for (const cat of Object.values(cats)) {
    for (const ref of cat.auditRefs || []) {
      const a = report.audits[ref.id];
      if (ref.weight > 0 && a?.score != null && a.score < 0.9) {
        failures.push({ cat: cat.id, id: ref.id, score: a.score, weight: ref.weight, title: a.title });
      }
    }
  }
  if (failures.length === 0) {
    console.log('  ✓ No weighted audit below 0.9 — every category clean.\n');
    return;
  }
  console.log('  Audits worth attention (score < 0.9, non-zero weight):');
  failures.sort((a, b) => b.weight * (1 - b.score) - a.weight * (1 - a.score));
  for (const f of failures) {
    console.log(`    [${f.cat.padEnd(15)}] ${f.id.padEnd(35)} ${f.score.toFixed(2)}  (w=${f.weight})  ${f.title}`);
  }
  console.log();
}

async function main() {
  const skipBuild = process.argv.includes('--skip-build');
  if (!skipBuild) {
    console.log('• Build is assumed to be fresh (run via `npm run audit`).');
  }
  console.log(`• Serving dist/ on http://localhost:${PORT}`);
  const server = await startServer();
  const cleanup = () => server.close();
  process.on('SIGINT',  () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    console.log('• Running Lighthouse (mobile, 4× CPU + 1.5 Mbps throttle)…');
    const reportPath = await runWithRetry(2);
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    printSummary(report);
    console.log(`  Full report JSON: ${reportPath}`);
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('\n✗ Audit failed:', err.message || err);
  process.exit(1);
});
