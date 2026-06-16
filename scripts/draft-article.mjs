/**
 * draft-article.mjs — generate ONE MDR-safe article draft (Opus/Fable, offline).
 * ----------------------------------------------------------------------------
 * Reuses the content pipeline: tone-of-voice.md as system context + the shared
 * guardrails. Output is a Markdown file under content/articles/<locale>/<slug>.md
 * that the SSG (build-articles.mjs) turns into a static page on the next build.
 *
 * DRAFT ONLY — this is the "AI-draft + human redactie" workflow. The output is a
 * starting point; a person must fact-check (YMYL) before publishing.
 *
 *   ANTHROPIC_API_KEY=... npm run draft:article -- \
 *     --topic="sporten tijdens je menstruatie" \
 *     --cluster="Beweging per fase" --locale=nl --slug=sporten-tijdens-menstruatie \
 *     [--translationKey=movement-during-period] [--date=2026-06-16]
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { generate, extractCodeBlock } from './lib/anthropic.mjs';
import { checkGuardrails, FORBIDDEN_FRAMES } from '../src/lib/content/guardrails.js';

const TOV_PATH = 'content/tone-of-voice.md';

function parseArgs() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function loadTov() {
  if (!existsSync(TOV_PATH)) throw new Error(`${TOV_PATH} missing — run "npm run content:tov" first.`);
  return readFileSync(TOV_PATH, 'utf8');
}

const SCHEMA = `Return ONLY a JSON object:
{ "title": "≤60 chars, primary keyword first", "description": "~150 chars, click-driven meta description", "keywords": "comma-separated, 3-5 terms", "body": "Markdown article body starting with a single # H1, then H2 sections covering the main sub-questions" }`;

function buildPrompt({ topic, cluster, locale }) {
  const lang = locale === 'en' ? 'English' : 'Dutch';
  const forbidden = FORBIDDEN_FRAMES.map((f) => `- ${f}`).join('\n');
  return `Write a calm, warm, MDR-safe article in ${lang} for a women's cycle & wellbeing app.

Topic: ${topic}
Content cluster: ${cluster}

Hard rules (these are auto-checked and will be rejected):
${forbidden}
Also: descriptive not prescriptive (no diagnosis, treatment, disease prediction, or "replaces contraception"). Never hardcode the app name in prose — refer to the app as Paced only in the closing call-to-action. Include a short medical disclaimer near the end ("not a medical device / consult a doctor").

Structure: a single # H1, an intro paragraph, then 3-5 ## H2 sections that answer the likely "people also ask" sub-questions, and a closing paragraph with a soft call-to-action to track this calmly in Paced (link the word Paced to "/"). Around 500-700 words.

${SCHEMA}`;
}

export async function draftArticle(opts) {
  const { topic, cluster = 'Algemeen', locale = 'nl', slug } = opts;
  if (!topic) throw new Error('missing --topic');
  if (!slug) throw new Error('missing --slug');
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`--slug "${slug}" must be kebab-case`);
  if (!['nl', 'en'].includes(locale)) throw new Error(`--locale must be nl or en`);

  const tov = loadTov();
  const system = `You are a senior health & wellness content writer.\n\n--- TONE OF VOICE ---\n${tov}`;

  let data;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await generate({ system, prompt: buildPrompt({ topic, cluster, locale }), maxTokens: 3000 });
    try {
      data = JSON.parse(extractCodeBlock(raw));
    } catch {
      if (attempt === 2) throw new Error('model did not return valid JSON');
      continue;
    }
    const g = checkGuardrails(data.body || '');
    if (g.ok) break;
    console.log(`   ✗ guardrail hit (round ${attempt}): ${g.violations.map((v) => v.rule).join(', ')}`);
    if (attempt === 2) throw new Error('draft failed guardrails after 2 rounds — refine the topic/prompt');
    data = null;
  }

  const date = opts.date || new Date().toISOString().slice(0, 10);
  const fm = [
    '---',
    `title: ${data.title}`,
    `description: ${data.description}`,
    `slug: ${slug}`,
    `locale: ${locale}`,
    ...(opts.translationKey ? [`translationKey: ${opts.translationKey}`] : []),
    `cluster: ${cluster}`,
    `keywords: ${data.keywords}`,
    `published: ${date}`,
    `updated: ${date}`,
    'image: /assets/og-image.png',
    '---',
    '',
  ].join('\n');

  mkdirSync(`content/articles/${locale}`, { recursive: true });
  const path = `content/articles/${locale}/${slug}.md`;
  writeFileSync(path, `${fm}${data.body.trim()}\n`, 'utf8');
  console.log(`✓ wrote ${path} — DRAFT, needs human fact-check before publishing.`);
  return path;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  draftArticle(parseArgs()).catch((err) => {
    console.error('✗ draft failed:', err.message);
    process.exit(1);
  });
}
