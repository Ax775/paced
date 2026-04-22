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
 */

const PROFILE_KEY = 'aura.profile';
const LOG_PREFIX  = 'aura.log.';

/* ------------------------------------------------------------------ */
/*  Profile                                                            */
/* ------------------------------------------------------------------ */

/** @returns {object|null} */
export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch { /* quota / private mode — fail silently */ }
}

export function clearProfile() {
  try { localStorage.removeItem(PROFILE_KEY); } catch { /* no-op */ }
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
    sleep:     0,         // hours slept last night
    movement:  0,         // minutes of activity today
    note:      '',        // free-text journal note (max 280 chars)
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
      gut:      { ...base.gut,      ...(parsed.gut      || {}) },
      symptoms: { ...base.symptoms, ...(parsed.symptoms || {}) },
    };
  } catch {
    return emptyLog();
  }
}

export function saveLog(date, log) {
  try {
    localStorage.setItem(logKey(date), JSON.stringify(log));
  } catch { /* no-op */ }
}

/** Merge a partial update into today's log — ergonomic for React handlers. */
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

/** True if the log has any data entered. */
export function logHasData(log) {
  if (!log) return false;
  return (
    log.calories  > 0 ||
    log.protein   > 0 ||
    log.hydration > 0 ||
    Object.values(log.gut      || {}).some(Boolean) ||
    Object.values(log.symptoms || {}).some(v => v > 0)
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
