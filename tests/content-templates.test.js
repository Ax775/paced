/**
 * Snapshot + schema tests for the committed seed templates. Snapshots capture
 * the structural shape (counts, ids, slot vocabulary) so schema drift or an
 * accidental content drop is caught — without snapshotting the prose itself.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { checkGuardrails } from '../src/lib/content/guardrails.js';
import {
  CATEGORY_IDS,
  LOCALES,
  MIN_VARIANTS_PER_LOCALE,
  extractSlots,
  validateCategoryFile,
} from '../src/lib/content/spec.js';

function loadCategory(id) {
  return JSON.parse(readFileSync(new URL(`../content/templates/${id}.json`, import.meta.url), 'utf8'));
}

describe.each(CATEGORY_IDS)('category %s', (id) => {
  const entries = loadCategory(id);

  it('passes full schema + coverage validation', () => {
    const res = validateCategoryFile(id, entries);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it(`has ≥ ${MIN_VARIANTS_PER_LOCALE} variants per locale`, () => {
    for (const locale of LOCALES) {
      expect(entries.filter((e) => e.locale === locale).length).toBeGreaterThanOrEqual(
        MIN_VARIANTS_PER_LOCALE,
      );
    }
  });

  it('clears every guardrail', () => {
    for (const e of entries) {
      expect(checkGuardrails(e.template).ok, `${e.id}: ${e.template}`).toBe(true);
    }
  });

  it('matches the structural schema snapshot', () => {
    const slotVocab = new Set();
    for (const e of entries) for (const s of extractSlots(e.template)) slotVocab.add(s);
    const shape = {
      category: id,
      total: entries.length,
      perLocale: Object.fromEntries(
        LOCALES.map((l) => [l, entries.filter((e) => e.locale === l).length]),
      ),
      slotVocabulary: [...slotVocab].sort(),
      ids: entries.map((e) => e.id).sort(),
    };
    expect(shape).toMatchSnapshot();
  });
});
