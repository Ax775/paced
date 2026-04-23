/**
 * Aura — Nutrition Engine
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
  { id: 'sedentary',   label: 'Sedentary',     hint: 'Mostly desk-bound',        mult: 1.2 },
  { id: 'light',       label: 'Lightly active', hint: '1–3 gentle sessions / wk', mult: 1.375 },
  { id: 'moderate',    label: 'Moderate',      hint: '3–5 sessions / wk',         mult: 1.55 },
  { id: 'active',      label: 'Active',        hint: '6–7 sessions / wk',         mult: 1.725 },
  { id: 'very_active', label: 'Very active',   hint: 'Athlete-level load',        mult: 1.9 },
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
    eatItems: [
      { emoji: '🥬', name: 'Spinazie' },
      { emoji: '🫘', name: 'Linzen' },
      { emoji: '🍫', name: 'Donkere chocolade (70%+)' },
      { emoji: '🥩', name: 'Mager rood vlees' },
      { emoji: '🎃', name: 'Pompoenpitten' },
      { emoji: '🫐', name: 'Bieten' },
      { emoji: '🍵', name: 'Gember- of brandnetelthee' },
      { emoji: '🫛', name: 'Edamame' },
    ],
    avoidItems: ['IJskoude dranken', 'Alcohol', 'Veel bewerkte suiker', 'Overtollige cafeïne'],
    hydrationTip: 'Warme dranken verlichten krampen — probeer gemberthee of warme bouillon met een snufje zeezout.',
    why: 'IJzer aanvullen na het bloedverlies ondersteunt je energie en stemming. Vitamine C helpt ijzer beter opnemen.',
  },
  [PHASES.FOLLICULAR]: {
    headline: 'Fris & gefermenteerd',
    eatItems: [
      { emoji: '🌱', name: 'Spruiten & kiemen' },
      { emoji: '🥚', name: 'Eieren' },
      { emoji: '🥛', name: 'Kefir of yoghurt' },
      { emoji: '🍋', name: 'Citrusfruit' },
      { emoji: '🌿', name: 'Rucola & veldsla' },
      { emoji: '🫙', name: 'Zuurkool of kimchi' },
      { emoji: '🥒', name: 'Komkommer & courgette' },
      { emoji: '🌾', name: 'Gekiemd graan' },
    ],
    avoidItems: ['Zwaar bewerkt eten', 'Overmatig alcohol', 'Veel suiker', 'Vet fastfood'],
    hydrationTip: 'Citroenwater of kombucha geeft een zachte probiotische boost bij je hydratatie.',
    why: 'Stijgend oestrogeen past goed bij lichte, probiotische voeding die de lever vriendelijk ondersteunt.',
  },
  [PHASES.OVULATORY]: {
    headline: 'Antioxidanten & zink',
    eatItems: [
      { emoji: '🍓', name: 'Rood fruit (aardbeien, kersen)' },
      { emoji: '🫐', name: 'Bosbessen' },
      { emoji: '🥦', name: 'Broccoli & bloemkool' },
      { emoji: '🥬', name: 'Groene bladgroenten' },
      { emoji: '🌰', name: 'Walnoten & cashews' },
      { emoji: '🎃', name: 'Pompoenpitten (zink!)' },
      { emoji: '🐚', name: 'Oesters of mosselen' },
      { emoji: '🌾', name: 'Quinoa' },
    ],
    avoidItems: ['Sterk bewerkte koolhydraten', 'Alcohol', 'Overtollig zout', 'Suikerhoudende dranken'],
    hydrationTip: 'Je lichaamstemperatuur is iets hoger rond ovulatie — drink extra en voeg elektrolyten toe via kokoswater.',
    why: 'Vezels en kruisbloemige groenten helpen je lever om de piek van oestrogeen soepel te verwerken.',
  },
  [PHASES.LUTEAL]: {
    headline: 'Magnesium & complexe koolhydraten',
    eatItems: [
      { emoji: '🎃', name: 'Pompoenpitten' },
      { emoji: '🍌', name: 'Banaan' },
      { emoji: '🥑', name: 'Avocado' },
      { emoji: '🍠', name: 'Zoete aardappel' },
      { emoji: '🍫', name: 'Donkere chocolade (70%+)' },
      { emoji: '🥣', name: 'Havermout' },
      { emoji: '🫘', name: 'Linzen & kikkererwten' },
      { emoji: '🌾', name: 'Volkorenbrood' },
    ],
    avoidItems: ['Veel cafeïne', 'Alcohol (verergert PMS)', 'Geraffineerde suiker', 'Veel zout'],
    hydrationTip: 'Magnesiumrijke thee (brandnetel, kamille) kalmeert het zenuwstelsel en bevordert de slaap.',
    why: 'Progesteron vertraagt de spijsvertering — vezels, gefermenteerde voeding en magnesium houden je darm kalm.',
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
