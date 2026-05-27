/**
 * Paced — Nutrition Engine
 * -----------------------
 * BMR / TDEE calculation and cycle-phase-aware macro targets.
 *
 * Philosophy note: targets here are *supportive floors*, not restrictive
 * ceilings. The luteal phase increases calories because the body does
 * more metabolic work then — it is not a reward system.
 */

import { PHASES } from './cycle.js';

/* ------------------------------------------------------------------ */
/*  BMR / TDEE                                                         */
/* ------------------------------------------------------------------ */

/**
 * Mifflin-St Jeor equation (female).
 *
 *   BMR = 10*kg + 6.25*cm − 5*age − 161
 *
 * @param {object} p
 * @param {number} p.weightKg
 * @param {number} p.heightCm
 * @param {number} p.age
 */
export function calcBMR({ weightKg, heightCm, age }) {
  const w = num(weightKg);
  const h = num(heightCm);
  const a = num(age);
  if (!w || !h || !a) return 0;
  return Math.round(10 * w + 6.25 * h - 5 * a - 161);
}

/** Activity multiplier table (mirrors the onboarding selector labels). */
export const ACTIVITY_LEVELS = [
  { id: 'sedentary',   label: 'Sedentair',        hint: 'Voornamelijk zittend werk',        mult: 1.2 },
  { id: 'light',       label: 'Licht actief',     hint: '1–3 lichte sessies / week',        mult: 1.375 },
  { id: 'moderate',    label: 'Matig actief',     hint: '3–5 sessies / week',               mult: 1.55 },
  { id: 'active',      label: 'Actief',           hint: '6–7 sessies / week',               mult: 1.725 },
  { id: 'very_active', label: 'Zeer actief',      hint: 'Atletenniveau',                    mult: 1.9 },
];

export function activityMultiplier(id) {
  return ACTIVITY_LEVELS.find((l) => l.id === id)?.mult ?? 1.2;
}

/** Total Daily Energy Expenditure, rounded to nearest 10 kcal. */
export function calcTDEE(profile) {
  const bmr  = calcBMR(profile);
  const mult = activityMultiplier(profile.activityLevel);
  return Math.round((bmr * mult) / 10) * 10;
}

/* ------------------------------------------------------------------ */
/*  Phase-aware macro adjustments                                      */
/* ------------------------------------------------------------------ */

/**
 * Calorie and protein deltas applied on top of maintenance TDEE.
 *
 *   - Luteal:     +250 kcal (body does more metabolic work)
 *   - Ovulatory:  +50 kcal, protein nudged up to support egg release
 *   - Menstrual:  unchanged calories, extra protein for iron-rich foods
 *   - Follicular: maintenance baseline
 *
 * Protein floor is always 1.6 g/kg — raised further in certain phases.
 */
const PHASE_DELTAS = {
  [PHASES.MENSTRUAL]:  { kcal:   0, proteinPerKg: 1.7 },
  [PHASES.FOLLICULAR]: { kcal:   0, proteinPerKg: 1.6 },
  [PHASES.OVULATORY]:  { kcal:  50, proteinPerKg: 1.7 },
  [PHASES.LUTEAL]:     { kcal: 250, proteinPerKg: 1.8 },
};

/**
 * Nutrient focus shown on the dashboard — the "why" behind today's targets.
 * Intentionally positive language, never restrictive.
 */
export const NUTRIENT_FOCUS = {
  [PHASES.MENSTRUAL]: {
    headline: 'IJzer & warmte',
    foods:    ['Rode linzen', 'Donkere bladgroenten', 'Rode bieten', 'Grasgevoerd vlees', 'Pompoenpitten'],
    avoid:    [], // Paced beschaamt nooit — "vermijden" is bewust leeg
    why:      'Het aanvullen van ijzer verloren tijdens de menstruatie ondersteunt stabiele energie en stemming.',
  },
  [PHASES.FOLLICULAR]: {
    headline: 'Fris & gefermenteerd',
    foods:    ['Zuurkool', 'Kefir', 'Gekiemd graan', 'Citrus', 'Bladgroentesalades'],
    avoid:    [],
    why:      'Stijgend oestrogeen past prachtig bij lichte, probiotica-rijke voeding die zachtjes ontgiftingspaden ondersteunt.',
  },
  [PHASES.OVULATORY]: {
    headline: 'Vezels & antioxidanten',
    foods:    ['Bessen', 'Koolsoorten', 'Lijnzaad', 'Quinoa', 'Groene thee'],
    avoid:    [],
    why:      'Vezels en koolsoorten helpen je lever om piek-oestrogeen soepel te metaboliseren.',
  },
  [PHASES.LUTEAL]: {
    headline: 'Darmgezondheid & magnesium',
    foods:    ['Gefermenteerde voeding', 'Zoete aardappel', 'Pure chocolade (70%+)', 'Pompoenpitten', 'Haver'],
    avoid:    [],
    why:      'Progesteron vertraagt de spijsvertering — vezels, gefermenteerde voeding en magnesium houden je darm kalm en trek in balans.',
  },
};

/**
 * Compute today's targets.
 *
 * @param {object} profile — user profile (height, weight, age, activity)
 * @param {string} phase   — current cycle phase (see PHASES)
 */
export function getDailyTargets(profile, phase) {
  const baseTDEE = calcTDEE(profile);
  const delta    = PHASE_DELTAS[phase] ?? PHASE_DELTAS[PHASES.FOLLICULAR];
  const weightKg = num(profile.weightKg);

  const calories = baseTDEE + delta.kcal;
  const protein  = Math.round(weightKg * delta.proteinPerKg);

  return {
    baseTDEE,
    calories,
    calorieDelta: delta.kcal,
    protein,
    proteinPerKg: delta.proteinPerKg,
    hydrationL:   Math.max(2.0, +(weightKg * 0.033).toFixed(1)), // 33 ml / kg, floor 2 L
    focus:        NUTRIENT_FOCUS[phase],
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
