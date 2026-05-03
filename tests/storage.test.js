/**
 * Tests for src/lib/storage.js — daily log persistence with the new
 * cycle-tracking fields (temperature, ovulation, bleeding, sport).
 *
 * Vitest runs in node without jsdom, so we install a tiny in-memory
 * `localStorage` shim before importing the module under test.
 */

import { beforeEach, describe, it, expect } from 'vitest';

// Minimal localStorage polyfill — enough for the storage module's
// happy paths (getItem / setItem / removeItem). No quota handling
// because the storage module already swallows that internally.
class MemoryStorage {
  constructor() { this.store = new Map(); }
  getItem(k)        { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v)     { this.store.set(k, String(v)); }
  removeItem(k)     { this.store.delete(k); }
  clear()           { this.store.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const {
  emptyLog,
  loadLog,
  saveLog,
  updateLog,
  loadRecentLogs,
  logHasData,
} = await import('../src/lib/storage.js');

beforeEach(() => {
  globalThis.localStorage.clear();
});

/* ────────────────────────  Empty log shape  ────────────────────────── */

describe('emptyLog', () => {
  it('exposes default values for every new tracking field', () => {
    const log = emptyLog();
    expect(log.temperature).toBe(0);
    expect(log.sportIntensity).toBe('');
    expect(log.ovulation).toEqual({ felt: false, fromTemp: false });
    expect(log.bleeding).toEqual({
      clots: '', clarity: '', heaviness: '', color: '',
    });
  });
});

/* ────────────────────────  Round-trip persistence  ─────────────────── */

describe('round-trip persistence of new fields', () => {
  it('saves and loads basal temperature', () => {
    const date = new Date(2026, 4, 1);
    saveLog(date, { ...emptyLog(), temperature: 36.4 });
    const loaded = loadLog(date);
    expect(loaded.temperature).toBe(36.4);
  });

  it('saves and loads ovulation flags independently', () => {
    const date = new Date(2026, 4, 2);
    saveLog(date, {
      ...emptyLog(),
      ovulation: { felt: true, fromTemp: false },
    });
    const loaded = loadLog(date);
    expect(loaded.ovulation).toEqual({ felt: true, fromTemp: false });
  });

  it('saves and loads bleeding details', () => {
    const date = new Date(2026, 4, 3);
    saveLog(date, {
      ...emptyLog(),
      bleeding: {
        heaviness: 'normal',
        color: 'red',
        clots: 'light',
        clarity: 'normal',
      },
    });
    const loaded = loadLog(date);
    expect(loaded.bleeding.heaviness).toBe('normal');
    expect(loaded.bleeding.color).toBe('red');
    expect(loaded.bleeding.clots).toBe('light');
    expect(loaded.bleeding.clarity).toBe('normal');
  });

  it('saves and loads sport intensity', () => {
    const date = new Date(2026, 4, 4);
    saveLog(date, { ...emptyLog(), sportIntensity: 'moderate' });
    expect(loadLog(date).sportIntensity).toBe('moderate');
  });

  it('migrates older logs that pre-date the new fields', () => {
    const date = new Date(2026, 4, 5);
    // Simulate a v1 entry: only legacy keys, none of the new ones.
    globalThis.localStorage.setItem(
      `aura.log.2026-05-05`,
      JSON.stringify({ calories: 1800, protein: 80 })
    );
    const loaded = loadLog(date);
    expect(loaded.calories).toBe(1800);
    // New fields should be filled with the empty-log defaults.
    expect(loaded.temperature).toBe(0);
    expect(loaded.bleeding).toEqual({
      clots: '', clarity: '', heaviness: '', color: '',
    });
    expect(loaded.ovulation).toEqual({ felt: false, fromTemp: false });
  });
});

/* ────────────────────────  Patch merging  ──────────────────────────── */

describe('updateLog deep-merges nested patches', () => {
  it('preserves untouched ovulation fields when only one flag changes', () => {
    const date = new Date(2026, 4, 6);
    saveLog(date, {
      ...emptyLog(),
      ovulation: { felt: true, fromTemp: false },
    });
    const next = updateLog(date, { ovulation: { fromTemp: true } });
    expect(next.ovulation).toEqual({ felt: true, fromTemp: true });
  });

  it('preserves untouched bleeding fields when only one is updated', () => {
    const date = new Date(2026, 4, 7);
    saveLog(date, {
      ...emptyLog(),
      bleeding: { heaviness: 'normal', color: 'red', clots: '', clarity: '' },
    });
    const next = updateLog(date, { bleeding: { color: 'dark-red' } });
    expect(next.bleeding.heaviness).toBe('normal');
    expect(next.bleeding.color).toBe('dark-red');
  });
});

/* ────────────────────────  Recent log scan  ────────────────────────── */

describe('loadRecentLogs', () => {
  it('returns the last N days, oldest → newest, with iso + log', () => {
    const today = new Date(2026, 4, 10);
    saveLog(new Date(2026, 4, 8),  { ...emptyLog(), temperature: 36.3 });
    saveLog(new Date(2026, 4, 9),  { ...emptyLog(), temperature: 36.4 });
    saveLog(new Date(2026, 4, 10), { ...emptyLog(), temperature: 36.6 });

    const series = loadRecentLogs(3, today);
    expect(series).toHaveLength(3);
    expect(series.map((s) => s.iso)).toEqual([
      '2026-05-08', '2026-05-09', '2026-05-10',
    ]);
    expect(series.map((s) => s.log.temperature)).toEqual([36.3, 36.4, 36.6]);
  });

  it('fills empty days with empty-log defaults', () => {
    const today = new Date(2026, 4, 12);
    saveLog(new Date(2026, 4, 12), { ...emptyLog(), temperature: 36.7 });
    const series = loadRecentLogs(3, today);
    expect(series[0].log.temperature).toBe(0);
    expect(series[1].log.temperature).toBe(0);
    expect(series[2].log.temperature).toBe(36.7);
  });
});

/* ────────────────────────  logHasData picks up new fields  ─────────── */

describe('logHasData', () => {
  it('returns true when only a temperature is logged', () => {
    expect(logHasData({ ...emptyLog(), temperature: 36.5 })).toBe(true);
  });

  it('returns true when only a sport intensity is logged', () => {
    expect(logHasData({ ...emptyLog(), sportIntensity: 'light' })).toBe(true);
  });

  it('returns true when only an ovulation flag is set', () => {
    expect(
      logHasData({ ...emptyLog(), ovulation: { felt: true, fromTemp: false } })
    ).toBe(true);
  });

  it('returns true when only a bleeding sub-option is set', () => {
    expect(
      logHasData({
        ...emptyLog(),
        bleeding: { heaviness: 'light', color: '', clots: '', clarity: '' },
      })
    ).toBe(true);
  });

  it('returns false for the unmodified empty log', () => {
    expect(logHasData(emptyLog())).toBe(false);
  });
});
