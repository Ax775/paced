/**
 * Aura — App-level persistence
 * ----------------------------
 * Thin typed wrapper that lives on top of the secure storage layer.
 * Two namespaces:
 *
 *   aura.profile           — single object, user onboarding data
 *   aura.log.<YYYY-MM-DD>  — one object per day (tracker entries)
 *
 * All reads/writes go through secureStorage so data is encrypted at rest.
 * Reads are sync because secureStorage caches plaintext in memory after unlock.
 */

import * as secure from './secureStorage.js';

const PROFILE_KEY = 'aura.profile';
const LOG_PREFIX  = 'aura.log.';

/* ------------------------------------------------------------------ */
/*  Profile                                                            */
/* ------------------------------------------------------------------ */

export function loadProfile() {
  const raw = secure.getItem(PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveProfile(profile) {
  secure.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearProfile() {
  secure.removeItem(PROFILE_KEY);
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
    hydration: 0,
    sleep:     0,
    movement:  0,
    note:      '',
    gut: {
      probiotics: false,
      fiber:      false,
      fermented:  false,
    },
    symptoms: {
      energy:   0,
      mood:     0,
      cramps:   0,
      bloating: 0,
    },
  };
}

export function loadLog(date = new Date()) {
  const raw = secure.getItem(logKey(date));
  if (!raw) return emptyLog();
  try {
    const parsed = JSON.parse(raw);
    const base = emptyLog();
    return {
      ...base,
      ...parsed,
      gut:      { ...base.gut,      ...(parsed.gut      || {}) },
      symptoms: { ...base.symptoms, ...(parsed.symptoms || {}) },
    };
  } catch {
    return emptyLog();
  }
}

export function saveLog(date, log) {
  secure.setItem(logKey(date), JSON.stringify(log));
}

export function updateLog(date, patch) {
  const current = loadLog(date);
  const next = { ...current, ...patch };
  if (patch.gut)      next.gut      = { ...current.gut,      ...patch.gut };
  if (patch.symptoms) next.symptoms = { ...current.symptoms, ...patch.symptoms };
  saveLog(date, next);
  return next;
}

/* ------------------------------------------------------------------ */
/*  Streak                                                             */
/* ------------------------------------------------------------------ */

export function logHasData(log) {
  if (!log) return false;
  return (
    log.calories  > 0 ||
    log.protein   > 0 ||
    log.hydration > 0 ||
    log.sleep     > 0 ||
    log.movement  > 0 ||
    (log.note || '').length > 0 ||
    Object.values(log.gut      || {}).some(Boolean) ||
    Object.values(log.symptoms || {}).some(v => v > 0)
  );
}

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
