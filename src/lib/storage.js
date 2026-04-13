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
  } catch { /* quota / private mode — fail silently, calm vibes */ }
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
    gut: {
      probiotics: false,
      fiber:      false,
      fermented:  false,
    },
  };
}

export function loadLog(date = new Date()) {
  try {
    const raw = localStorage.getItem(logKey(date));
    if (!raw) return emptyLog();
    return { ...emptyLog(), ...JSON.parse(raw) };
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
  if (patch.gut) next.gut = { ...current.gut, ...patch.gut };
  saveLog(date, next);
  return next;
}
