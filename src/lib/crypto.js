/**
 * Aura — Web Crypto wrapper
 * -------------------------
 * AES-GCM symmetric encryption with PBKDF2-SHA256 key derivation from a
 * user passphrase. All data at rest is encrypted; only the in-memory key
 * (derived after unlock) can decrypt it.
 *
 * Wire format for ciphertext stored in localStorage:
 *   "v1:" + base64(iv) + ":" + base64(ct)
 *
 * Salt and verifier are stored separately under fixed keys; see secureStorage.js.
 */

const SUBTLE = globalThis.crypto?.subtle;
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = 'SHA-256';
const KEY_BITS = 256;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const VERIFIER_PLAINTEXT = 'aura.unlock.ok';

const enc = new TextEncoder();
const dec = new TextDecoder();

export class CryptoUnavailableError extends Error {
  constructor() {
    super('Web Crypto API not available — Aura needs HTTPS or localhost.');
    this.name = 'CryptoUnavailableError';
  }
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Onjuist wachtwoord.');
    this.name = 'WrongPassphraseError';
  }
}

function assertSubtle() {
  if (!SUBTLE) throw new CryptoUnavailableError();
}

function b64encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function newSalt() {
  return b64encode(randomBytes(SALT_BYTES));
}

/**
 * Derive a CryptoKey from passphrase + salt (base64 string).
 * Returns a non-extractable AES-GCM key suitable for encrypt/decrypt.
 */
export async function deriveKey(passphrase, saltB64) {
  assertSubtle();
  const salt = b64decode(saltB64);
  const baseKey = await SUBTLE.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return SUBTLE.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a UTF-8 string. Returns the wire-format ciphertext.
 */
export async function encryptString(plaintext, key) {
  assertSubtle();
  const iv = randomBytes(IV_BYTES);
  const ct = await SUBTLE.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return `v1:${b64encode(iv)}:${b64encode(new Uint8Array(ct))}`;
}

/**
 * Decrypt a wire-format ciphertext. Throws on tamper or wrong key.
 */
export async function decryptString(wire, key) {
  assertSubtle();
  if (typeof wire !== 'string' || !wire.startsWith('v1:')) {
    throw new Error('Invalid ciphertext format');
  }
  const parts = wire.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const iv = b64decode(parts[1]);
  const ct = b64decode(parts[2]);
  const pt = await SUBTLE.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return dec.decode(pt);
}

/**
 * Build the verifier ciphertext used to confirm a passphrase later.
 */
export async function buildVerifier(key) {
  return encryptString(VERIFIER_PLAINTEXT, key);
}

/**
 * Confirm `key` matches the stored verifier; throws WrongPassphraseError otherwise.
 */
export async function checkVerifier(verifierWire, key) {
  try {
    const pt = await decryptString(verifierWire, key);
    if (pt !== VERIFIER_PLAINTEXT) throw new WrongPassphraseError();
  } catch (e) {
    if (e instanceof WrongPassphraseError) throw e;
    throw new WrongPassphraseError();
  }
}

export function isCryptoAvailable() {
  return Boolean(SUBTLE);
}
