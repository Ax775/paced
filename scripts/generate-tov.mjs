/**
 * generate-tov.mjs — ONE-TIME tone-of-voice generation (Opus/Fable, offline).
 * ---------------------------------------------------------------------------
 * Produces content/tone-of-voice.md, which every later content call carries as
 * system context. Run sparingly; the output is committed and cheap to reuse.
 *
 *   ANTHROPIC_API_KEY=... npm run content:tov
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { generate, extractCodeBlock } from './lib/anthropic.mjs';
import { FORBIDDEN_FRAMES } from '../src/lib/content/guardrails.js';
import { CATEGORIES } from '../src/lib/content/spec.js';

const OUT = 'content/tone-of-voice.md';

const SYSTEM = `You are a senior brand voice writer for a women's menstrual-cycle and wellness app.
The app name must NEVER appear hardcoded; refer to it as {brand}. Write for a Dutch + English audience.
Your job is a precise, usable voice guide — not marketing fluff.`;

function buildPrompt() {
  const cats = CATEGORIES.map((c) => `- ${c.label}: ${c.description}`).join('\n');
  const forbidden = FORBIDDEN_FRAMES.map((f) => `- ${f}`).join('\n');
  return `Write a tone-of-voice guide as a single Markdown document. Structure it EXACTLY with these sections:

# Tone of Voice — {brand}

## Stemprofiel / Voice profile
A short profile. The voice is: warm, never patronising, no medical claims, body-positive, consent-forward. Bilingual NL + EN. 1 short paragraph in Dutch, then 1 in English.

## Do / Don't (15 paren)
Exactly 15 numbered do/don't pairs. Each pair: a "✅ Do:" line with a concrete EXAMPLE SENTENCE, and a "❌ Don't:" line with a concrete counter-example. Mix Dutch and English examples. Cover daily check-ins, cycle phases, sleep, movement, nutrition, mindfulness, and notifications.

## Verboden frames / Forbidden frames
Restate these as a bullet list and add one bad example sentence per item (so writers recognise them):
${forbidden}
Also explicitly forbid: blame, shame, diet-culture language, and diagnoses.

## Categorie-notities / Category notes
One line of voice guidance per content category:
${cats}

Constraints: keep it practical and skimmable. Use {brand} wherever the app name would go. Output ONLY the Markdown document, no preamble.`;
}

export async function generateToneOfVoice() {
  const md = extractCodeBlock(await generate({ system: SYSTEM, prompt: buildPrompt(), maxTokens: 4096 }));
  mkdirSync('content', { recursive: true });
  writeFileSync(OUT, md.endsWith('\n') ? md : `${md}\n`, 'utf8');
  console.log(`✓ wrote ${OUT} (${md.length} chars)`);
  return OUT;
}

// run-if-main
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateToneOfVoice().catch((err) => {
    console.error('✗ tone-of-voice generation failed:', err.message);
    process.exit(1);
  });
}
