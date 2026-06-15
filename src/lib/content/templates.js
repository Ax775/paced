/**
 * templates.js — Runtime template registry + slot interpolation.
 * --------------------------------------------------------------
 * Loads the committed seed templates (generated offline by Opus/Fable) and
 * fills their slots from user state. This is the FREE, INSTANT, OFFLINE path:
 * no network, no AI. The AI path (Haiku) lives in personalize.js and is only
 * used for free-text context.
 *
 * Seed JSON is imported statically so esbuild inlines it into the bundle —
 * the PWA stays fully functional offline.
 */

import { BRAND_NAME } from '../../config/brand.js';
import { CATEGORY_IDS, extractSlots, getCategory } from './spec.js';

// Import attributes (`with { type: 'json' }`) are the ECMAScript standard and
// required by modern Node ESM; esbuild and vitest both honour them and inline
// the JSON at build time so the bundle stays attribute-free.
import dailyCheckin from '../../../content/templates/daily-checkin.json' with { type: 'json' };
import cyclePhase from '../../../content/templates/cycle-phase.json' with { type: 'json' };
import sleep from '../../../content/templates/sleep.json' with { type: 'json' };
import movement from '../../../content/templates/movement.json' with { type: 'json' };
import nutrition from '../../../content/templates/nutrition.json' with { type: 'json' };
import mindfulness from '../../../content/templates/mindfulness.json' with { type: 'json' };
import notification from '../../../content/templates/notification.json' with { type: 'json' };

/** category id → entries. */
export const REGISTRY = Object.freeze({
  'daily-checkin': dailyCheckin,
  'cycle-phase': cyclePhase,
  sleep,
  movement,
  nutrition,
  mindfulness,
  notification,
});

/** Localised, human-readable phase words injected into the {phase} slot. */
const PHASE_WORDS = {
  nl: { menstrual: 'menstruatie', follicular: 'folliculaire', ovulatory: 'ovulatie', luteal: 'luteale' },
  en: { menstrual: 'menstrual', follicular: 'follicular', ovulatory: 'ovulatory', luteal: 'luteal' },
};

/** Deterministic small hash so the same inputs yield the same pick on a given day. */
function seedFrom(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Resolve the value for a slot from user state.
 * `brand` always comes from config; never from caller-supplied data.
 */
function slotValue(slot, state, locale) {
  switch (slot) {
    case 'brand':
      return BRAND_NAME;
    case 'name':
      return typeof state.name === 'string' ? state.name.trim() : '';
    case 'phase': {
      const words = PHASE_WORDS[locale] || PHASE_WORDS.nl;
      return words[state.phase] || '';
    }
    case 'cycleDay':
      return state.cycleDay != null ? String(state.cycleDay) : '';
    case 'streak':
      return state.streak != null ? String(state.streak) : '';
    default:
      return '';
  }
}

/**
 * Fill {slot} placeholders. When {name} is empty, a leading "{name}, " / "{name} "
 * is stripped and the sentence is re-capitalised so the copy reads naturally.
 *
 * @param {string} template
 * @param {object} [state]
 * @param {string} [locale]
 */
export function interpolate(template, state = {}, locale = 'nl') {
  let out = template;

  const name = slotValue('name', state, locale);
  if (!name) {
    // drop "{name}," / "{name}" (plus following punctuation/space) anywhere it leads a clause
    out = out.replace(/\{name\}\s*,?\s*/g, '');
  }

  out = out.replace(/\{(\w+)\}/g, (_, slot) => slotValue(slot, state, locale));

  // tidy: collapse double spaces and re-capitalise the first letter
  out = out.replace(/\s{2,}/g, ' ').trim();
  if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}

/**
 * Does a template's required slots all resolve to non-empty values?
 * (brand/name are optional-friendly; phase/cycleDay/streak are required when used.)
 */
function isEligible(entry, state, locale) {
  for (const slot of extractSlots(entry.template)) {
    if (slot === 'name' || slot === 'brand') continue;
    if (!slotValue(slot, state, locale)) return false;
  }
  return true;
}

/**
 * Deterministically pick one template for a category and render it.
 *
 * @param {string} category   one of CATEGORY_IDS
 * @param {object} [opts]
 * @param {string} [opts.locale='nl']
 * @param {string} [opts.phase] cycle phase key (menstrual|follicular|ovulatory|luteal)
 * @param {object} [opts.state] full state passed to interpolate (name, cycleDay, streak…)
 * @param {string} [opts.seed]  stable seed (e.g. ISO date) for the daily pick
 * @returns {{ id: string, text: string } | null}
 */
export function selectTemplate(category, opts = {}) {
  const { locale = 'nl', phase, seed = '', state = {} } = opts;
  if (!CATEGORY_IDS.includes(category)) return null;

  const fullState = { ...state, phase: phase ?? state.phase };
  const def = getCategory(category);

  let pool = REGISTRY[category].filter((e) => e.locale === locale);
  if (def?.phaseAware && fullState.phase) {
    // phase-aware: every template injects {phase}, so any in-locale entry works;
    // eligibility filtering below handles required slots.
  }
  pool = pool.filter((e) => isEligible(e, fullState, locale));
  if (pool.length === 0) return null;

  const idx = seedFrom(`${category}|${locale}|${fullState.phase || ''}|${seed}`) % pool.length;
  const entry = pool[idx];
  return { id: entry.id, text: interpolate(entry.template, fullState, locale) };
}
