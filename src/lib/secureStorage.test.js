import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setupNew, unlock, lock,
  isInitialized, isUnlocked,
  getItem, setItem, removeItem,
  destroyAll, listAuraDataKeys,
  changePassphrase, migratePlaintext,
  onQuotaError,
} from './secureStorage.js';
import { WrongPassphraseError } from './crypto.js';

const SALT_KEY = 'aura.kdf.salt';
const VERIFIER_KEY = 'aura.kdf.verifier';

// setItem fires the encrypt + safeWrite asynchronously; tests need a way to
// wait until the ciphertext has actually landed in localStorage.
async function waitForWrite(key) {
  await vi.waitFor(() => {
    const v = localStorage.getItem(key);
    if (!v || !v.startsWith('v1:')) throw new Error(`${key} not written yet`);
  }, { timeout: 5000, interval: 5 });
}

beforeEach(() => {
  // setup.js clears localStorage between tests; we also reset module state.
  lock();
  onQuotaError(undefined);
});

describe('lifecycle: setupNew → lock → unlock', () => {
  it('starts uninitialized and locked', () => {
    expect(isInitialized()).toBe(false);
    expect(isUnlocked()).toBe(false);
  });

  it('setupNew initializes salt + verifier and leaves the store unlocked', async () => {
    await setupNew('hunter2hunter2');

    expect(isInitialized()).toBe(true);
    expect(isUnlocked()).toBe(true);
    expect(localStorage.getItem(SALT_KEY)).toBeTruthy();
    expect(localStorage.getItem(VERIFIER_KEY)).toMatch(/^v1:/);
  });

  it('lock() clears in-memory state — getItem returns null until re-unlocked', async () => {
    await setupNew('hunter2hunter2');
    setItem('aura.foo', '"bar"');
    await waitForWrite('aura.foo');

    lock();
    expect(isUnlocked()).toBe(false);
    expect(getItem('aura.foo')).toBeNull();

    await unlock('hunter2hunter2');
    expect(isUnlocked()).toBe(true);
    expect(getItem('aura.foo')).toBe('"bar"');
  });

  it('round-trips a value through setItem + lock + unlock', async () => {
    await setupNew('hunter2hunter2');
    setItem('aura.profile', JSON.stringify({ name: 'Eline' }));
    await waitForWrite('aura.profile');

    lock();
    await unlock('hunter2hunter2');

    expect(JSON.parse(getItem('aura.profile'))).toEqual({ name: 'Eline' });
  });

  it('unlock(wrong) throws WrongPassphraseError and leaves the store locked', async () => {
    await setupNew('correctpassphrase');
    lock();

    await expect(unlock('wrongpassphrase')).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(isUnlocked()).toBe(false);
    expect(getItem('aura.profile')).toBeNull();
  });

  it('unlock fails when the store has not been initialized', async () => {
    await expect(unlock('anything')).rejects.toThrow(/not initialized/);
  });

  it('skips corrupt entries during unlock rather than blowing up', async () => {
    await setupNew('hunter2hunter2');
    setItem('aura.good', '"ok"');
    await waitForWrite('aura.good');
    // Plant a junk ciphertext; unlock should silently skip it and still cache
    // the good entry.
    localStorage.setItem('aura.broken', 'v1:not-base64-actually:also-junk');

    lock();
    await unlock('hunter2hunter2');

    expect(getItem('aura.good')).toBe('"ok"');
    expect(getItem('aura.broken')).toBeNull();
  });
});

describe('setItem / getItem / removeItem', () => {
  it('setItem is a no-op while locked', () => {
    setItem('aura.foo', '"x"');
    expect(getItem('aura.foo')).toBeNull();
    expect(localStorage.getItem('aura.foo')).toBeNull();
  });

  it('removeItem clears both cache and localStorage', async () => {
    await setupNew('hunter2hunter2');
    setItem('aura.foo', '"x"');
    await waitForWrite('aura.foo');

    removeItem('aura.foo');
    expect(getItem('aura.foo')).toBeNull();
    expect(localStorage.getItem('aura.foo')).toBeNull();
  });

  it('removeItem is a safe no-op while locked', () => {
    expect(() => removeItem('aura.absent')).not.toThrow();
  });
});

describe('listAuraDataKeys / destroyAll', () => {
  it('listAuraDataKeys returns aura.* entries excluding KDF metadata', async () => {
    await setupNew('hunter2hunter2');
    setItem('aura.profile', '"p"');
    setItem('aura.daily', '"d"');
    await waitForWrite('aura.profile');
    await waitForWrite('aura.daily');

    const keys = listAuraDataKeys().sort();
    expect(keys).toEqual(['aura.daily', 'aura.profile']);
  });

  it('destroyAll wipes Aura keys and locks the store', async () => {
    await setupNew('hunter2hunter2');
    setItem('aura.profile', '"p"');
    setItem('aura.daily', '"d"');
    await waitForWrite('aura.profile');
    await waitForWrite('aura.daily');

    destroyAll();
    expect(isInitialized()).toBe(false);
    expect(isUnlocked()).toBe(false);
    expect(listAuraDataKeys()).toEqual([]);
    expect(localStorage.getItem(SALT_KEY)).toBeNull();
    expect(localStorage.getItem(VERIFIER_KEY)).toBeNull();
  });
});

describe('migratePlaintext', () => {
  it('encrypts pre-encryption plain JSON aura.profile in place', async () => {
    localStorage.setItem('aura.profile', JSON.stringify({ name: 'pre-crypto' }));
    await setupNew('hunter2hunter2');

    await migratePlaintext();

    expect(localStorage.getItem('aura.profile')).toMatch(/^v1:/);
    expect(getItem('aura.profile')).toBe(JSON.stringify({ name: 'pre-crypto' }));
  });

  it('is idempotent — running twice leaves the existing ciphertext untouched', async () => {
    localStorage.setItem('aura.profile', JSON.stringify({ name: 'eline' }));
    await setupNew('hunter2hunter2');

    await migratePlaintext();
    const wireAfterFirst = localStorage.getItem('aura.profile');
    await migratePlaintext();
    const wireAfterSecond = localStorage.getItem('aura.profile');

    // The second call must NOT re-encrypt (would produce a fresh IV → different
    // wire). Skip-if-already-v1 guarantees byte-equality across runs.
    expect(wireAfterSecond).toBe(wireAfterFirst);
    expect(getItem('aura.profile')).toBe(JSON.stringify({ name: 'eline' }));
  });

  it('skips non-JSON plaintext rather than encrypting garbage', async () => {
    localStorage.setItem('aura.weird', 'not json at all');
    await setupNew('hunter2hunter2');

    await migratePlaintext();

    expect(localStorage.getItem('aura.weird')).toBe('not json at all');
  });

  it('throws when called while locked', async () => {
    await expect(migratePlaintext()).rejects.toThrow(/locked/);
  });
});

describe('changePassphrase', () => {
  it('rejects a wrong current passphrase without modifying anything', async () => {
    await setupNew('oldpasspass');
    setItem('aura.profile', '"data"');
    await waitForWrite('aura.profile');

    const saltBefore = localStorage.getItem(SALT_KEY);
    const verifierBefore = localStorage.getItem(VERIFIER_KEY);
    const wireBefore = localStorage.getItem('aura.profile');

    await expect(
      changePassphrase('not-the-right-one', 'newpasspass'),
    ).rejects.toBeInstanceOf(WrongPassphraseError);

    expect(localStorage.getItem(SALT_KEY)).toBe(saltBefore);
    expect(localStorage.getItem(VERIFIER_KEY)).toBe(verifierBefore);
    expect(localStorage.getItem('aura.profile')).toBe(wireBefore);
    // Old passphrase must still unlock.
    lock();
    await expect(unlock('oldpasspass')).resolves.toBeUndefined();
  });

  it('re-encrypts every cached entry under the new key', async () => {
    await setupNew('oldpasspass');
    setItem('aura.profile', '"profile"');
    setItem('aura.daily', '"daily"');
    await waitForWrite('aura.profile');
    await waitForWrite('aura.daily');

    const oldProfileWire = localStorage.getItem('aura.profile');
    const oldDailyWire = localStorage.getItem('aura.daily');

    await changePassphrase('oldpasspass', 'newpasspass');

    // Ciphertexts change (new key + new IVs).
    expect(localStorage.getItem('aura.profile')).not.toBe(oldProfileWire);
    expect(localStorage.getItem('aura.daily')).not.toBe(oldDailyWire);
    // Plaintext (cache) is unchanged.
    expect(getItem('aura.profile')).toBe('"profile"');
    expect(getItem('aura.daily')).toBe('"daily"');
  });

  it('after change: old passphrase fails, new passphrase unlocks', async () => {
    await setupNew('oldpasspass');
    setItem('aura.profile', '"data"');
    await waitForWrite('aura.profile');

    await changePassphrase('oldpasspass', 'newpasspass');
    lock();

    await expect(unlock('oldpasspass')).rejects.toBeInstanceOf(WrongPassphraseError);
    await unlock('newpasspass');
    expect(getItem('aura.profile')).toBe('"data"');
  });

  it('rolls back salt + verifier when a write fails partway', async () => {
    await setupNew('oldpasspass');
    setItem('aura.profile', '"data"');
    setItem('aura.daily', '"day"');
    await waitForWrite('aura.profile');
    await waitForWrite('aura.daily');

    const saltBefore = localStorage.getItem(SALT_KEY);
    const verifierBefore = localStorage.getItem(VERIFIER_KEY);
    const profileBefore = localStorage.getItem('aura.profile');
    const dailyBefore = localStorage.getItem('aura.daily');

    // changePassphrase writes salt → verifier → re-encrypted entries.
    // Throwing on the 3rd setItem forces rollback after salt+verifier
    // have already been overwritten.
    const realSetItem = localStorage.setItem.bind(localStorage);
    let calls = 0;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
      calls++;
      if (calls === 3) throw new Error('quota exceeded');
      realSetItem(k, v);
    });

    try {
      await expect(
        changePassphrase('oldpasspass', 'newpasspass'),
      ).rejects.toThrow(/quota/);
    } finally {
      spy.mockRestore();
    }

    expect(localStorage.getItem(SALT_KEY)).toBe(saltBefore);
    expect(localStorage.getItem(VERIFIER_KEY)).toBe(verifierBefore);
    expect(localStorage.getItem('aura.profile')).toBe(profileBefore);
    expect(localStorage.getItem('aura.daily')).toBe(dailyBefore);

    // The session is still operable under the OLD passphrase.
    lock();
    await unlock('oldpasspass');
    expect(getItem('aura.profile')).toBe('"data"');
  });

  it('rejects too-short new passphrases without modifying state', async () => {
    await setupNew('oldpasspass');
    const saltBefore = localStorage.getItem(SALT_KEY);

    await expect(
      changePassphrase('oldpasspass', 'short'),
    ).rejects.toBeInstanceOf(RangeError);

    expect(localStorage.getItem(SALT_KEY)).toBe(saltBefore);
  });

  it('throws when called while locked', async () => {
    await setupNew('oldpasspass');
    lock();
    await expect(
      changePassphrase('oldpasspass', 'newpasspass'),
    ).rejects.toThrow(/locked/);
  });
});

describe('quota handling (safeWrite)', () => {
  it('invokes the quota listener when a write hits a QuotaExceededError', async () => {
    await setupNew('hunter2hunter2');

    const quotaSpy = vi.fn();
    onQuotaError(quotaSpy);

    const spy = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      const e = new Error('Storage is full');
      e.name = 'QuotaExceededError';
      throw e;
    });

    try {
      setItem('aura.big', 'x'.repeat(10));
      await vi.waitFor(() => {
        if (quotaSpy.mock.calls.length === 0) throw new Error('not yet');
      }, { timeout: 1000, interval: 5 });
    } finally {
      spy.mockRestore();
    }

    expect(quotaSpy).toHaveBeenCalledTimes(1);
  });

  it('swallows non-quota write errors silently (cache still holds the value)', async () => {
    await setupNew('hunter2hunter2');

    const quotaSpy = vi.fn();
    onQuotaError(quotaSpy);

    const spy = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('something else broke');
    });

    try {
      setItem('aura.foo', '"value"');
      // Cache is updated synchronously regardless of write outcome.
      expect(getItem('aura.foo')).toBe('"value"');
      // Give the swallowed-error microtask a chance to settle.
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      spy.mockRestore();
    }

    expect(quotaSpy).not.toHaveBeenCalled();
  });
});
