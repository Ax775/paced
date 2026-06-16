/**
 * generate-templates.mjs — ONE-TIME template generation (Opus/Fable, offline).
 * ---------------------------------------------------------------------------
 * Per category, generates ≥8 variants per locale, then runs a two-gate review:
 *   Gate 1 (deterministic): schema validation + hardcoded guardrails.
 *   Gate 2 (model): a second Opus call audits the batch against the
 *                   tone-of-voice + forbidden frames and flags violations.
 * Flagged/invalid entries are regenerated (max 2 extra rounds). The file is
 * only written if the final set is fully valid and meets the minimum count.
 *
 *   ANTHROPIC_API_KEY=... npm run content:templates
 *   ANTHROPIC_API_KEY=... npm run content:templates -- --category=sleep
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { generate, extractCodeBlock } from './lib/anthropic.mjs';
import { checkGuardrails, FORBIDDEN_FRAMES } from '../src/lib/content/guardrails.js';
import {
  CATEGORIES,
  LOCALES,
  MIN_VARIANTS_PER_LOCALE,
  PHASE_KEYS,
  getCategory,
  validateCategoryFile,
  validateTemplate,
} from '../src/lib/content/spec.js';

const TOV_PATH = 'content/tone-of-voice.md';
const OUT_DIR = 'content/templates';
const MAX_REPAIR_ROUNDS = 2;

const SYSTEM = `You are a senior content writer for a women's menstrual-cycle and wellness app.
Never hardcode the app name — use the {brand} slot. Write warm, non-patronising, body-positive,
consent-forward copy with NO medical claims, NO calorie/weight numbers, NO comparative body
language, and NO shame/guilt/diet-culture framing. Output ONLY valid JSON when asked.`;

function loadToneOfVoice() {
  if (!existsSync(TOV_PATH)) {
    throw new Error(`${TOV_PATH} missing — run "npm run content:tov" first.`);
  }
  return readFileSync(TOV_PATH, 'utf8');
}

function schemaHint(def) {
  const slots = def.slots.join(', ');
  const phaseNote = def.phaseAware
    ? `\nThis category is PHASE-AWARE: every entry uses the {phase} slot, and across each locale cover all four phases (${PHASE_KEYS.join(', ')}) roughly evenly.`
    : '';
  return `Category: ${def.id} — ${def.label}: ${def.description}
Allowed slots: name, brand, phase, cycleDay, streak. Use only what you need from: ${slots}.
Every {placeholder} used MUST be listed in that entry's "slots" array.${phaseNote}`;
}

function genPrompt(def, count, locale, avoidIds = []) {
  const avoid = avoidIds.length ? `\nDo NOT reuse these ids: ${avoidIds.join(', ')}.` : '';
  return `${schemaHint(def)}

Produce a JSON array of EXACTLY ${count} entries, all with locale "${locale}".
Each entry: { "id": kebab-case-unique, "category": "${def.id}", "locale": "${locale}",
"template": "...", "slots": [...], "constraints": ["short notes"] }.
${def.id === 'notification' ? 'Keep templates ≤ 90 characters; add "max 90 chars" to constraints.\n' : ''}When {name} may be empty, write so it still reads well (prefer leading "{name}, ...").${avoid}
Output ONLY the JSON array.`;
}

async function generateBatch(def, count, locale, tov, avoidIds) {
  const raw = await generate({
    system: `${SYSTEM}\n\n--- TONE OF VOICE ---\n${tov}`,
    prompt: genPrompt(def, count, locale, avoidIds),
    maxTokens: 4096,
  });
  let parsed;
  try {
    parsed = JSON.parse(extractCodeBlock(raw));
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed : [];
}

/** Gate 1: keep only entries that pass schema + guardrails. */
function gate1(entries, categoryId) {
  return entries.filter((e) => {
    if (!e || e.category !== categoryId) return false;
    if (!validateTemplate(e).ok) return false;
    return checkGuardrails(e.template).ok;
  });
}

/** Gate 2: second Opus call audits the batch; returns a Set of rejected ids. */
async function gate2Review(entries, def, tov) {
  if (entries.length === 0) return new Set();
  const forbidden = FORBIDDEN_FRAMES.map((f) => `- ${f}`).join('\n');
  const prompt = `You are reviewing template copy for the "${def.label}" category against the tone-of-voice and these forbidden frames:
${forbidden}
Also reject: blame, shame, diet-culture language, diagnoses, hardcoded app names (must use {brand}), or anything off-voice.

Templates (JSON):
${JSON.stringify(entries.map((e) => ({ id: e.id, locale: e.locale, template: e.template })), null, 2)}

Return ONLY a JSON object: { "rejected": [{ "id": "...", "reason": "..." }] }. Empty array if all pass.`;
  const raw = await generate({
    system: `${SYSTEM}\n\n--- TONE OF VOICE ---\n${tov}`,
    prompt,
    maxTokens: 2048,
  });
  try {
    const obj = JSON.parse(extractCodeBlock(raw));
    const rejected = new Set((obj.rejected || []).map((r) => r.id));
    for (const r of obj.rejected || []) console.log(`   ✗ reviewer rejected ${r.id}: ${r.reason}`);
    return rejected;
  } catch {
    return new Set(); // reviewer parse failure ⇒ don't block (Gate 1 already enforced safety)
  }
}

export async function generateCategory(def, tov) {
  console.log(`\n▶ ${def.id}`);
  const kept = [];

  for (const locale of LOCALES) {
    let pool = [];
    let round = 0;
    while (true) {
      const have = pool.length;
      const need = MIN_VARIANTS_PER_LOCALE - have;
      if (need <= 0 && round > 0) break;

      const ask = Math.max(need, MIN_VARIANTS_PER_LOCALE) + (round === 0 ? 2 : 1); // overshoot a little
      const avoidIds = pool.map((e) => e.id);
      const batch = gate1(await generateBatch(def, ask, locale, tov, avoidIds), def.id);

      // merge unique by id
      const seen = new Set(pool.map((e) => e.id));
      for (const e of batch) if (!seen.has(e.id)) { pool.push(e); seen.add(e.id); }

      // Gate 2 review on the current pool; drop rejected
      const rejected = await gate2Review(pool, def, tov);
      pool = pool.filter((e) => !rejected.has(e.id));

      if (pool.length >= MIN_VARIANTS_PER_LOCALE) break;
      if (++round > MAX_REPAIR_ROUNDS) {
        throw new Error(
          `${def.id}/${locale}: only ${pool.length}/${MIN_VARIANTS_PER_LOCALE} valid after ${MAX_REPAIR_ROUNDS} repair rounds.`,
        );
      }
      console.log(`   ↻ ${def.id}/${locale} round ${round}: ${pool.length}/${MIN_VARIANTS_PER_LOCALE}`);
    }
    kept.push(...pool);
    console.log(`   ✓ ${def.id}/${locale}: ${pool.length} variants`);
  }

  const check = validateCategoryFile(def.id, kept);
  if (!check.ok) throw new Error(`${def.id}: final validation failed:\n  ${check.errors.join('\n  ')}`);
  return kept;
}

function writeCategory(id, entries) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = `${OUT_DIR}/${id}.json`;
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  console.log(`✓ wrote ${path} (${entries.length} entries)`);
}

export async function generateTemplates({ category } = {}) {
  const tov = loadToneOfVoice();
  const targets = category ? [getCategory(category)] : CATEGORIES;
  if (category && !targets[0]) throw new Error(`unknown category "${category}"`);

  for (const def of targets) {
    const entries = await generateCategory(def, tov);
    writeCategory(def.id, entries);
  }
}

// run-if-main
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find((a) => a.startsWith('--category='));
  const category = arg ? arg.split('=')[1] : undefined;
  generateTemplates({ category }).catch((err) => {
    console.error('✗ template generation failed:', err.message);
    process.exit(1);
  });
}
