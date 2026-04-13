/**
 * Aura — Daily Insights
 * ---------------------
 * Deterministic "tip of the day" generator. We pick from a curated pool
 * per phase using a date-seeded index so:
 *
 *   1. The tip is stable across re-renders on the same day.
 *   2. It rotates naturally as the user moves through her cycle.
 *   3. No network call required — fully offline / PWA-friendly.
 */

import { PHASES } from './cycle.js';

const TIPS = {
  [PHASES.MENSTRUAL]: [
    'A warm bowl of lentil soup today — iron plus comfort in one.',
    'Rest is a nutrient too. Permission granted.',
    'Swap your afternoon coffee for ginger tea; easier on a sensitive system.',
    'Dark leafy greens with a squeeze of lemon boosts iron absorption ~3×.',
    'Cramps? Magnesium-rich cacao and pumpkin seeds are a quiet remedy.',
  ],
  [PHASES.FOLLICULAR]: [
    'Try one fermented food today — a spoon of sauerkraut counts.',
    'Estrogen is rising. Your creative brain is too — capture an idea.',
    'Sprouted grains digest more gently and suit rising energy.',
    'Add a handful of bitter greens; they gently support liver clearance.',
    'This is a great phase to try a new recipe — your gut tolerates novelty best now.',
  ],
  [PHASES.OVULATORY]: [
    'Cruciferous veg + healthy fat supports smooth estrogen metabolism.',
    'Hydrate generously — you may notice a natural warmth today.',
    'Peak energy: schedule the harder workout, then refuel with protein.',
    'A tablespoon of ground flax supports hormone balance — stir it into anything.',
    'Berries with breakfast — antioxidants love ovulation.',
  ],
  [PHASES.LUTEAL]: [
    'Cravings are data, not weakness. Reach for sweet potato before sweet snacks.',
    'Your body burns ~250 extra calories now. Eat to match, without guilt.',
    'Dark chocolate (70%+) genuinely helps — magnesium, not marketing.',
    'Slow down and add fibre: oats, chia, or a baked apple.',
    'Salt a little extra today — progesterone thins sodium more than you think.',
    'Fermented foods now will thank you through your next bleed.',
  ],
};

/**
 * Turn an ISO date (YYYY-MM-DD) into a small integer hash.
 * Deterministic, no crypto needed — just enough spread to rotate tips.
 */
function seedFromDate(date) {
  const iso = toISODate(date);
  let h = 0;
  for (let i = 0; i < iso.length; i++) h = (h * 31 + iso.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function toISODate(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get the tip of the day for the given phase + date.
 * Same inputs always produce the same tip.
 */
export function getDailyInsight(phase, date = new Date()) {
  const pool = TIPS[phase] ?? TIPS[PHASES.FOLLICULAR];
  const idx  = seedFromDate(date) % pool.length;
  return {
    text:  pool[idx],
    phase,
    date:  toISODate(date),
  };
}

export { TIPS as _TIPS_FOR_TESTS };
