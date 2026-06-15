/**
 * spec.js — Content taxonomy + template schema (single source of truth).
 * ----------------------------------------------------------------------
 * Shared by the offline generators (scripts/*.mjs) and the runtime
 * (lib/content/*). Pure ESM, no React/DOM — safe to import from Node.
 *
 * Template schema (one entry):
 *   {
 *     id:          string   // unique within its category file, kebab-case
 *     category:    string   // one of CATEGORY_IDS
 *     locale:      string   // one of LOCALES
 *     template:    string   // copy with {slot} placeholders
 *     slots:       string[] // slot names used, subset of KNOWN_SLOTS
 *     constraints: string[] // human-readable authoring constraints
 *   }
 */

/** Locales mirror i18n.js SUPPORTED_LOCALES, declared here to stay React-free. */
export const LOCALES = ['nl', 'en'];

/** Minimum variants required per category, per locale. */
export const MIN_VARIANTS_PER_LOCALE = 8;

/**
 * Slot vocabulary the runtime knows how to fill. `brand` is filled from
 * BRAND_NAME (config), never hardcoded in template copy.
 */
export const KNOWN_SLOTS = ['name', 'brand', 'phase', 'cycleDay', 'streak'];

/**
 * Content categories. `phaseAware` categories use the {phase} slot and should
 * cover all four cycle phases across their variants.
 */
export const CATEGORIES = Object.freeze([
  {
    id: 'daily-checkin',
    label: 'Dagelijkse check-in',
    description: 'Warme dagopening die uitnodigt tot inchecken bij jezelf, zonder oordeel.',
    slots: ['name'],
    phaseAware: false,
  },
  {
    id: 'cycle-phase',
    label: 'Cyclusfase-inzicht',
    description:
      'Informatief inzicht per cyclusfase (menstruatie, folliculair, ovulatie, luteaal). Beschrijvend, niet voorschrijvend.',
    slots: ['name', 'phase'],
    phaseAware: true,
  },
  {
    id: 'sleep',
    label: 'Slaap',
    description: 'Zachte slaap-ondersteuning en rust, zonder prestatiedruk.',
    slots: ['name'],
    phaseAware: false,
  },
  {
    id: 'movement',
    label: 'Beweging',
    description: 'Beweging als plezier en luisteren naar je lichaam, nooit als straf of compensatie.',
    slots: ['name', 'phase'],
    phaseAware: true,
  },
  {
    id: 'nutrition',
    label: 'Voeding',
    description:
      'Algemene, ondersteunende voeding. GEEN calorie-getallen, GEEN restrictieve framing — voeding als verzorging.',
    slots: ['name'],
    phaseAware: false,
  },
  {
    id: 'mindfulness',
    label: 'Mindfulness',
    description: 'Korte momenten van aandacht, adem en zelfcompassie.',
    slots: ['name'],
    phaseAware: false,
  },
  {
    id: 'notification',
    label: 'Notificatie-copy',
    description: 'Korte push-copy (≤ ~90 tekens), uitnodigend en nooit dwingend.',
    slots: ['name'],
    phaseAware: false,
  },
]);

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

/** Cycle phases used by phase-aware categories (mirror cycle.js PHASES values). */
export const PHASE_KEYS = ['menstrual', 'follicular', 'ovulatory', 'luteal'];

/** Look up a category definition by id. */
export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

const SLOT_RE = /\{(\w+)\}/g;

/** Extract slot names referenced in a template string. */
export function extractSlots(template) {
  const found = new Set();
  let m;
  SLOT_RE.lastIndex = 0;
  while ((m = SLOT_RE.exec(template)) !== null) found.add(m[1]);
  return [...found];
}

/**
 * Validate one template entry against the schema + taxonomy.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateTemplate(entry) {
  const errors = [];
  const isStr = (v) => typeof v === 'string' && v.length > 0;

  if (!entry || typeof entry !== 'object') {
    return { ok: false, errors: ['entry is not an object'] };
  }
  if (!isStr(entry.id)) errors.push('id must be a non-empty string');
  else if (!/^[a-z0-9-]+$/.test(entry.id)) errors.push(`id "${entry.id}" must be kebab-case`);

  if (!CATEGORY_IDS.includes(entry.category)) {
    errors.push(`category "${entry.category}" is not a known category`);
  }
  if (!LOCALES.includes(entry.locale)) {
    errors.push(`locale "${entry.locale}" is not supported`);
  }
  if (!isStr(entry.template)) errors.push('template must be a non-empty string');

  if (!Array.isArray(entry.slots)) {
    errors.push('slots must be an array');
  } else {
    for (const s of entry.slots) {
      if (!KNOWN_SLOTS.includes(s)) errors.push(`unknown slot "${s}"`);
    }
    // every placeholder in the template must be declared in slots
    if (isStr(entry.template)) {
      for (const used of extractSlots(entry.template)) {
        if (!entry.slots.includes(used)) {
          errors.push(`template uses {${used}} but it is not declared in slots`);
        }
      }
    }
  }
  if (!Array.isArray(entry.constraints)) errors.push('constraints must be an array');

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a whole category file: array of entries + category coverage.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCategoryFile(categoryId, entries) {
  const errors = [];
  if (!Array.isArray(entries)) return { ok: false, errors: ['file must be a JSON array'] };

  const ids = new Set();
  for (const [i, entry] of entries.entries()) {
    const { ok, errors: errs } = validateTemplate(entry);
    if (!ok) errors.push(`[${i}] ${errs.join('; ')}`);
    if (entry && entry.category !== categoryId) {
      errors.push(`[${i}] category "${entry?.category}" does not match file "${categoryId}"`);
    }
    if (entry && ids.has(entry.id)) errors.push(`duplicate id "${entry.id}"`);
    if (entry) ids.add(entry.id);
  }

  for (const locale of LOCALES) {
    const count = entries.filter((e) => e && e.locale === locale).length;
    if (count < MIN_VARIANTS_PER_LOCALE) {
      errors.push(`locale "${locale}" has ${count} variants, need ≥ ${MIN_VARIANTS_PER_LOCALE}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
