/**
 * Tests for src/lib/cycle.js — the cycle calculation engine.
 *
 * Conventions:
 *   - All Date constructions use `new Date(year, monthIndex, day)` (local
 *     time) so we don't tangle with UTC parsing of ISO strings.
 *   - Months are 0-indexed in Date constructors.
 */

import { describe, it, expect } from 'vitest';

import {
  PHASES,
  PHASE_META,
  atMidnight,
  daysBetween,
  toISODate,
  buildPhaseMap,
  phaseForCycleDay,
  clampCycleLength,
  currentCycleDay,
  getCycleState,
  logPeriodStart,
  unlogPeriodStart,
  isPeriodLoggedOn,
  getCycleHistory,
} from '../src/lib/cycle.js';

/* ─────────────────────────────  Date helpers  ───────────────────────── */

describe('clampCycleLength', () => {
  it('passes through values in range', () => {
    expect(clampCycleLength(28)).toBe(28);
    expect(clampCycleLength(21)).toBe(21);
    expect(clampCycleLength(45)).toBe(45);
  });

  it('clamps to physiological bounds [21, 45]', () => {
    expect(clampCycleLength(10)).toBe(21);
    expect(clampCycleLength(60)).toBe(45);
    expect(clampCycleLength(-5)).toBe(21);
  });

  it('rounds non-integers', () => {
    expect(clampCycleLength(28.4)).toBe(28);
    expect(clampCycleLength(28.7)).toBe(29);
  });

  it('falls back to 28 for non-finite or missing input', () => {
    expect(clampCycleLength(NaN)).toBe(28);
    expect(clampCycleLength(undefined)).toBe(28);
    expect(clampCycleLength(null)).toBe(28);
  });

  it('coerces numeric strings', () => {
    expect(clampCycleLength('30')).toBe(30);
    expect(clampCycleLength('  29  ')).toBe(29);
  });
});

describe('atMidnight', () => {
  it('strips time-of-day', () => {
    const d = new Date(2026, 5, 15, 14, 30, 45);
    const m = atMidnight(d);
    expect(m.getHours()).toBe(0);
    expect(m.getMinutes()).toBe(0);
    expect(m.getSeconds()).toBe(0);
    expect(m.getMilliseconds()).toBe(0);
  });

  it('does not mutate the input Date', () => {
    const d = new Date(2026, 5, 15, 14, 30);
    atMidnight(d);
    expect(d.getHours()).toBe(14);
  });
});

describe('daysBetween', () => {
  it('returns 0 for same calendar day', () => {
    const a = new Date(2026, 0, 15, 9);
    const b = new Date(2026, 0, 15, 23);
    expect(daysBetween(a, b)).toBe(0);
  });

  it('counts whole days forward', () => {
    expect(daysBetween(new Date(2026, 0, 15), new Date(2026, 0, 22))).toBe(7);
  });

  it('returns negative for past second arg', () => {
    expect(daysBetween(new Date(2026, 0, 22), new Date(2026, 0, 15))).toBe(-7);
  });

  it('handles month boundaries', () => {
    expect(daysBetween(new Date(2026, 0, 30), new Date(2026, 1, 5))).toBe(6);
  });
});

describe('toISODate', () => {
  it('formats yyyy-mm-dd in local time', () => {
    expect(toISODate(new Date(2026, 0, 15))).toBe('2026-01-15');
    expect(toISODate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('zero-pads month and day', () => {
    expect(toISODate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toISODate(new Date(2026, 8, 9))).toBe('2026-09-09');
  });
});

/* ─────────────────────────────  Phase math  ─────────────────────────── */

describe('buildPhaseMap', () => {
  it('produces the canonical 28-day reference', () => {
    const map = buildPhaseMap(28);
    expect(map).toEqual([
      { phase: PHASES.MENSTRUAL,  startDay:  1, endDay:  5, length:  5 },
      { phase: PHASES.FOLLICULAR, startDay:  6, endDay: 13, length:  8 },
      { phase: PHASES.OVULATORY,  startDay: 14, endDay: 16, length:  3 },
      { phase: PHASES.LUTEAL,     startDay: 17, endDay: 28, length: 12 },
    ]);
  });

  it('sums to cycleLength for any valid input', () => {
    for (const len of [21, 24, 28, 30, 35, 40, 45]) {
      const map = buildPhaseMap(len);
      const total = map.reduce((s, slot) => s + slot.length, 0);
      expect(total).toBe(len);
    }
  });

  it('keeps menstrual length fixed at 5 days', () => {
    expect(buildPhaseMap(21)[0].length).toBe(5);
    expect(buildPhaseMap(35)[0].length).toBe(5);
    expect(buildPhaseMap(45)[0].length).toBe(5);
  });

  it('guarantees ovulatory phase ≥ 2 days', () => {
    for (const len of [21, 22, 23, 24, 25]) {
      expect(buildPhaseMap(len)[2].length).toBeGreaterThanOrEqual(2);
    }
  });

  it('produces strictly contiguous, non-overlapping slots', () => {
    const map = buildPhaseMap(35);
    expect(map[0].startDay).toBe(1);
    for (let i = 1; i < map.length; i++) {
      expect(map[i].startDay).toBe(map[i - 1].endDay + 1);
    }
  });

  it('clamps invalid cycle lengths before computing', () => {
    expect(buildPhaseMap(10)[0].startDay).toBe(1);     // → 21-day cycle
    const tooLong = buildPhaseMap(100);
    const total = tooLong.reduce((s, slot) => s + slot.length, 0);
    expect(total).toBe(45);
  });
});

describe('phaseForCycleDay', () => {
  it('maps the canonical 28-day boundaries', () => {
    expect(phaseForCycleDay(1,  28)).toBe(PHASES.MENSTRUAL);
    expect(phaseForCycleDay(5,  28)).toBe(PHASES.MENSTRUAL);
    expect(phaseForCycleDay(6,  28)).toBe(PHASES.FOLLICULAR);
    expect(phaseForCycleDay(13, 28)).toBe(PHASES.FOLLICULAR);
    expect(phaseForCycleDay(14, 28)).toBe(PHASES.OVULATORY);
    expect(phaseForCycleDay(16, 28)).toBe(PHASES.OVULATORY);
    expect(phaseForCycleDay(17, 28)).toBe(PHASES.LUTEAL);
    expect(phaseForCycleDay(28, 28)).toBe(PHASES.LUTEAL);
  });

  it('falls through to luteal for out-of-range days', () => {
    expect(phaseForCycleDay(99, 28)).toBe(PHASES.LUTEAL);
  });
});

describe('currentCycleDay', () => {
  it('returns 1 on the period-start day itself', () => {
    const start = new Date(2026, 0, 1);
    expect(currentCycleDay(start, 28, start)).toBe(1);
  });

  it('counts forward correctly within one cycle', () => {
    const start = new Date(2026, 0, 1);
    expect(currentCycleDay(start, 28, new Date(2026, 0,  8))).toBe(8);
    expect(currentCycleDay(start, 28, new Date(2026, 0, 28))).toBe(28);
  });

  it('wraps around to day 1 at the start of the next cycle', () => {
    const start = new Date(2026, 0, 1);
    expect(currentCycleDay(start, 28, new Date(2026, 0, 29))).toBe(1);
  });

  it('handles dates many cycles after the start', () => {
    const start = new Date(2026, 0, 1);
    // 100 days after, 28-day cycle: 100 % 28 = 16 → day 17
    expect(currentCycleDay(start, 28, new Date(2026, 3, 11))).toBe(17);
  });

  it('handles future-dated last-period (negative diff) without crashing', () => {
    const today = new Date(2026, 0, 1);
    const future = new Date(2026, 0, 5);
    const day = currentCycleDay(future, 28, today);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(28);
  });
});

/* ─────────────────────────────  Top-level state  ───────────────────── */

describe('getCycleState', () => {
  it('returns a graceful no-data fallback when lastPeriodStart is missing', () => {
    const s = getCycleState({ cycleLength: 28 }, new Date(2026, 0, 1));
    expect(s.hasData).toBe(false);
    expect(s.cycleDay).toBeNull();
    expect(s.phase).toBe(PHASES.FOLLICULAR);
    expect(s.phaseMeta).toBe(PHASE_META[PHASES.FOLLICULAR]);
    expect(s.progressPct).toBe(0);
  });

  it('computes the full state when data is present', () => {
    const profile = {
      cycleLength:     28,
      lastPeriodStart: new Date(2026, 0, 1),
    };
    const s = getCycleState(profile, new Date(2026, 0, 15));
    expect(s.hasData).toBe(true);
    expect(s.cycleDay).toBe(15);
    expect(s.phase).toBe(PHASES.OVULATORY);
    expect(s.phaseMeta.label).toBe('Ovulatie');
    expect(s.progressPct).toBe(54); // round(15/28*100)
  });

  it('clamps an out-of-range cycleLength', () => {
    const s = getCycleState({ cycleLength: 200, lastPeriodStart: new Date(2026, 0, 1) },
                             new Date(2026, 0, 1));
    expect(s.cycleLength).toBe(45);
  });
});

/* ───────────────────────────  Period logging  ─────────────────────── */

describe('logPeriodStart', () => {
  it('seeds history from lastPeriodStart and adds today as a new bleed', () => {
    const profile = {
      cycleLength:     28,
      lastPeriodStart: '2026-01-01',
    };
    const next = logPeriodStart(profile, new Date(2026, 0, 30));
    expect(next).not.toBe(profile);
    expect(next.periodHistory).toEqual(['2026-01-01', '2026-01-30']);
    expect(next.lastPeriodStart).toBe('2026-01-30');
  });

  it('returns the same reference when already logged today', () => {
    const profile = {
      cycleLength:     28,
      lastPeriodStart: '2026-01-30',
      periodHistory:   ['2026-01-01', '2026-01-30'],
    };
    expect(logPeriodStart(profile, new Date(2026, 0, 30))).toBe(profile);
  });

  it('treats logs within 10 days as the same continuing bleed (no-op)', () => {
    const profile = {
      cycleLength:     28,
      lastPeriodStart: '2026-01-30',
      periodHistory:   ['2026-01-01', '2026-01-30'],
    };
    const sameBleed = logPeriodStart(profile, new Date(2026, 1, 5)); // 6 days later
    expect(sameBleed).toBe(profile);
  });

  it('learns cycleLength from accumulated history', () => {
    let p = {
      cycleLength:     28,
      lastPeriodStart: '2026-01-01',
    };
    p = logPeriodStart(p, new Date(2026, 0, 31)); // 30-day gap
    p = logPeriodStart(p, new Date(2026, 2, 2));  // 30-day gap
    p = logPeriodStart(p, new Date(2026, 3, 1));  // 30-day gap
    // 3 gaps of 30 → learnt cycleLength = 30
    expect(p.cycleLength).toBe(30);
  });
});

describe('unlogPeriodStart', () => {
  it('removes today from history and rolls lastPeriodStart back', () => {
    const profile = {
      cycleLength:     28,
      lastPeriodStart: '2026-01-30',
      periodHistory:   ['2026-01-01', '2026-01-30'],
    };
    const reverted = unlogPeriodStart(profile, new Date(2026, 0, 30));
    expect(reverted.periodHistory).toEqual(['2026-01-01']);
    expect(reverted.lastPeriodStart).toBe('2026-01-01');
  });

  it('is a no-op when no history matches today', () => {
    const profile = {
      cycleLength:     28,
      lastPeriodStart: '2026-01-30',
      periodHistory:   ['2026-01-01', '2026-01-30'],
    };
    expect(unlogPeriodStart(profile, new Date(2026, 1, 15))).toBe(profile);
  });
});

describe('isPeriodLoggedOn', () => {
  it('returns true only for explicit history entries', () => {
    const profile = { periodHistory: ['2026-01-01', '2026-01-30'] };
    expect(isPeriodLoggedOn(profile, new Date(2026, 0, 30))).toBe(true);
    expect(isPeriodLoggedOn(profile, new Date(2026, 0,  2))).toBe(false);
  });

  it('returns false when periodHistory is missing', () => {
    expect(isPeriodLoggedOn({}, new Date())).toBe(false);
    expect(isPeriodLoggedOn(null, new Date())).toBe(false);
  });
});

describe('getCycleHistory', () => {
  it('returns [] for fewer than 2 entries', () => {
    expect(getCycleHistory({ periodHistory: [] })).toEqual([]);
    expect(getCycleHistory({ periodHistory: ['2026-01-01'] })).toEqual([]);
    expect(getCycleHistory({})).toEqual([]);
  });

  it('produces one gap per consecutive pair', () => {
    const h = ['2026-01-01', '2026-01-30', '2026-02-28', '2026-03-30'];
    const gaps = getCycleHistory({ periodHistory: h });
    expect(gaps).toHaveLength(3);
    expect(gaps.map(g => g.length)).toEqual([29, 29, 30]);
  });

  it('caps the result to `max` most recent gaps', () => {
    const h = ['2026-01-01', '2026-01-30', '2026-02-28', '2026-03-30', '2026-04-29'];
    const gaps = getCycleHistory({ periodHistory: h }, 2);
    expect(gaps).toHaveLength(2);
    expect(gaps[0].start).toBe('2026-02-28');
    expect(gaps[1].start).toBe('2026-03-30');
  });
});
