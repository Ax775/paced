#!/usr/bin/env node
/**
 * Render the public-facing legal markdown docs to styled HTML in
 * public/legal/. Run as part of `npm run build`. Internal documents
 * (DPIA, verwerkingsregister) are NOT exported — those are
 * lawyer/internal only.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const docs = [
  { slug: 'privacy',    title: 'Privacyverklaring',   md: 'docs/legal/privacyverklaring.md' },
  { slug: 'disclaimer', title: 'Medische disclaimer', md: 'docs/legal/medische-disclaimer.md' },
  { slug: 'colofon',    title: 'Colofon',             md: 'docs/legal/colofon.md' },
];

function stripReviewChecklist(markdown) {
  // Internal "Reviewchecklist (voor de jurist)" section is not for end users.
  const idx = markdown.indexOf('## Reviewchecklist');
  return idx === -1 ? markdown : markdown.slice(0, idx).trimEnd() + '\n';
}

function pageShell({ title, body, slug }) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index,follow" />
  <title>${title} — Aura</title>
  <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />
  <style>
    :root {
      --cream-50:  #FBF9F3;
      --cream-200: #EDE6D3;
      --sage-500:  #6B8559;
      --sage-600:  #556B47;
      --ink-400:   #8B8578;
      --ink-500:   #5F5A4E;
      --ink-700:   #2A2823;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: var(--cream-50);
      color: var(--ink-700);
      font-family: 'Inter', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      max-width: 720px;
      margin: 0 auto;
      padding: 3rem 1.5rem 5rem;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--sage-600);
      text-decoration: none;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }
    .back:hover { text-decoration: underline; }
    article h1, article h2, article h3 {
      font-family: 'Fraunces', Georgia, serif;
      color: var(--ink-700);
      letter-spacing: -0.01em;
    }
    article h1 { font-size: 2rem; margin: 0 0 1rem; }
    article h2 { font-size: 1.4rem; margin: 2.5rem 0 0.75rem; }
    article h3 { font-size: 1.1rem; margin: 1.75rem 0 0.5rem; }
    article p, article li { line-height: 1.65; color: var(--ink-500); }
    article a { color: var(--sage-600); }
    article hr { border: 0; border-top: 1px solid var(--cream-200); margin: 3rem 0; }
    article table {
      border-collapse: collapse;
      margin: 1rem 0;
      font-size: 0.92rem;
      width: 100%;
    }
    article th, article td {
      border: 1px solid var(--cream-200);
      padding: 0.5rem 0.75rem;
      text-align: left;
      vertical-align: top;
    }
    article th { background: var(--cream-200); color: var(--ink-700); }
    article code {
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 0.88em;
      background: var(--cream-200);
      padding: 0.1em 0.4em;
      border-radius: 4px;
    }
    article ul, article ol { padding-left: 1.4rem; }
    article strong { color: var(--ink-700); }
    .meta {
      color: var(--ink-400);
      font-size: 0.85rem;
      margin-bottom: 2rem;
    }
    footer {
      margin-top: 4rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--cream-200);
      color: var(--ink-400);
      font-size: 0.8rem;
    }
    footer a { color: var(--sage-600); }
  </style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="/">← Terug naar Aura</a>
    <article>${body}</article>
    <footer>
      <p>
        Andere documenten:
        ${docs.filter((d) => d.slug !== slug).map((d) => `<a href="/legal/${d.slug}.html">${d.title}</a>`).join(' · ')}
      </p>
    </footer>
  </div>
</body>
</html>
`;
}

function build() {
  const outDir = resolve(root, 'public/legal');
  mkdirSync(outDir, { recursive: true });

  for (const doc of docs) {
    const mdPath = resolve(root, doc.md);
    const raw = readFileSync(mdPath, 'utf8');
    const cleaned = stripReviewChecklist(raw);
    const body = marked.parse(cleaned);
    const html = pageShell({ title: doc.title, body, slug: doc.slug });
    writeFileSync(resolve(outDir, `${doc.slug}.html`), html, 'utf8');
    process.stdout.write(`  wrote public/legal/${doc.slug}.html\n`);
  }
}

build();
