/**
 * Tests for the content guardrails — the hardcoded safety checklist used in
 * both the generation review-step and the runtime fallback.
 */

import { describe, it, expect } from 'vitest';

import {
  checkGuardrails,
  passesGuardrails,
  GUARDRAIL_RULE_IDS,
} from '../src/lib/content/guardrails.js';
import { personalizeFreeText } from '../src/lib/content/personalize.js';

/* ──────────────  5 forbidden-frame fixtures  ────────────── */

const FORBIDDEN_FIXTURES = [
  { rule: 'no-calorie-numbers', text: 'Eet vandaag maximaal 1500 calorieën om op schema te blijven.' },
  { rule: 'no-weight-goals', text: 'Nog 5 kg afvallen tot je streefgewicht — vol houden!' },
  { rule: 'no-comparative-body', text: 'Met deze work-out word je slanker dan vorige zomer.' },
  { rule: 'no-medical-claims', text: 'Dit duidt op een symptoom van een hormoonstoornis; neem 400 mg magnesium.' },
  { rule: 'no-shame-guilt', text: 'Je hebt gezondigd met die cheat meal — compenseer het morgen.' },
];

describe('checkGuardrails — forbidden frames', () => {
  it('flags every forbidden-frame fixture', () => {
    for (const { text } of FORBIDDEN_FIXTURES) {
      const res = checkGuardrails(text);
      expect(res.ok, `should flag: ${text}`).toBe(false);
      expect(res.violations.length).toBeGreaterThan(0);
    }
  });

  it('attributes each fixture to its intended rule', () => {
    for (const { rule, text } of FORBIDDEN_FIXTURES) {
      const ids = checkGuardrails(text).violations.map((v) => v.rule);
      expect(ids, `${text}\nexpected rule ${rule}`).toContain(rule);
    }
  });

  it('passes supportive, non-restrictive copy', () => {
    const ok = [
      'Je lichaam verbrandt nu meer calorieën — extra eten is oké en zelfs goed.',
      'Beweging mag vandaag aanvoelen als plezier.',
      'Your body is doing more metabolic work now; rest is productive too.',
      'Donkere bladgroenten passen mooi bij deze fase.',
    ];
    for (const text of ok) expect(passesGuardrails(text), text).toBe(true);
  });

  it('exposes a stable rule-id list', () => {
    expect(GUARDRAIL_RULE_IDS).toEqual([
      'no-calorie-numbers',
      'no-weight-goals',
      'no-comparative-body',
      'no-medical-claims',
      'no-shame-guilt',
    ]);
  });
});

describe('runtime fallback — forbidden AI output triggers neutral template', () => {
  it('falls back to a template for all 5 forbidden fixtures', async () => {
    for (const { text } of FORBIDDEN_FIXTURES) {
      // client returns an UNSAFE reply; runtime must reject it and fall back.
      const client = async () => ({ text });
      const res = await personalizeFreeText({
        category: 'daily-checkin',
        locale: 'nl',
        userText: 'ik voel me vandaag wat somber',
        state: { name: 'Sara' },
        seed: '2026-06-13',
        client,
      });
      expect(res).not.toBeNull();
      expect(res.source, `forbidden "${text}" should fall back`).toBe('template');
    }
  });
});
