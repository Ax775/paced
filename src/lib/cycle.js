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
    label:    'Menstruatie',
    subtitle: 'Rust & herstel',
    blurb:    'Energie is van nature lager. Eer dat — warme, ijzerrijke maaltijden en zachte beweging.',
    accent:   'terracotta',
    hue:      '#C78264',
    bg:       '#F4E2D8',
  },
  [PHASES.FOLLICULAR]: {
    label:    'Folliculair',
    subtitle: 'Opbouw & creatie',
    blurb:    'Oestrogeen stijgt en daarmee je energie. Lichte, frisse voeding en nieuwe experimenten landen goed.',
    accent:   'sage',
    hue:      '#87A074',
    bg:       '#E2E9DC',
  },
  [PHASES.OVULATORY]: {
    label:    'Ovulatie',
    subtitle: 'Piek & verbinding',
    blurb:    'Piek oestrogeen, piek energie. Vezels en ontstekingsremmende voeding ondersteunen een soepele overgang.',
    accent:   'sage',
    hue:      '#6B8559',
    bg:       '#E2E9DC',
  },
  [PHASES.LUTEAL]: {
    label:    'Luteaal',
    subtitle: 'Voeden & gronden',
    blurb:    'Je lichaam verbrandt nu meer energie. Extra calorieën, complexe koolhydraten en magnesium zijn je vrienden.',
    accent:   'terracotta',
    hue:      '#B06849',
    bg:       '#EDE6D3',
  },
};

/**
 * Hormonale uitleg per fase — geserveerd door het (i)-icoontje naast
 * de fasenaam. Bewust geen medisch jargon: de "tone" is bemoedigend,
 * niet diagnostisch. Lees deze als rustige micro-lessen, geen
 * waarschuwingen.
 */
export const PHASE_HORMONES = {
  [PHASES.MENSTRUAL]: {
    title:   'Wat gebeurt er hormonaal?',
    summary: 'Oestrogeen en progesteron zijn op hun laagst.',
    body:    'Je baarmoederslijmvlies komt los — een maandelijkse herstart. Omdat beide hormonen laag staan, mis je de oppepper waar je in andere fases op leunt.',
    moodHeadline: 'Wat je kunt voelen',
    mood:    'Vermoeidheid, gevoeligheid, behoefte aan stilte. Dat is geen luiheid — dat is je lichaam dat hard werkt.',
    affirmation: 'Rust is productief. Eer wat je lichaam vraagt en de rest komt vanzelf.',
  },
  [PHASES.FOLLICULAR]: {
    title:   'Wat gebeurt er hormonaal?',
    summary: 'Oestrogeen stijgt zachtjes weer aan.',
    body:    'Een nieuwe eicel rijpt. Oestrogeen lift je energie, je focus en je creatieve sap mee omhoog — een natuurlijk groeimoment.',
    moodHeadline: 'Wat je kunt voelen',
    mood:    'Frisheid, optimisme, zin om dingen aan te pakken. Sociale contacten voelen lichter, leren gaat soepeler.',
    affirmation: 'Een goed moment om iets nieuws te beginnen — een gewoonte, een gesprek, een plan.',
  },
  [PHASES.OVULATORY]: {
    title:   'Wat gebeurt er hormonaal?',
    summary: 'Oestrogeen piekt, LH zorgt voor de eisprong.',
    body:    'Je lichaam laat een eicel los. Hormonen staan op hun stralendst — je communicatie, charisma en zelfvertrouwen profiteren mee.',
    moodHeadline: 'Wat je kunt voelen',
    mood:    'Stralend, verbonden, zelfverzekerd. Je woorden komen makkelijker, je lichaam voelt sterker.',
    affirmation: 'Benut deze piek voor wat échte aanwezigheid vraagt: gesprekken, presentaties, samen sporten.',
  },
  [PHASES.LUTEAL]: {
    title:   'Wat gebeurt er hormonaal?',
    summary: 'Progesteron neemt het over.',
    body:    'Na de eisprong vertraagt je systeem. Progesteron werkt rustgevend, maar maakt je ook gevoeliger voor prikkels en stemmingen.',
    moodHeadline: 'Wat je kunt voelen',
    mood:    'Voller, emotioneler, soms prikkelbaar. Behoefte aan grenzen, comfort en voorspelbaarheid.',
    affirmation: 'Dit is geen achteruitgang — het is je lichaam dat ruimte vraagt. Zelfzorg en grenzen zijn nu zorg, geen luxe.',
  },
};

/**
 * Sportadvies per cyclusfase. Korte vuistregels die de UI als chips
 * en suggesties toont. Bewust 3 voorbeelden per fase: genoeg variatie,
 * te overzien op één scherm.
 */
export const PHASE_SPORTS = {
  [PHASES.MENSTRUAL]: {
    intensity: 'light',
    headline:  'Lichte beweging',
    why:       'Je energie is laag — zachte beweging ondersteunt herstel zonder uit te putten.',
    examples:  ['Yoga (yin / restorative)', 'Wandelen in de natuur', 'Stretching of mobility'],
  },
  [PHASES.FOLLICULAR]: {
    intensity: 'moderate',
    headline:  'Opbouwend',
    why:       'Stijgend oestrogeen verhoogt je energie en spierherstel — bouw kalm op.',
    examples:  ['Pilates of barre', 'Lichte cardio of fietsen', 'Krachttraining (lager volume)'],
  },
  [PHASES.OVULATORY]: {
    intensity: 'intense',
    headline:  'Krachtig',
    why:       'Piek oestrogeen, piek kracht — een goed moment voor je zwaardere training.',
    examples:  ['HIIT of intervaltraining', 'Hardlopen', 'Sportles of teamactiviteit'],
  },
  [PHASES.LUTEAL]: {
    intensity: 'moderate',
    headline:  'Matig & rustgevend',
    why:       'Progesteron vraagt om kalmere intensiteit — voel goed van bewegen, niet uitgeput.',
    examples:  ['Yoga (vinyasa rustig)', 'Zwemmen', 'Rustige fietssessie'],
  },
};

/**
 * Sportintensiteit-IDs zoals opgeslagen in `log.sportIntensity` —
 * hier centraal gedefinieerd zodat de UI en pure logica nooit uit
 * elkaar lopen.
 */
export const SPORT_INTENSITIES = [
  { id: 'rest',     label: 'Rust',      hint: 'Vandaag rusten, ook beweging' },
  { id: 'light',    label: 'Licht',     hint: 'Wandelen, yoga, stretchen' },
  { id: 'moderate', label: 'Matig',     hint: 'Cardio, pilates, krachtoefeningen' },
  { id: 'intense',  label: 'Intensief', hint: 'HIIT, hardlopen, zware kracht' },
];

/**
 * Anticonceptie-opties zoals opgeslagen in `profile.contraception`.
 * Standaard `undefined` = niet ingesteld; UI toont neutrale view.
 *
 * `affectsCycle: true` markeert methodes die de natuurlijke cyclus
 * onderdrukken of veranderen — de UI gebruikt deze hint om voorzichtig
 * te zijn met fertile-window claims (een vrouw aan de combinatiepil
 * heeft strikt genomen geen biologische ovulatie).
 */
export const CONTRACEPTION_OPTIONS = [
  { id: 'none',          label: 'Geen',                affectsCycle: false },
  { id: 'combined-pill', label: 'Combinatiepil',       affectsCycle: true  },
  { id: 'mini-pill',     label: 'Mini-pil',            affectsCycle: true  },
  { id: 'hormonal-iud',  label: 'Hormoonspiraal',      affectsCycle: true  },
  { id: 'copper-iud',    label: 'Koperspiraal',        affectsCycle: false },
  { id: 'implant',       label: 'Implanon',            affectsCycle: true  },
  { id: 'injection',     label: 'Prikpil',             affectsCycle: true  },
  { id: 'ring',          label: 'Anticonceptiering',   affectsCycle: true  },
  { id: 'patch',         label: 'Pleister',            affectsCycle: true  },
  { id: 'barrier',       label: 'Condoom of diafragma', affectsCycle: false },
];

/**
 * Zwangerschap-intentie zoals opgeslagen in `profile.pregnancyIntent`.
 * Driver voor conditional rendering rond het vruchtbaar venster:
 *
 *   trying    → vruchtbare dagen worden prominent getoond + ovulatie-hint
 *   avoiding  → vruchtbare dagen tonen een zachte bescherming-reminder
 *   none/null → neutrale view (huidig gedrag)
 */
export const PREGNANCY_INTENTS = [
  { id: 'none',     label: 'Geen voorkeur',           hint: 'Standaardweergave' },
  { id: 'trying',   label: 'Probeer zwanger te worden', hint: 'Vruchtbaar venster wordt benadrukt' },
  { id: 'avoiding', label: 'Wil niet zwanger worden',   hint: 'Reminder op vruchtbare dagen' },
];

/**
 * Of een gegeven anticonceptiemethode de biologische cyclus onderdrukt.
 * Gebruik dit voordat je vruchtbaar-venster claims maakt — bij hormonale
 * methoden is het venster theoretisch en niet biologisch betrouwbaar.
 */
export function suppressesCycle(contraceptionId) {
  const opt = CONTRACEPTION_OPTIONS.find((c) => c.id === contraceptionId);
  return !!opt?.affectsCycle;
}

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
  // Math.round (not floor): on DST spring-forward, local midnight-to-
  // midnight is 23 hours instead of 24, so floor would silently lose a
  // day. Rounding tolerates the ±1 h drift from either DST transition.
  return Math.round((bM - aM) / MS_PER_DAY);
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
 * `mensDuration` is the user's actual typical bleed length (2..10).
 * Bleed length is biologically independent of cycle length — a 35-day
 * cycler doesn't bleed longer than a 25-day cycler — so we don't scale
 * it. When omitted, falls back to the 5-day reference. The remaining
 * days are redistributed proportionally across Follicular / Ovulatory /
 * Luteal so a shorter or longer bleed doesn't break the rest of the map.
 */
export function buildPhaseMap(cycleLength, mensDuration) {
  const len = clampCycleLength(cycleLength);
  // Clamp to the same 2..10 range the Settings stepper enforces, so the
  // engine can't be poisoned by a corrupted profile value (e.g. 0 or 99).
  const rawMens = Number(mensDuration);
  const menstrual = Number.isFinite(rawMens)
    ? Math.min(10, Math.max(2, Math.round(rawMens)))
    : REFERENCE_28[PHASES.MENSTRUAL];
  // Never let the bleed eat the entire cycle — keep at least 6 days for
  // the other three phases (folliculair gets ~3, ovulation ≥2, luteal ≥1).
  const safeMens  = Math.min(menstrual, Math.max(2, len - 6));
  const remaining = len - safeMens;

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
    [PHASES.MENSTRUAL]:  safeMens,
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
export function phaseForCycleDay(cycleDay, cycleLength, mensDuration) {
  const map = buildPhaseMap(cycleLength, mensDuration);
  for (const slot of map) {
    if (cycleDay >= slot.startDay && cycleDay <= slot.endDay) return slot.phase;
  }
  return PHASES.LUTEAL;
}

/** Clamp a user-provided cycle length into a physiologically sensible range. */
export function clampCycleLength(n) {
  // Treat null / undefined as "no value" → fall back to the 28-day default.
  // (Without this, Number(null) === 0 sneaks through Number.isFinite and
  // gets clamped to 21, which silently corrupts a malformed profile.)
  if (n == null) return 28;
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
  const cycleLength  = clampCycleLength(profile?.cycleLength ?? 28);
  const mensDuration = profile?.mensDuration;
  const start        = profile?.lastPeriodStart;
  const periodEndISO = profile?.lastPeriodEnd ? toISODate(profile.lastPeriodEnd) : null;

  if (!start) {
    // No period data yet — fall back to a neutral follicular-ish view
    // so the dashboard still renders something calm rather than a warning.
    return {
      cycleLength,
      cycleDay:       null,
      phase:          PHASES.FOLLICULAR,
      phaseMeta:      PHASE_META[PHASES.FOLLICULAR],
      phaseMap:       buildPhaseMap(cycleLength, mensDuration),
      daysUntilNext:  null,
      progressPct:    0,
      hasData:        false,
    };
  }

  const cycleDay   = currentCycleDay(start, cycleLength, today);
  let   phase      = phaseForCycleDay(cycleDay, cycleLength, mensDuration);
  const phaseMap   = buildPhaseMap(cycleLength, mensDuration);

  // Per-cycle override: if the user explicitly marked her period as
  // ended (via "Menstruatie afgelopen") and today is strictly past that
  // date, force-promote the phase out of MENSTRUAL into FOLLICULAR.
  // The engine's mensDuration is her *typical* bleed; this respects
  // what actually happened *this* cycle without re-training the average.
  if (phase === PHASES.MENSTRUAL && periodEndISO) {
    const todayISO = toISODate(today);
    if (todayISO > periodEndISO) phase = PHASES.FOLLICULAR;
  }

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
  // Respecteer een handmatig-ingestelde cycluslengte. Als de gebruikster
  // in Instellingen een waarde heeft gezet (`cycleLengthSource === 'manual'`)
  // dan overschrijft auto-learning dat NIET — anders verliest ze haar
  // aanpassing bij de volgende periode-log. Default-source is 'auto'
  // voor profielen van vóór deze fix (gedrag onveranderd voor hen).
  const isManual = profile.cycleLengthSource === 'manual';
  const cycleLength = isManual
    ? clampCycleLength(profile.cycleLength)
    : learnedCycleLength(history, profile.cycleLength);

  return {
    ...profile,
    periodHistory:    history,
    lastPeriodStart:  dateISO,
    // Nieuwe cyclus → eventuele vorige "menstruatie-afgelopen"-marker
    // is irrelevant geworden. Zou-ie blijven staan dan zou de engine
    // direct vanaf cycle-day 1 al uit MENSTRUAL springen omdat
    // todayISO > oude lastPeriodEnd. Daarom hier wissen.
    lastPeriodEnd:    null,
    cycleLength,
  };
}

/**
 * Pure profile transform: "my period actually ended on this day".
 *
 * Stores the end-of-bleed date on the profile so `getCycleState` can
 * promote the phase out of MENSTRUAL early — without messing with the
 * user's *typical* `mensDuration` setting. The engine treats
 * `mensDuration` as the average over many cycles; `lastPeriodEnd` is
 * the per-cycle truth for *this* bleed.
 *
 * Validates that the end-date is on or after the start of the current
 * bleed (a period can't end before it started) — silently no-ops if not.
 *
 * @returns {object} possibly the same profile (no-op) or a new one
 */
export function markPeriodEnded(profile, today = new Date()) {
  if (!profile) return profile;
  const endISO = toISODate(today);
  const startISO = profile.lastPeriodStart ? toISODate(profile.lastPeriodStart) : null;
  // Bescherm tegen "einde vóór start" — kan gebeuren als de gebruiker
  // eerst zonder lastPeriodStart een einde markeert, of als ze een veel
  // oudere datum kiest. Stille no-op: het UI valideert ook, maar de
  // pure logica heeft een eigen barrière nodig.
  if (!startISO || endISO < startISO) return profile;
  if (profile.lastPeriodEnd === endISO) return profile;
  return { ...profile, lastPeriodEnd: endISO };
}

/**
 * Inverse: wis een eerder geplaatste "menstruatie-afgelopen"-marker.
 * Gebruikt door de "ongedaan maken"-link naast de afgelopen-knop.
 */
export function clearPeriodEnd(profile) {
  if (!profile || !profile.lastPeriodEnd) return profile;
  return { ...profile, lastPeriodEnd: null };
}

/**
 * Edit the start date of the most recent bleed in one transaction.
 *
 * Use this when a user logged "today" but realises her period started
 * yesterday (or three days ago). Naïef zou je `unlog` + `log` chainen,
 * maar de `SAME_PERIOD_GUARD_DAYS` in `logPeriodStart` zou het opnieuw
 * loggen kunnen blokkeren als de verschuiving klein is. Deze functie
 * vervangt eenvoudigweg de meest recente entry in `periodHistory` met
 * de nieuwe datum.
 *
 * Silently no-ops on:
 *  - future dates (a period can't start in the future)
 *  - empty / missing periodHistory + no lastPeriodStart
 *  - identical date (same as current)
 *  - dates earlier than the second-most-recent entry (would re-order
 *    history; user should use the calendar's per-day edit for that)
 *
 * @returns {object} possibly the same profile (no-op) or a new one
 */
export function editLastPeriodStart(profile, newDate) {
  if (!profile) return profile;
  const newISO   = toISODate(newDate);
  const todayISO = toISODate(new Date());
  if (newISO > todayISO) return profile; // no future starts

  const history = Array.isArray(profile.periodHistory) ? profile.periodHistory.slice() : [];
  const current = profile.lastPeriodStart ? toISODate(profile.lastPeriodStart) : null;
  if (!current && history.length === 0) return profile;
  if (newISO === current) return profile;

  // Bescherm tegen rommelige geschiedenis: alleen de meest recente entry
  // mag verschuiven, en alleen als de nieuwe datum daarná komt of géén
  // eerdere overlap veroorzaakt. Voor het verschuiven naar een veel
  // oudere datum (vóór de op-één-na laatste log) verwijst de UI naar
  // de kalender.
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    if (newISO <= prev) return profile;
  }

  // Replace the most recent history entry (if any) with newISO.
  if (history.length > 0) {
    history[history.length - 1] = newISO;
  } else {
    history.push(newISO);
  }
  // Dedupe + sort defensively (history should already be sorted).
  const dedup = Array.from(new Set(history)).sort();

  const isManual = profile.cycleLengthSource === 'manual';
  const cycleLength = isManual
    ? clampCycleLength(profile.cycleLength)
    : learnedCycleLength(dedup, profile.cycleLength);

  return {
    ...profile,
    periodHistory:    dedup,
    lastPeriodStart:  newISO,
    // Bij verschuiven van de startdatum verliest een eventuele "afgelopen"-
    // marker zijn betekenis (kan op een datum vóór de nieuwe start liggen).
    // Veiliger: wissen, gebruiker mag opnieuw markeren.
    lastPeriodEnd:    null,
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

/**
 * Hoeveel dagen is een gebruiker over tijd? Negatief = nog binnen de
 * verwachte cyclus, 0 = expected start vandaag, positief = late.
 *
 * Bewust géén modulo — `getCycleState().cycleDay` wrapt automatisch
 * binnen 1..cycleLength en kan dus nooit "te laat" detecteren. Wie
 * echt wil weten of de gebruikster over haar verwachte volgende
 * periode is, moet rauw vergelijken: dagen sinds laatste start, min
 * verwachte cyclus-lengte.
 *
 * @param {object} profile  — moet `lastPeriodStart` en `cycleLength` hebben
 * @param {Date}   [today]  — override voor tests
 * @returns {number|null}   — null als profile incompleet is
 */
export function getOverdueDays(profile, today = new Date()) {
  if (!profile?.lastPeriodStart) return null;
  const len = clampCycleLength(profile.cycleLength ?? 28);
  return daysBetween(profile.lastPeriodStart, today) - len;
}

/* ------------------------------------------------------------------ */
/*  Basal temperature & ovulation detection                            */
/* ------------------------------------------------------------------ */

/**
 * Plausibele range voor basaaltemperatuur (°C). Buiten deze range is
 * het waarschijnlijk een meetfout of verkeerde eenheid (bv. Fahrenheit).
 */
export const TEMP_MIN = 35.0;
export const TEMP_MAX = 38.0;

/** True wanneer een waarde binnen de plausibele basaaltemp-range valt. */
export function isValidTemperature(t) {
  const v = Number(t);
  return Number.isFinite(v) && v >= TEMP_MIN && v <= TEMP_MAX;
}

/**
 * Detecteer eisprong uit een serie basaaltemperatuur-metingen.
 *
 * Klassieke "thermal shift": na ~3 opeenvolgende dagen waarin de temp
 * minstens `THRESHOLD` (0.2 °C) hoger ligt dan het gemiddelde van de
 * 6 dagen daarvóór, is de eisprong vrijwel zeker net geweest. We
 * markeren de **laatste lage dag vóór de stijging** als eisprongdag,
 * conform de meeste BBT-protocollen.
 *
 * @param {{date: Date|string, temperature: number}[]} series
 *        Chronologisch oplopende reeks (oudste → nieuwste).
 *        Ontbrekende of nul-temperaturen worden overgeslagen — we
 *        pakken pas door zodra er genoeg geldige metingen op rij staan.
 * @returns {{ ovulationISO: string, shiftStartISO: string } | null}
 */
export function detectOvulationFromTemperatureSeries(series) {
  if (!Array.isArray(series) || series.length < 9) return null;

  const SHIFT_THRESHOLD = 0.2;     // °C boven baseline
  const SUSTAINED_DAYS  = 3;       // minstens 3 hogere dagen op rij
  const BASELINE_DAYS   = 6;       // gemiddeld over 6 lage dagen

  // Indexeer alleen entries met geldige temperaturen — anders verstoren
  // gaten de glijdende vensters. We onthouden de oorspronkelijke datum
  // zodat het uiteindelijke antwoord een echte ISO-datum is.
  const valid = series
    .map((s) => ({ iso: toISODate(s.date), temp: Number(s.temperature) }))
    .filter((s) => isValidTemperature(s.temp));

  if (valid.length < BASELINE_DAYS + SUSTAINED_DAYS) return null;

  for (let i = BASELINE_DAYS; i <= valid.length - SUSTAINED_DAYS; i++) {
    const baselineSlice = valid.slice(i - BASELINE_DAYS, i);
    const baseline =
      baselineSlice.reduce((sum, s) => sum + s.temp, 0) / BASELINE_DAYS;

    const sustained = valid.slice(i, i + SUSTAINED_DAYS);
    const allHigher = sustained.every(
      (s) => s.temp >= baseline + SHIFT_THRESHOLD
    );

    if (allHigher) {
      // De laatste lage dag vóór de stijging is conventioneel "ovulatie-dag".
      const ovulationISO = baselineSlice[baselineSlice.length - 1].iso;
      const shiftStartISO = sustained[0].iso;
      return { ovulationISO, shiftStartISO };
    }
  }

  return null;
}

/**
 * Voorspel de eerste dag van de volgende menstruatie.
 *
 * Accepteert:
 *   - een array ISO-datums (profile.periodHistory)
 *   - of een enkele Date / ISO-string als laatste menstruatiestart
 *
 * Geeft `null` terug zonder data zodat de UI een fallback kan tonen.
 *
 * @param {string[]|string|Date} input
 * @param {number} cycleLength
 * @returns {string|null} ISO-datum van de voorspelde menstruatiestart
 */
export function predictNextPeriod(input, cycleLength) {
  const len = clampCycleLength(cycleLength);
  let last = null;
  if (Array.isArray(input)) {
    if (input.length === 0) return null;
    const sorted = input.slice().sort();
    last = sorted[sorted.length - 1];
  } else if (input) {
    last = input;
  }
  if (!last) return null;
  const start = atMidnight(last);
  const next = new Date(start);
  next.setDate(start.getDate() + len);
  return toISODate(next);
}

/**
 * Bereken het vruchtbaar venster en de ovulatiedag voor een gegeven
 * cyclus. Standaard: dag 10–17 vruchtbaar, dag 14 ovulatie (28-daags
 * referentiemodel — proportioneel geschaald voor afwijkende lengtes).
 *
 * @param {string|Date} periodStart  Eerste dag van de menstruatie
 * @param {number} cycleLength       Cycluslengte in dagen
 * @returns {{ start: string, end: string, ovulation: string,
 *             startDay: number, endDay: number, ovulationDay: number } | null}
 */
export function getFertileWindow(periodStart, cycleLength) {
  if (!periodStart) return null;
  const len = clampCycleLength(cycleLength);
  // Schaal evenredig met 28-daags referentiemodel zodat een kortere of
  // langere cyclus zijn venster netjes meebeweegt.
  const ratio        = len / 28;
  const startDay     = Math.max(1, Math.round(10 * ratio));
  const endDay       = Math.min(len, Math.round(17 * ratio));
  const ovulationDay = Math.min(len, Math.round(14 * ratio));

  const base = atMidnight(periodStart);
  const offset = (n) => {
    const d = new Date(base);
    d.setDate(base.getDate() + (n - 1));
    return toISODate(d);
  };

  return {
    start:        offset(startDay),
    end:          offset(endDay),
    ovulation:    offset(ovulationDay),
    startDay,
    endDay,
    ovulationDay,
  };
}

/**
 * Bepaalt waar 'vandaag' staat in het vruchtbare venster.
 *
 * Returns `{ status, daysUntil, daysSince, isOvulation, ovulationDay }`:
 *   - status:      'fertile' | 'ovulation' | 'before' | 'after' | 'overdue'
 *   - daysUntil:   dagen tot venster-start (alleen bij 'before')
 *   - daysSince:   dagen sinds venster-eind (alleen bij 'after')
 *   - isOvulation: true op de exacte ovulatiedag
 *   - ovulationDay: dag-nummer in cyclus
 *
 * Belangrijk: `state.cycleDay` wraps via modulo binnen 1..cycleLength.
 * Een gebruikster die over tijd is heeft een misleidende cycleDay (bv.
 * dag 6 van een "nieuwe" cyclus die nooit echt begonnen is). Daarom:
 * als `profile` wordt meegegeven én ze meer dan 2 dagen over tijd zijn,
 * geven we `status: 'overdue'` terug zodat de UI geen valse "venster
 * over X dagen" claim toont.
 *
 * @param {object} state          Resultaat van getCycleState
 * @param {object} [profile]      Optioneel — voor late-detectie
 * @param {Date}   [today]        Override voor tests
 */
export function getFertilityStatus(state, profile = null, today = new Date()) {
  if (!state?.cycleDay || !state?.cycleLength) return null;

  // Late-check vóór alle andere logica: als de gebruikster over tijd is,
  // is een fertile-window-voorspelling voor een "nieuwe" cyclus die nooit
  // begonnen is, zinloos en misleidend.
  if (profile?.lastPeriodStart) {
    const overdue = getOverdueDays(profile, today);
    if (overdue != null && overdue > 2) {
      return {
        status: 'overdue',
        isOvulation: false,
        daysUntil: 0,
        daysSince: 0,
        ovulationDay: null,
        overdueDays: overdue,
      };
    }
  }

  const window = getFertileWindow(
    // We hebben geen lastPeriodStart hier, maar wel cycleDay — bereken
    // terug naar dag-1 zodat getFertileWindow met een geldige basis werkt.
    (() => {
      const d = atMidnight(today);
      d.setDate(d.getDate() - (state.cycleDay - 1));
      return toISODate(d);
    })(),
    state.cycleLength,
  );
  if (!window) return null;

  const day = state.cycleDay;
  let status;
  if (day === window.ovulationDay) status = 'ovulation';
  else if (day >= window.startDay && day <= window.endDay) status = 'fertile';
  else if (day < window.startDay) status = 'before';
  else status = 'after';

  return {
    status,
    isOvulation: day === window.ovulationDay,
    daysUntil:   status === 'before' ? window.startDay - day : 0,
    daysSince:   status === 'after'  ? day - window.endDay   : 0,
    ovulationDay: window.ovulationDay,
  };
}

/**
 * Completed cycles derived from the profile's period history.
 *
 * One entry per gap between consecutive logged starts, chronological
 * order (oldest → newest), trimmed to the most recent `max` cycles.
 *
 * Returns `[]` when there isn't yet at least one full cycle to show,
 * so the UI can simply not render the history card until there's data.
 *
 * @param {object} profile
 * @param {number} [max=4]  Cap on the number of returned cycles
 * @returns {{ start: string, end: string, length: number }[]}
 */
export function getCycleHistory(profile, max = 4) {
  const h = Array.isArray(profile?.periodHistory) ? profile.periodHistory : [];
  if (h.length < 2) return [];
  const gaps = [];
  for (let i = 1; i < h.length; i++) {
    gaps.push({
      start:  h[i - 1],
      end:    h[i],
      length: daysBetween(h[i - 1], h[i]),
    });
  }
  return gaps.slice(-Math.max(1, max));
}
