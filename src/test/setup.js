/**
 * Vitest setup — runs before every test file.
 * Provides a Map-backed localStorage stub (Node has no DOM by default) and
 * resets it before each test so files are isolated.
 */
import { beforeEach } from 'vitest';

class LocalStorageStub {
  constructor() {
    this._store = new Map();
  }
  get length() {
    return this._store.size;
  }
  key(i) {
    if (i < 0 || i >= this._store.size) return null;
    return [...this._store.keys()][i];
  }
  getItem(k) {
    return this._store.has(k) ? this._store.get(k) : null;
  }
  setItem(k, v) {
    this._store.set(String(k), String(v));
  }
  removeItem(k) {
    this._store.delete(k);
  }
  clear() {
    this._store.clear();
  }
}

globalThis.localStorage = new LocalStorageStub();

beforeEach(() => {
  globalThis.localStorage.clear();
});
