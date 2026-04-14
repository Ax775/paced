/**
 * Aura — Cycle Calculation Engine
 * ---------------------------------
 * Pure functions only. No DOM, no React, no storage.
 * Everything the UI needs about "where am I in my cycle right now"
 * flows through `getCycleState(profile, today)`.
 *
 * Phase model (28-day reference, proportionally scaled to user length):
 *
 *   Menstrual   days 1 — 5     (bleed)
 *   Follicular  days 6 — 13    (rising estrogen)
 *   Ovulatory   days 14 — 16   (peak estrogen, LH surge)
 *   Luteal      days 17 — end  (rising then falling progesterone)
 *
 * Cycle lengths vary person-to-person, so instead of hard day numbers
 * we scale each phase's share of the 28-day reference to the user's
 * own cycle length. This keeps bio-individuality front-and-centre.
 */

export const PHASES = /** @type {const} */ ({
  MENSTRUAL:  'menstrual',
  FOLLICULAR: 'follicular',
  OVULATORY:  'ovulatory',
  LUTEAL:     'luteal',
});

/**
 * Reference length (in days) of each phase in a canonical 28-day cycle.
 * Used to compute proportional boundaries for arbitrary cycle lengths.
 */
const REFERENCE_28 = {
  [PHASES.MENSTRUAL]:  5,
  [PHASES.FOLLICULAR]: 8,
  [PHASES.OVULATORY]:  3,
  [PHASES.LUTEAL]:    12,
};

/**
 * Human-readable metadata for each phase. Kept here (not in a separate
 * JSON) so the cycle engine is a single self-contained module — the UI
 * can import `PHASE_META[phase]` for copy without touching other files.
 */
export const PHASE_META = {
  [PHASES.MENSTRUAL]: {
    label:    'Menstrual',
    subtitle: 'Rest & restore',
    blurb:    'Energy is naturally lower. Honour it — warm, iron-rich meals and gentle movement.',
    accent:   'terracotta',
    hue:      '#C78264',
    bg:       '#F4E2D8',
  },
  [PHASES.FOLLICULAR]: {
    label:    'Follicular',
    subtitle: 'Rise & create',
    blurb:    'Estrogen climbs and so does energy. Fresh, light foods and new experiments land well.',
    accent:   'sage',
    hue:      '#87A074',
    bg:       '#E2E9DC',
  },
  [PHASES.OVULATORY]: {
    label:    'Ovulatory',
    subtitle: 'Peak & connect',
    blurb:    'Peak estrogen, peak energy. Fibre and anti-inflammatory foods support a smooth transition.',
    accent:   'sage',
    hue:      '#6B8559',
    bg:       '#E2E9DC',
  },
  [PHASES.LUTEAL]: {
    label:    'Luteal',
    subtitle: 'Nourish & ground',
    blurb:    'Your body burns more fuel now. Extra calories, complex carbs, and magnesium are your friends.',
    accent:   'terracotta',
    hue:      '#B06849',
    bg:       '#EDE6D3',
  },
};

/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Strip time-of-day so date-diffs are whole days and timezone-stable. */
export function atMidnight(input) {
  const d = input instanceof Date ? new Date(input) : new Date(String(input));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole days between two dates (b - a). Always integer, never negative NaN. */
export function daysBetween(a, b) {
  const aM = atMidnight(a).getTime();
  const bM = atMidnight(b).getTime();
  return Math.floor((bM - aM) / MS_PER_DAY);
}

/** ISO yyyy-mm-dd from a Date or parseable date string. Local-tz, not UTC. */
export function toISODate(input = new Date()) {
  const d = input instanceof Date ? new Date(input) : new Date(String(input));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ------------------------------------------------------------------ */
/*  Phase math                                                         */
/* ------------------------------------------------------------------ */

/**
 * Build ordered phase boundaries for a cycle of `cycleLength` days.
 * Returns an array of `{ phase, startDay, endDay, length }` where day 1
 * is the first day of bleeding.
 *
 * Menstrual length stays fixed (5 days) — bleeds don't usually scale
 * with cycle length. The remaining 23 reference days are redistributed
 * proportionally across Follicular / Ovulatory / Luteal.
 */
export function buildPhaseMap(cycleLength) {
  const len = clampCycleLength(cycleLength);
  const menstrual = REFERENCE_28[PHASES.MENSTRUAL];
  const remaining = len - menstrual;

  // Proportional share of the non-menstrual days.
  const nonMenstrualRef =
    REFERENCE_28[PHASES.FOLLICULAR] +
    REFERENCE_28[PHASES.OVULATORY] +
    REFERENCE_28[PHASES.LUTEAL];

  const follicular = Math.round(
    (REFERENCE_28[PHASES.FOLLICULAR] / nonMenstrualRef) * remaining
  );
  const ovulatory  = Math.max(
    2,
    Math.round((REFERENCE_28[PHASES.OVULATORY] / nonMenstrualRef) * remaining)
  );
  // Luteal soaks up any rounding drift so the total equals `len`.
  const luteal = remaining - follicular - ovulatory;

  const lengths = {
    [PHASES.MENSTRUAL]:  menstrual,
    [PHASES.FOLLICULAR]: follicular,
    [PHASES.OVULATORY]:  ovulatory,
    [PHASES.LUTEAL]:     luteal,
  };

  const order = [
    PHASES.MENSTRUAL,
    PHASES.FOLLICULAR,
    PHASES.OVULATORY,
    PHASES.LUTEAL,
  ];

  let cursor = 1;
  return order.map((phase) => {
    const length   = lengths[phase];
    const startDay = cursor;
    const endDay   = cursor + length - 1;
    cursor = endDay + 1;
    return { phase, startDay, endDay, length };
  });
}

/** Given a cycle-day (1..len), return the matching phase. */
export function phaseForCycleDay(cycleDay, cycleLength) {
  const map = buildPhaseMap(cycleLength);
  for (const slot of map) {
    if (cycleDay >= slot.startDay && cycleDay <= slot.endDay) return slot.phase;
  }
  return PHASES.LUTEAL;
}

/** Clamp a user-provided cycle length into a physiologically sensible range. */
export function clampCycleLength(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 28;
  return Math.min(45, Math.max(21, Math.round(v)));
}

/**
 * Given the first day of a user's last period and their cycle length,
 * return the 1-indexed day of their *current* cycle for `today`.
 * Handles the case where multiple cycles have elapsed since `lastPeriod`.
 */
export function currentCycleDay(lastPeriodStart, cycleLength, today = new Date()) {
  const len = clampCycleLength(cycleLength);
  const diff = daysBetween(lastPeriodStart, today);
  // ((diff % len) + len) % len handles future-dated mistakes gracefully.
  const offset = ((diff % len) + len) % len;
  return offset + 1; // 1-indexed
}

/* ------------------------------------------------------------------ */
/*  Top-level entry point                                              */
/* ------------------------------------------------------------------ */

/**
 * Compute everything the dashboard needs to render "today".
 *
 * @param {object} profile
 * @param {Date|string} profile.lastPeriodStart  First day of most recent bleed
 * @param {number}      profile.cycleLength      User-reported cycle length
 * @param {Date}        [today]                  Override for testing
 */
export function getCycleState(profile, today = new Date()) {
  const cycleLength = clampCycleLength(profile?.cycleLength ?? 28);
  const start       = profile?.lastPeriodStart;

  if (!start) {
    // No period data yet — fall back to a neutral follicular-ish view
    // so the dashboard still renders something calm rather than a warning.
    return {
      cycleLength,
      cycleDay:       null,
      phase:          PHASES.FOLLICULAR,
      phaseMeta:      PHASE_META[PHASES.FOLLICULAR],
      phaseMap:       buildPhaseMap(cycleLength),
      daysUntilNext:  null,
      progressPct:    0,
      hasData:        false,
    };
  }

  const cycleDay = currentCycleDay(start, cycleLength, today);
  const phase    = phaseForCycleDay(cycleDay, cycleLength);
  const phaseMap = buildPhaseMap(cycleLength);

  return {
    cycleLength,
    cycleDay,
    phase,
    phaseMeta:     PHASE_META[phase],
    phaseMap,
    daysUntilNext: Math.max(0, cycleLength - cycleDay + 1) % cycleLength || cycleLength,
    progressPct:   Math.round((cycleDay / cycleLength) * 100),
    hasData:       true,
  };
}

/* ------------------------------------------------------------------ */
/*  Period log + cycle-length learning                                 */
/* ------------------------------------------------------------------ */

/**
 * If a fresh log lands within this many days of the previous one, treat
 * it as the *same* bleed continuing — not a new cycle. (Average bleed
 * is ~5 days; we use 10 to give a comfortable margin.)
 */
const SAME_PERIOD_GUARD_DAYS = 10;

/** How many recent period starts to average when learning cycle length. */
const LEARN_WINDOW = 4; // 4 starts → 3 gaps → smooth average

/**
 * Average of the last `LEARN_WINDOW` gaps in a sorted history of
 * period-start ISO dates. Falls back to the provided default if there
 * aren't enough data points yet.
 */
function learnedCycleLength(history, fallback) {
  if (!Array.isArray(history) || history.length < 2) return fallback;
  const recent = history.slice(-LEARN_WINDOW);
  const gaps = [];
  for (let i = 1; i < recent.length; i++) {
    gaps.push(daysBetween(recent[i - 1], recent[i]));
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return clampCycleLength(Math.round(avg));
}

/**
 * Pure profile transform: "the user said her period started today".
 *
 * - Seeds period history with the onboarding `lastPeriodStart` if it
 *   isn't already in there, so the very first log can compute a gap.
 * - If the new entry is within SAME_PERIOD_GUARD_DAYS of the previous
 *   entry, it's treated as the same bleed and the profile is returned
 *   unchanged (referentially equal — handy for "did anything change?"
 *   checks at the call site).
 * - Otherwise appends, recomputes cycleLength as a rolling average of
 *   the most recent gaps, and updates `lastPeriodStart`.
 *
 * @returns {object} possibly the same profile (no-op) or a new one
 */
export function logPeriodStart(profile, today = new Date()) {
  if (!profile) return profile;
  const dateISO = toISODate(today);

  // Build a sorted, de-duplicated history seeded from lastPeriodStart.
  const seed = profile.lastPeriodStart ? toISODate(profile.lastPeriodStart) : null;
  const set = new Set(Array.isArray(profile.periodHistory) ? profile.periodHistory : []);
  if (seed) set.add(seed);

  // Already logged today — nothing to do.
  if (set.has(dateISO)) return profile;

  const history = Array.from(set).sort();
  const last = history[history.length - 1];

  if (last && daysBetween(last, dateISO) < SAME_PERIOD_GUARD_DAYS) {
    // Same bleed continuing. Don't pollute history, don't relearn.
    return profile;
  }

  history.push(dateISO);
  const cycleLength = learnedCycleLength(history, profile.cycleLength);

  return {
    ...profile,
    periodHistory:    history,
    lastPeriodStart:  dateISO,
    cycleLength,
  };
}

/**
 * Inverse of `logPeriodStart` for a given day — used by the "undo"
 * affordance right after a tap. Removes the dated entry, rolls
 * `lastPeriodStart` back to the previous one in history, and recomputes
 * cycleLength from what's left.
 */
export function unlogPeriodStart(profile, today = new Date()) {
  if (!profile?.periodHistory?.length) return profile;
  const dateISO = toISODate(today);
  const idx = profile.periodHistory.lastIndexOf(dateISO);
  if (idx === -1) return profile;

  const history = profile.periodHistory.slice();
  history.splice(idx, 1);

  const lastPeriodStart = history.length
    ? history[history.length - 1]
    : profile.lastPeriodStart;

  return {
    ...profile,
    periodHistory:   history,
    lastPeriodStart,
    cycleLength:     learnedCycleLength(history, profile.cycleLength),
  };
}

/**
 * Was there an *explicit* period-start log on the given day?
 * Only considers entries actually in `periodHistory` so the undo
 * affordance never tries to roll back the onboarding seed value.
 */
export function isPeriodLoggedOn(profile, day = new Date()) {
  if (!Array.isArray(profile?.periodHistory)) return false;
  return profile.periodHistory.includes(toISODate(day));
}
