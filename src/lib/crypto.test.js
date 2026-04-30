import { describe, it, expect } from 'vitest';
import {
  deriveKey, encryptString, decryptString,
  buildVerifier, checkVerifier, newSalt,
  isCryptoAvailable, randomBytes,
  WrongPassphraseError,
} from './crypto.js';

describe('isCryptoAvailable', () => {
  it('reports true when Web Crypto is present (Node 19+)', () => {
    expect(isCryptoAvailable()).toBe(true);
  });
});

describe('newSalt', () => {
  it('produces unique values across many calls (entropy sanity)', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(newSalt());
    expect(seen.size).toBe(100);
  });

  it('returns a base64 string', () => {
    expect(newSalt()).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

describe('randomBytes', () => {
  it('returns a Uint8Array of the requested length', () => {
    const bytes = randomBytes(24);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(24);
  });
});

describe('deriveKey', () => {
  it('is deterministic — same passphrase + salt + iv → same ciphertext', async () => {
    const salt = newSalt();
    const k1 = await deriveKey('correcthorsebattery', salt);
    const k2 = await deriveKey('correcthorsebattery', salt);
    const iv = new Uint8Array(12).fill(7);
    const enc = new TextEncoder();
    const ct1 = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k1, enc.encode('hello')),
    );
    const ct2 = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k2, enc.encode('hello')),
    );
    expect(ct1).toEqual(ct2);
  });

  it('produces a different key when the salt changes (cross-decrypt fails)', async () => {
    const k1 = await deriveKey('pw', newSalt());
    const k2 = await deriveKey('pw', newSalt());
    const wire = await encryptString('hello', k1);
    await expect(decryptString(wire, k2)).rejects.toThrow();
  });

  it('produces a different key when the passphrase changes (cross-decrypt fails)', async () => {
    const salt = newSalt();
    const k1 = await deriveKey('pw1', salt);
    const k2 = await deriveKey('pw2', salt);
    const wire = await encryptString('hello', k1);
    await expect(decryptString(wire, k2)).rejects.toThrow();
  });
});

describe('encryptString / decryptString', () => {
  it('round-trips the empty string', async () => {
    const key = await deriveKey('pw', newSalt());
    const wire = await encryptString('', key);
    expect(await decryptString(wire, key)).toBe('');
  });

  it('round-trips ASCII', async () => {
    const key = await deriveKey('pw', newSalt());
    const wire = await encryptString('hello world', key);
    expect(await decryptString(wire, key)).toBe('hello world');
  });

  it('round-trips UTF-8 (emoji + accents)', async () => {
    const key = await deriveKey('pw', newSalt());
    const text = 'café — ☕️🌿 — naïve résumé 🇳🇱';
    const wire = await encryptString(text, key);
    expect(await decryptString(wire, key)).toBe(text);
  });

  it('writes the v1: wire format with three colon-segments', async () => {
    const key = await deriveKey('pw', newSalt());
    const wire = await encryptString('payload', key);
    expect(wire.startsWith('v1:')).toBe(true);
    expect(wire.split(':')).toHaveLength(3);
  });

  it('rejects ciphertext with an unrecognized prefix', async () => {
    const key = await deriveKey('pw', newSalt());
    await expect(decryptString('v0:foo:bar', key)).rejects.toThrow(/format/);
    await expect(decryptString('plain', key)).rejects.toThrow(/format/);
  });

  it('rejects ciphertext with the wrong number of segments', async () => {
    const key = await deriveKey('pw', newSalt());
    await expect(decryptString('v1:onlytwo', key)).rejects.toThrow(/format/);
    await expect(decryptString('v1:a:b:c:d', key)).rejects.toThrow(/format/);
  });

  it('rejects non-string ciphertext', async () => {
    const key = await deriveKey('pw', newSalt());
    await expect(decryptString(null, key)).rejects.toThrow(/format/);
    await expect(decryptString(123, key)).rejects.toThrow(/format/);
  });

  it('detects tampered ciphertext via the AES-GCM auth tag', async () => {
    const key = await deriveKey('pw', newSalt());
    const wire = await encryptString('mutate me', key);
    const [, ivB64, ctB64] = wire.split(':');
    const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
    ct[0] ^= 0x01; // flip one bit of the ciphertext payload
    let s = '';
    for (let i = 0; i < ct.length; i++) s += String.fromCharCode(ct[i]);
    const tampered = `v1:${ivB64}:${btoa(s)}`;
    await expect(decryptString(tampered, key)).rejects.toThrow();
  });

  it('throws (does not return empty string) when the wrong key is used', async () => {
    const salt = newSalt();
    const k1 = await deriveKey('pw1', salt);
    const k2 = await deriveKey('pw2', salt);
    const wire = await encryptString('secret', k1);
    await expect(decryptString(wire, k2)).rejects.toThrow();
  });
});

describe('buildVerifier / checkVerifier', () => {
  it('accepts the same key that built the verifier', async () => {
    const key = await deriveKey('pw', newSalt());
    const verifier = await buildVerifier(key);
    await expect(checkVerifier(verifier, key)).resolves.toBeUndefined();
  });

  it('throws WrongPassphraseError for the wrong key', async () => {
    const salt = newSalt();
    const right = await deriveKey('correct', salt);
    const wrong = await deriveKey('different', salt);
    const verifier = await buildVerifier(right);
    await expect(checkVerifier(verifier, wrong)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('throws WrongPassphraseError for a malformed verifier (not a silent pass)', async () => {
    const key = await deriveKey('pw', newSalt());
    await expect(checkVerifier('garbage', key)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('throws WrongPassphraseError when the verifier decrypts to an unexpected plaintext', async () => {
    // Encrypt a non-VERIFIER_PLAINTEXT value with the right key — checkVerifier
    // must still reject it (defends against a forged-but-decryptable verifier).
    const key = await deriveKey('pw', newSalt());
    const fake = await encryptString('not the verifier marker', key);
    await expect(checkVerifier(fake, key)).rejects.toBeInstanceOf(WrongPassphraseError);
  });
});
