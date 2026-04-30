/**
 * Aura — schema version tracker
 * -----------------------------
 * A single integer in localStorage marks which on-disk data shape the user's
 * cache currently matches. Used to safely add fields to logs/profile without
 * silently corrupting older installs.
 *
 * Bump CURRENT_VERSION every time the wire shape changes, then add a
 * migration step in `migrate()`.
 */

const KEY = 'aura.schemaVersion';
const CURRENT_VERSION = 1;

export function getSchemaVersion() {
  const raw = localStorage.getItem(KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function ensureSchemaVersion() {
  const current = getSchemaVersion();
  if (current === CURRENT_VERSION) return;
  if (current === 0) {
    // Fresh install OR pre-versioning install — no migration needed yet.
    try { localStorage.setItem(KEY, String(CURRENT_VERSION)); } catch { /* no-op */ }
    return;
  }
  if (current > CURRENT_VERSION) {
    // User somehow downgraded. We don't roll back; leave their data alone.
    return;
  }
  // current < CURRENT_VERSION — run forward migrations here when they exist.
  // for (let v = current; v < CURRENT_VERSION; v++) migrate(v, v + 1);
  try { localStorage.setItem(KEY, String(CURRENT_VERSION)); } catch { /* no-op */ }
}

export const SCHEMA_VERSION = CURRENT_VERSION;
