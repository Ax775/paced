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
const SAVED_MEALS_KEY    = 'aura.savedMeals';
const SCHEMA_VERSION_KEY = 'aura_schema_version';

/** Max number of saved-meal entries before LRU-eviction kicks in. */
const SAVED_MEALS_MAX = 24;

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
/*  Saved meals — "snel opnieuw toevoegen"-lijst                       */
/* ------------------------------------------------------------------ */
//
// Een MRU (most-recently-used) lijst van eerder gelogde maaltijden zodat
// een gebruiker een maaltijd die ze vaker eet met één tik kan toevoegen.
// Bewust géén relatie met de daily-log entries — die hebben hun eigen
// timestamp en kunnen apart verwijderd worden zonder de "snel toevoegen"-
// suggesties te beïnvloeden.
//
// Shape: { id, name, kcal, protein, ts }
//   - id      stabiele identifier (Date.now() + name-hash) voor remove
//   - name    max 80 chars (dezelfde cap als log.meals)
//   - kcal    0..9999
//   - protein 0..999
//   - ts      laatste-gebruik timestamp (epoch ms) voor MRU-sortering
//
// Dedup-regel: case-insensitive name-match → bestaande entry wordt
// bijgewerkt (nieuwste kcal/protein, ts vernieuwd, niet verdubbeld).

/** @returns {Array<{id:string, name:string, kcal:number, protein:number, ts:number}>} */
export function loadSavedMeals() {
  try {
    const raw = localStorage.getItem(SAVED_MEALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensief — schoon corrupted shapes weg ipv crashen
    return parsed
      .filter((m) => m && typeof m === 'object' && typeof m.name === 'string')
      .map((m) => ({
        id:      String(m.id ?? `${m.name}-${m.ts ?? 0}`),
        name:    String(m.name).slice(0, 80),
        kcal:    Math.max(0, Math.min(9999, Number(m.kcal) || 0)),
        protein: Math.max(0, Math.min(999,  Number(m.protein) || 0)),
        ts:      Number.isFinite(m.ts) ? Number(m.ts) : 0,
      }))
      .sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

function persistSavedMeals(list) {
  try {
    localStorage.setItem(SAVED_MEALS_KEY, JSON.stringify(list));
  } catch (err) { notifyStorageError(err); }
}

/**
 * Voeg een maaltijd toe aan de saved-meals lijst (of werk een bestaande
 * bij). Dedup gebeurt op case-insensitive name. MRU-sortering wordt
 * vastgelegd via `ts`. Bij overschrijden van SAVED_MEALS_MAX worden de
 * oudste entries weggeknipt.
 *
 * Lege namen, of records zonder kcal én protein, worden genegeerd.
 *
 * @param {{name:string, kcal:number, protein:number}} meal
 * @returns {Array} de nieuwe gesorteerde lijst (handig voor optimistic UI)
 */
export function addSavedMeal(meal) {
  if (!meal || typeof meal !== 'object') return loadSavedMeals();
  const name = String(meal.name || '').trim().slice(0, 80);
  const kcal    = Math.max(0, Math.min(9999, Number(meal.kcal)    || 0));
  const protein = Math.max(0, Math.min(999,  Number(meal.protein) || 0));
  if (!name || (kcal === 0 && protein === 0)) return loadSavedMeals();

  const list = loadSavedMeals();
  const lcName = name.toLowerCase();
  const existingIdx = list.findIndex((m) => m.name.toLowerCase() === lcName);
  const ts = Date.now();
  if (existingIdx !== -1) {
    list[existingIdx] = { ...list[existingIdx], name, kcal, protein, ts };
  } else {
    // ID = timestamp + random-suffix. Twee adds binnen dezelfde ms zouden
    // anders dezelfde id krijgen — wat removeSavedMeal kan laten over-
    // verwijderen. De suffix maakt het collision-vrij genoeg voor MRU-
    // gebruik. Geen crypto.randomUUID() omdat dat in oudere Safari geen
    // garantie is en we hier geen security-bond met de id willen leggen.
    const suffix = Math.random().toString(36).slice(2, 8);
    list.unshift({ id: `m-${ts}-${suffix}`, name, kcal, protein, ts });
  }
  // Resort by ts desc, then evict de overflow.
  const sorted = list.sort((a, b) => b.ts - a.ts).slice(0, SAVED_MEALS_MAX);
  persistSavedMeals(sorted);
  return sorted;
}

/**
 * Bump een bestaande saved-meal naar de top (touch-MRU). Wordt gebruikt
 * wanneer de gebruiker een suggestie aantikt — zo blijven veelgebruikte
 * maaltijden vooraan staan zonder dubbel-opslaan.
 */
export function touchSavedMeal(id) {
  const list = loadSavedMeals();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return list;
  list[idx] = { ...list[idx], ts: Date.now() };
  const sorted = list.sort((a, b) => b.ts - a.ts);
  persistSavedMeals(sorted);
  return sorted;
}

/** Verwijder één saved-meal. */
export function removeSavedMeal(id) {
  const list = loadSavedMeals();
  const next = list.filter((m) => m.id !== id);
  if (next.length === list.length) return list;
  persistSavedMeals(next);
  return next;
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
    // Vijf extra dimensies — toegevoegd in v1.5 om patronen tussen
    // cyclus-fases en cognitieve/sociale ervaring te kunnen tonen.
    // Allemaal 1..5 schaal of null; null = "niet ingevuld" zodat
    // statistiek-aggregatie ongeloggde dagen kan negeren.
    focus:        null,  // null | 1..5  (1=mistig, 5=helder)
    social:       null,  // null | 1..5  (1=leeg/op, 5=zin in mensen)
    stressLevel:  null,  // null | 1..5  (1=heel rustig, 5=overprikkeld)
    sleepQuality: null,  // null | 1..5  (1=onrustig, 5=diep + uitgerust)
    libido:       null,  // null | 1..5  (1=afwezig, 5=hoog)
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
    // Verlate-cyclus check-in. Alleen ingevuld als de UI een late-state
    // detecteert en de gebruiker de vragen heeft beantwoord. `dismissed`
    // markeert dat ze de kaart hebben weggeklikt zonder vragen — dan
    // tonen we 'm niet opnieuw die dag.
    lateCheck: {
      stress:               null, // null | true | false
      travel:               null,
      illness:              null,
      contraceptionMissed:  null,
      consideringTest:      null,
      dismissed:            false,
    },
  };
}

// Accept een waarde alleen als 't een plain object is. Voorkomt dat
// een gemanipuleerde log met `gut: "oops"` of `gut: ["x"]` per ongeluk
// gespread wordt — bij strings zou `{...base.gut, ...'oops'}` de
// karakters als keys toevoegen (0:'o', 1:'o', ...).
function pickObj(v) {
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

// Filter unsafe keys uit een geparsed object zodat een aanvaller via
// DevTools geen `__proto__`/`constructor`/`prototype` keys in de
// runtime kan smokkelen. Geen prototype-pollution exploit nu, maar
// defense-in-depth — JSON.parse zelf zet die keys op het object, en
// een latere spread kan ze meenemen.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function safeObj(v) {
  const o = pickObj(v);
  const out = {};
  for (const k of Object.keys(o)) {
    if (!UNSAFE_KEYS.has(k)) out[k] = o[k];
  }
  return out;
}

// Cast naar een eindig getal of fallback. Voorkomt dat strings, NaN,
// of Infinity via een corrupt log doorlopen naar de UI/export.
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// 1..5 self-rating of null. Een corrupt log met `focus: 99` of
// `social: "high"` mag de UI niet als een geldige waarde tonen.
function scale5(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

export function loadLog(date = new Date()) {
  try {
    const raw = localStorage.getItem(logKey(date));
    if (!raw) return emptyLog();
    const parsed = safeObj(JSON.parse(raw));
    const base = emptyLog();
    // Deep-merge nested objects so old logs without symptoms/gut stay valid.
    // Iedere sub-object spread is óók type-checked + key-filtered zodat
    // een corrupt veld de runtime niet kan vervuilen.
    return {
      ...base,
      ...parsed,
      // Numerieke velden normaliseren — string/NaN/Infinity uit een
      // gemanipuleerde log mag niet door de pipeline lekken.
      calories:    num(parsed.calories,    0),
      protein:     num(parsed.protein,     0),
      hydration:   num(parsed.hydration,   0),
      sleep:       num(parsed.sleep,       0),
      movement:    num(parsed.movement,    0),
      temperature: num(parsed.temperature, 0),
      // String-velden capping op 280 tegen quota-uitputting via DevTools.
      note: typeof parsed.note === 'string' ? parsed.note.slice(0, 280) : '',
      meals:     Array.isArray(parsed.meals)     ? parsed.meals.slice(0, 50)     : [],
      symptomen: Array.isArray(parsed.symptomen) ? parsed.symptomen.slice(0, 20) : [],
      // 1..5 self-rating dimensies — clamp + null-fallback
      energie:      scale5(parsed.energie),
      stemming:     scale5(parsed.stemming),
      focus:        scale5(parsed.focus),
      social:       scale5(parsed.social),
      stressLevel:  scale5(parsed.stressLevel),
      sleepQuality: scale5(parsed.sleepQuality),
      libido:       scale5(parsed.libido),
      gut:       { ...base.gut,       ...safeObj(parsed.gut)       },
      symptoms:  { ...base.symptoms,  ...safeObj(parsed.symptoms)  },
      ovulation: { ...base.ovulation, ...safeObj(parsed.ovulation) },
      bleeding:  { ...base.bleeding,  ...safeObj(parsed.bleeding)  },
      lateCheck: { ...base.lateCheck, ...safeObj(parsed.lateCheck) },
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
  if (patch.lateCheck) next.lateCheck = { ...current.lateCheck, ...patch.lateCheck };
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
