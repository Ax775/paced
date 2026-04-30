/**
 * Aura — Secure storage layer
 * ---------------------------
 * Sits between the app and localStorage. After unlock, holds plaintext
 * values in an in-memory cache (so callers can read synchronously) and
 * transparently encrypts on write. Locking clears the cache and key.
 *
 * Wire-level keys in localStorage:
 *   aura.kdf.salt        — base64 salt for PBKDF2
 *   aura.kdf.verifier    — encrypted "aura.unlock.ok" (passphrase check)
 *   aura.*               — encrypted user data (profile, daily logs, …)
 */

import {
  deriveKey, encryptString, decryptString,
  buildVerifier, checkVerifier, newSalt,
  WrongPassphraseError, CryptoUnavailableError, isCryptoAvailable,
} from './crypto.js';

const SALT_KEY     = 'aura.kdf.salt';
const VERIFIER_KEY = 'aura.kdf.verifier';
const DATA_PREFIX  = 'aura.';
const KDF_PREFIXES = [SALT_KEY, VERIFIER_KEY];

let cryptoKey = null;
let cache = null; // Map<string, string> when unlocked
let quotaListener = null;

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

export function isUnlocked() {
  return cryptoKey !== null && cache !== null;
}

export function isInitialized() {
  return localStorage.getItem(SALT_KEY) !== null
      && localStorage.getItem(VERIFIER_KEY) !== null;
}

export function lock() {
  cryptoKey = null;
  cache = null;
}

/**
 * First-time setup — creates a fresh salt, derives a key from the passphrase,
 * stores a verifier so future unlocks can validate the passphrase, then
 * unlocks. Returns once ready.
 */
export async function setupNew(passphrase) {
  if (!isCryptoAvailable()) throw new CryptoUnavailableError();
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt);
  const verifier = await buildVerifier(key);
  safeWrite(SALT_KEY, salt);
  safeWrite(VERIFIER_KEY, verifier);
  cryptoKey = key;
  cache = new Map();
}

/**
 * Unlock with an existing passphrase. On success, decrypts every aura.* key
 * (besides the KDF metadata) into the in-memory cache.
 *
 * Throws WrongPassphraseError on a bad passphrase.
 * Throws Error if the store has not been initialized.
 */
export async function unlock(passphrase) {
  if (!isCryptoAvailable()) throw new CryptoUnavailableError();
  const salt = localStorage.getItem(SALT_KEY);
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!salt || !verifier) {
    throw new Error('Aura store is not initialized — call setupNew first.');
  }
  const key = await deriveKey(passphrase, salt);
  await checkVerifier(verifier, key);

  const next = new Map();
  const keys = listAuraDataKeys();
  for (const k of keys) {
    const wire = localStorage.getItem(k);
    if (!wire) continue;
    try {
      next.set(k, await decryptString(wire, key));
    } catch {
      // Corrupt or partially-encrypted entry — skip silently rather than blow up.
    }
  }
  cryptoKey = key;
  cache = next;
}

/**
 * Change the user's passphrase. Verifies the current passphrase, derives a
 * new key from a fresh salt, then re-encrypts every cached value with the
 * new key. Atomic with rollback: if any localStorage write fails partway,
 * the original ciphertexts and salt/verifier are restored.
 *
 * Throws WrongPassphraseError if `current` doesn't match.
 * Throws RangeError if `next` is too short.
 */
export async function changePassphrase(current, next, minLength = 8) {
  if (!isUnlocked()) throw new Error('Cannot change passphrase while locked.');
  if (typeof next !== 'string' || next.length < minLength) {
    throw new RangeError(`Passphrase must be at least ${minLength} characters`);
  }

  const oldSalt = localStorage.getItem(SALT_KEY);
  const oldVerifier = localStorage.getItem(VERIFIER_KEY);
  if (!oldSalt || !oldVerifier) throw new Error('Aura store is not initialized.');

  // Verify current passphrase against the existing verifier.
  const oldKeyCheck = await deriveKey(current, oldSalt);
  await checkVerifier(oldVerifier, oldKeyCheck);

  // Derive new key + verifier from a fresh salt.
  const nextSalt = newSalt();
  const nextKey = await deriveKey(next, nextSalt);
  const nextVerifier = await buildVerifier(nextKey);

  // Re-encrypt every cached value with the new key (purely in-memory).
  const reencrypted = new Map();
  for (const [k, v] of cache) {
    reencrypted.set(k, await encryptString(v, nextKey));
  }

  // Snapshot what we're about to overwrite, so we can roll back on failure.
  const backup = new Map();
  backup.set(SALT_KEY, oldSalt);
  backup.set(VERIFIER_KEY, oldVerifier);
  for (const k of reencrypted.keys()) backup.set(k, localStorage.getItem(k));

  try {
    localStorage.setItem(SALT_KEY, nextSalt);
    localStorage.setItem(VERIFIER_KEY, nextVerifier);
    for (const [k, wire] of reencrypted) {
      localStorage.setItem(k, wire);
    }
  } catch (e) {
    for (const [k, v] of backup) {
      try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* best-effort rollback */ }
    }
    throw e;
  }

  cryptoKey = nextKey;
}

/**
 * Migrate any aura.* keys that are still plain JSON (pre-encryption installs)
 * into encrypted form. Idempotent. Must be called while unlocked.
 */
export async function migratePlaintext() {
  if (!isUnlocked()) throw new Error('Cannot migrate while locked.');
  const keys = listAuraDataKeys();
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw || raw.startsWith('v1:')) continue;
    try {
      // Validate it's actually JSON before encrypting (avoid double-encrypting on retry).
      JSON.parse(raw);
    } catch {
      continue;
    }
    cache.set(k, raw);
    const wire = await encryptString(raw, cryptoKey);
    safeWrite(k, wire);
  }
}

/* ------------------------------------------------------------------ */
/*  Sync API used by storage.js                                        */
/* ------------------------------------------------------------------ */

export function getItem(key) {
  if (!isUnlocked()) return null;
  return cache.has(key) ? cache.get(key) : null;
}

/**
 * Update cache synchronously, then encrypt + persist asynchronously.
 * Returns the value so chaining is convenient.
 */
export function setItem(key, value) {
  if (!isUnlocked()) return value;
  cache.set(key, value);
  // Fire-and-forget encryption; caller can't await but cache is already correct.
  encryptString(value, cryptoKey)
    .then((wire) => safeWrite(key, wire))
    .catch(() => {});
  return value;
}

export function removeItem(key) {
  if (cache) cache.delete(key);
  try { localStorage.removeItem(key); } catch { /* no-op */ }
}

/** Enumerate all aura.* keys currently in localStorage (excludes KDF metadata). */
export function listAuraDataKeys() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(DATA_PREFIX) && !KDF_PREFIXES.includes(k)) out.push(k);
  }
  return out;
}

/** Wipe all Aura data — used by Settings → reset. */
export function destroyAll() {
  for (const k of [...listAuraDataKeys(), ...KDF_PREFIXES]) {
    try { localStorage.removeItem(k); } catch { /* no-op */ }
  }
  lock();
}

/* ------------------------------------------------------------------ */
/*  Quota handling                                                     */
/* ------------------------------------------------------------------ */

export function onQuotaError(fn) {
  quotaListener = fn;
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    const isQuota = e && (
      e.name === 'QuotaExceededError' ||
      e.code === 22 || e.code === 1014 ||
      /quota/i.test(e.message || '')
    );
    if (isQuota && quotaListener) {
      try { quotaListener(); } catch { /* listener errors must not crash writes */ }
    }
    // Re-throw silently swallowed — the in-memory cache still holds the value.
  }
}
