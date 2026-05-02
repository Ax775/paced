/**
 * Tests for src/lib/nutrition.js — BMR/TDEE + phase-aware macro targets.
 */

import { describe, it, expect } from 'vitest';

import {
  calcBMR,
  calcTDEE,
  activityMultiplier,
  ACTIVITY_LEVELS,
  getDailyTargets,
  NUTRIENT_FOCUS,
} from '../src/lib/nutrition.js';
import { PHASES } from '../src/lib/cycle.js';

/* ─────────────────────────────  BMR  ────────────────────────────── */

describe('calcBMR (Mifflin-St Jeor, female)', () => {
  it('matches the formula 10*kg + 6.25*cm − 5*age − 161, rounded', () => {
    // 10*62 + 6.25*168 − 5*28 − 161 = 620 + 1050 − 140 − 161 = 1369
    expect(calcBMR({ weightKg: 62, heightCm: 168, age: 28 })).toBe(1369);

    // 10*70 + 6.25*175 − 5*40 − 161 = 700 + 1093.75 − 200 − 161 = 1432.75 → 1433
    expect(calcBMR({ weightKg: 70, heightCm: 175, age: 40 })).toBe(1433);
  });

  it('returns 0 when any required input is missing', () => {
    expect(calcBMR({ weightKg: 0,  heightCm: 168, age: 28 })).toBe(0);
    expect(calcBMR({ weightKg: 62, heightCm: 0,   age: 28 })).toBe(0);
    expect(calcBMR({ weightKg: 62, heightCm: 168, age: 0  })).toBe(0);
    expect(calcBMR({ weightKg: 62, heightCm: 168 })).toBe(0); // missing age
    expect(calcBMR({})).toBe(0);
  });

  it('returns 0 for non-positive (junk) input — never produces negative BMR', () => {
    expect(calcBMR({ weightKg: -10, heightCm: 168, age: 28 })).toBe(0);
    expect(calcBMR({ weightKg: 'abc', heightCm: 168, age: 28 })).toBe(0);
    expect(calcBMR({ weightKg: NaN, heightCm: 168, age: 28 })).toBe(0);
  });
});

/* ────────────────────────  Activity multiplier  ────────────────────── */

describe('activityMultiplier', () => {
  it.each(ACTIVITY_LEVELS)('matches the canonical multiplier for $id', ({ id, mult }) => {
    expect(activityMultiplier(id)).toBe(mult);
  });

  it('falls back to sedentary for unknown ids', () => {
    expect(activityMultiplier('totally-unknown')).toBe(1.2);
    expect(activityMultiplier(undefined)).toBe(1.2);
    expect(activityMultiplier(null)).toBe(1.2);
  });
});

/* ─────────────────────────────  TDEE  ──────────────────────────────── */

describe('calcTDEE', () => {
  it('multiplies BMR by the activity factor and rounds to nearest 10 kcal', () => {
    // BMR = 1369, mult = 1.55 → 2121.95 → rounds to 2120
    const t = calcTDEE({ weightKg: 62, heightCm: 168, age: 28, activityLevel: 'moderate' });
    expect(t).toBe(2120);
  });

  it('returns 0 (× any multiplier = 0) when BMR is 0', () => {
    expect(calcTDEE({ activityLevel: 'moderate' })).toBe(0);
  });

  it('uses the sedentary fallback when activityLevel is missing', () => {
    // BMR 1369 × 1.2 = 1642.8 → 1640
    expect(calcTDEE({ weightKg: 62, heightCm: 168, age: 28 })).toBe(1640);
  });
});

/* ────────────────────────  Daily targets per phase  ──────────────────── */

describe('getDailyTargets', () => {
  const profile = {
    weightKg:      62,
    heightCm:      168,
    age:           28,
    activityLevel: 'moderate', // ×1.55 → TDEE 2120
  };

  it('returns the canonical menstrual baseline (no kcal delta, raised protein)', () => {
    const t = getDailyTargets(profile, PHASES.MENSTRUAL);
    expect(t.baseTDEE).toBe(2120);
    expect(t.calorieDelta).toBe(0);
    expect(t.calories).toBe(2120);
    expect(t.proteinPerKg).toBe(1.7);
    expect(t.protein).toBe(Math.round(62 * 1.7)); // 105
    expect(t.focus).toBe(NUTRIENT_FOCUS[PHASES.MENSTRUAL]);
  });

  it('adds +250 kcal during the luteal phase (more metabolic work)', () => {
    const t = getDailyTargets(profile, PHASES.LUTEAL);
    expect(t.calorieDelta).toBe(250);
    expect(t.calories).toBe(2370);
    expect(t.proteinPerKg).toBe(1.8);
  });

  it('adds +50 kcal around ovulation', () => {
    const t = getDailyTargets(profile, PHASES.OVULATORY);
    expect(t.calorieDelta).toBe(50);
    expect(t.calories).toBe(2170);
  });

  it('keeps follicular at maintenance', () => {
    const t = getDailyTargets(profile, PHASES.FOLLICULAR);
    expect(t.calorieDelta).toBe(0);
    expect(t.calories).toBe(2120);
    expect(t.proteinPerKg).toBe(1.6);
  });

  it('falls back to follicular deltas for an unknown phase', () => {
    const t = getDailyTargets(profile, 'totally-unknown-phase');
    expect(t.calorieDelta).toBe(0);
    expect(t.proteinPerKg).toBe(1.6);
  });

  it('honours the 2.0 L hydration floor for very low body weights', () => {
    const tiny = { ...profile, weightKg: 30 };
    const t = getDailyTargets(tiny, PHASES.FOLLICULAR);
    // 30 × 0.033 = 0.99 → floored to 2.0
    expect(t.hydrationL).toBe(2.0);
  });

  it('scales hydration above the floor for typical weights', () => {
    // 62 × 0.033 = 2.046 → toFixed(1) → 2.0
    expect(getDailyTargets(profile, PHASES.FOLLICULAR).hydrationL).toBe(2.0);
    // 80 × 0.033 = 2.64 → 2.6
    expect(getDailyTargets({ ...profile, weightKg: 80 }, PHASES.FOLLICULAR).hydrationL).toBe(2.6);
  });

  it('exposes the nutrient-focus copy for the phase', () => {
    expect(getDailyTargets(profile, PHASES.MENSTRUAL).focus.headline).toBe('IJzer & warmte');
    expect(getDailyTargets(profile, PHASES.LUTEAL).focus.headline).toBe('Darmgezondheid & magnesium');
  });
});

/* ────────────────────────────  Sanity  ─────────────────────────────── */

describe('NUTRIENT_FOCUS', () => {
  it('defines a focus block for every phase', () => {
    for (const phase of Object.values(PHASES)) {
      expect(NUTRIENT_FOCUS[phase]).toBeDefined();
      expect(NUTRIENT_FOCUS[phase].headline).toBeTruthy();
      expect(Array.isArray(NUTRIENT_FOCUS[phase].foods)).toBe(true);
      expect(NUTRIENT_FOCUS[phase].foods.length).toBeGreaterThan(0);
    }
  });

  it('keeps the "avoid" list intentionally empty (Aura never shames)', () => {
    for (const phase of Object.values(PHASES)) {
      expect(NUTRIENT_FOCUS[phase].avoid).toEqual([]);
    }
  });
});
