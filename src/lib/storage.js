/**
 * Aura — LocalStorage persistence
 * -------------------------------
 * Thin typed wrapper around localStorage with two namespaces:
 *
 *   aura.profile       — single object, user onboarding data
 *   aura.log.<YYYY-MM-DD> — one object per day (tracker entries)
 *
 * Keeping each day in its own key makes it trivial to read "today" and
 * to scan back over recent history without parsing one giant blob.
 *
 * --- Privacy posture ---
 * Health data (cycle, symptoms, weight, notes) is stored in plain JSON.
 * This is a deliberate trade-off: Aura is offline-only, has no server,
 * no accounts, and no key-management story — adding at-rest encryption
 * would either require a user passphrase (real friction, real lockout
 * risk) or a key kept in the same localStorage origin (security theatre).
 * The threat model assumes the device itself is trusted; the privacy
 * disclosure in LegalView communicates this to the user. See
 * SECURITY.md / the Privacy & Disclaimer screen for the full statement.
 */

const SCHEMA_VERSION = 1;

const PROFILE_KEY        = 'aura.profile';
const LOG_PREFIX         = 'aura.log.';
const CARD_ORDER_KEY     = 'aura.cardOrder';
const SCHEMA_VERSION_KEY = 'aura_schema_version';

/* ------------------------------------------------------------------ */
/*  Storage error reporting                                            */
/* ------------------------------------------------------------------ */

// Single optional callback so the UI layer can surface "save failed"
// to the user (quota exceeded, private-mode block, disk full).
// Previously we swallowed these errors silently, which meant a user
// could enter data, see no warning, and lose it on reload.
let storageErrorHandler = null;

export function setStorageErrorHandler(fn) {
  storageErrorHandler = typeof fn === 'function' ? fn : null;
}

export function notifyStorageError(err) {
  if (!storageErrorHandler) return;
  try { storageErrorHandler(err); } catch { /* handler itself failed — nothing we can do */ }
}

/* ------------------------------------------------------------------ */
/*  Profile                                                            */
/* ------------------------------------------------------------------ */

/** @returns {object|null} */
export function loadProfile() {
  try {
    const storedVersion = Number(localStorage.getItem(SCHEMA_VERSION_KEY));
    if (!storedVersion || storedVersion < SCHEMA_VERSION) {
      console.warn('Schema versie mismatch, migratie mogelijk nodig');
    }
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    localStorage.setItem(SCHEMA_VERSION_KEY, String(SCHEMA_VERSION));
  } catch (err) { notifyStorageError(err); }
}

/**
 * Wis ALLE Aura-data uit localStorage (profiel, logs, kaartvolgorde,
 * thema, dismiss-flags). Een "reset" mag geen sporen achterlaten — een
 * volgende gebruiker op hetzelfde toestel zou anders oude logs zien
 * verschijnen na een nieuwe onboarding.
 */
export function clearAllData() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('aura'));
    keys.forEach(k => localStorage.removeItem(k));
  } catch (err) { notifyStorageError(err); }
}

// Backwards-compat: een "profiel reset" wist nu álle data, niet alleen
// het profielobject. Oude callers blijven werken zonder rename.
export function clearProfile() {
  clearAllData();
}

/* ------------------------------------------------------------------ */
/*  Card order                                                         */
/* ------------------------------------------------------------------ */

/**
 * Volgorde van de kaarten op het dashboard. `null` betekent: gebruik de
 * standaardvolgorde uit CARD_REGISTRY in app.jsx — zo blijft storage
 * dom en hoeft het niets te weten over welke kaarten er bestaan.
 *
 * @returns {string[]|null}
 */
export function loadCardOrder() {
  try {
    const raw = localStorage.getItem(CARD_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id) => typeof id === 'string');
  } catch {
    return null;
  }
}

/** Pass `null` to reset to the default registry order. */
export function saveCardOrder(order) {
  try {
    if (order == null) {
      localStorage.removeItem(CARD_ORDER_KEY);
    } else {
      localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(order));
    }
  } catch (err) { notifyStorageError(err); }
}

/* ------------------------------------------------------------------ */
/*  Daily log                                                          */
/* ------------------------------------------------------------------ */

export function isoDate(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function logKey(date) { return LOG_PREFIX + isoDate(date); }

/** Default empty log entry — kept here so UI never has to know the shape. */
export function emptyLog() {
  return {
    protein:   0,
    calories:  0,
    hydration: 0,         // in glasses (250 ml each)
    meals:     [],        // [{ time: 'HH:MM', kcal: 0, protein: 0 }]
    sleep:     0,         // hours slept last night
    movement:  0,         // minutes of activity today
    note:      '',        // free-text journal note (max 280 chars)
    // Basaaltemperatuur in °C (35–38 typische range). 0 = niet ingevoerd —
    // bewust 0 in plaats van null zodat de bestaande deep-merge niet hoeft
    // te onderscheiden tussen "leeg" en "ontbrekend".
    temperature: 0,
    // Eisprongmarkering. Beide booleans kunnen tegelijk true zijn (gevoeld
    // én afgelezen van temperatuurstijging). `auto` is gereserveerd voor
    // detectie door de cycle-engine — het log slaat alleen handmatige
    // input op, niet de afgeleide.
    ovulation: {
      felt:     false,
      fromTemp: false,
    },
    // Bloedingdetails — alleen gevuld op menstruatiedagen. Leeg = niet
    // ingevuld; we zoeken nooit op deze velden zonder eerst te checken.
    bleeding: {
      clots:     '',     // '' | 'none' | 'light' | 'heavy'
      clarity:   '',     // '' | 'clear' | 'normal' | 'dark'
      heaviness: '',     // '' | 'light' | 'normal' | 'heavy' | 'very-heavy'
      color:     '',     // '' | 'light-pink' | 'red' | 'dark-red' | 'brown'
    },
    // Sportintensiteit — losstaand van `movement` (minuten) zodat de
    // gebruikster ook alleen het type kan loggen zonder een tijdsduur.
    sportIntensity: '',  // '' | 'rest' | 'light' | 'moderate' | 'intense'
    // Subjectief welzijn — losstaand van `symptoms` (1–5 schalen voor
    // energy/mood/cramps/bloating). Hier slaan we de eenvoudigere
    // dagelijkse stemming en energie op + de chip-multiselect lijst van
    // lichamelijke symptomen. `null` betekent "niet ingevuld" zodat we
    // het onderscheid zien met "expliciet 1 (slecht)".
    energie:    null,    // null | 1..5
    stemming:   null,    // null | 1..5
    symptomen:  [],      // ['Buikkrampen', 'Hoofdpijn', …]
    gut: {
      probiotics: false,
      fiber:      false,
      fermented:  false,
    },
    symptoms: {
      energy:   0, // 1–5 (1=poor, 5=great)
      mood:     0,
      cramps:   0, // 1=intense, 5=none
      bloating: 0, // 1=heavy, 5=none
    },
  };
}

export function loadLog(date = new Date()) {
  try {
    const raw = localStorage.getItem(logKey(date));
    if (!raw) return emptyLog();
    const parsed = JSON.parse(raw);
    const base = emptyLog();
    // Deep-merge nested objects so old logs without symptoms/gut stay valid.
    return {
      ...base,
      ...parsed,
      meals:     Array.isArray(parsed.meals)     ? parsed.meals     : [],
      symptomen: Array.isArray(parsed.symptomen) ? parsed.symptomen : [],
      gut:       { ...base.gut,       ...(parsed.gut       || {}) },
      symptoms:  { ...base.symptoms,  ...(parsed.symptoms  || {}) },
      ovulation: { ...base.ovulation, ...(parsed.ovulation || {}) },
      bleeding:  { ...base.bleeding,  ...(parsed.bleeding  || {}) },
    };
  } catch {
    notifyStorageError('Logboekdata hersteld na corruptie');
    return emptyLog();
  }
}

export function saveLog(date, log) {
  try {
    localStorage.setItem(logKey(date), JSON.stringify(log));
  } catch (err) { notifyStorageError(err); }
}

/** Merge a partial update into today's log — ergonomic for React handlers. */
export function updateLog(date, patch) {
  const current = loadLog(date);
  const next = { ...current, ...patch };
  if (patch.gut)       next.gut       = { ...current.gut,       ...patch.gut };
  if (patch.symptoms)  next.symptoms  = { ...current.symptoms,  ...patch.symptoms };
  if (patch.ovulation) next.ovulation = { ...current.ovulation, ...patch.ovulation };
  if (patch.bleeding)  next.bleeding  = { ...current.bleeding,  ...patch.bleeding };
  saveLog(date, next);
  return next;
}

/**
 * Load the last `days` daily logs as `[{ date, log }, …]` (oldest → newest,
 * inclusive of today). Used by the temperature trend chart and the
 * temperature-based ovulation detector — both read pure history without
 * mutating anything, so this stays a thin scan helper.
 */
export function loadRecentLogs(days = 14, today = new Date()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({ date: d, iso: isoDate(d), log: loadLog(d) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Streak                                                             */
/* ------------------------------------------------------------------ */

/** True if the log has any data entered. */
export function logHasData(log) {
  if (!log) return false;
  return (
    log.calories  > 0 ||
    log.protein   > 0 ||
    log.hydration > 0 ||
    log.sleep     > 0 ||
    log.movement  > 0 ||
    log.temperature > 0 ||
    !!log.sportIntensity ||
    (log.note || '').length > 0 ||
    log.energie  != null ||
    log.stemming != null ||
    (Array.isArray(log.symptomen) && log.symptomen.length > 0) ||
    Object.values(log.gut       || {}).some(Boolean) ||
    Object.values(log.symptoms  || {}).some(v => v > 0) ||
    Object.values(log.ovulation || {}).some(Boolean) ||
    Object.values(log.bleeding  || {}).some(v => v && v.length > 0)
  );
}

/**
 * Count consecutive days (ending today) where the user logged something.
 * If today has no data, returns 0 — the streak is alive until midnight.
 * Re-evaluate by passing the live `todayLog` so the count updates without
 * a page reload when the user taps a tracker for the first time today.
 *
 * @param {object} todayLog  — live log state from useDailyLog
 * @param {Date}   [today]   — override for testing
 */
export function getStreak(todayLog, today = new Date()) {
  if (!logHasData(todayLog)) return 0;
  let count = 1;
  const d = new Date(today);
  d.setDate(d.getDate() - 1);
  while (count < 365) {
    if (!logHasData(loadLog(d))) break;
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}
