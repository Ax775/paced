import { describe, it, expect } from 'vitest';
import {
  atMidnight, daysBetween, toISODate,
  currentCycleDay, buildPhaseMap, phaseForCycleDay,
  clampCycleLength, PHASES,
} from './cycle.js';

describe('atMidnight', () => {
  it('strips time-of-day to local midnight', () => {
    const d = atMidnight(new Date(2026, 0, 15, 14, 37, 22));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    expect(d.getDate()).toBe(15);
    expect(d.getMonth()).toBe(0);
  });
});

describe('toISODate', () => {
  it('zero-pads month and day', () => {
    expect(toISODate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toISODate(new Date(2026, 8, 9))).toBe('2026-09-09');
  });

  it('uses local time, not UTC (no off-by-one near midnight)', () => {
    // 23:59:59 local on Mar 5 must still be 2026-03-05, not Mar 6.
    expect(toISODate(new Date(2026, 2, 5, 23, 59, 59))).toBe('2026-03-05');
  });
});

describe('daysBetween', () => {
  it('counts whole days, ignoring time-of-day', () => {
    const a = new Date(2026, 3, 1, 23, 59);
    const b = new Date(2026, 3, 2, 0, 1);
    expect(daysBetween(a, b)).toBe(1);
  });

  it('survives the year boundary (Dec 31 → Jan 1)', () => {
    expect(daysBetween(new Date(2025, 11, 31), new Date(2026, 0, 1))).toBe(1);
    expect(daysBetween(new Date(2025, 11, 25), new Date(2026, 0, 5))).toBe(11);
  });

  it('handles leap-year February (28 → 29 → Mar 1)', () => {
    // 2024 is a leap year.
    expect(daysBetween(new Date(2024, 1, 28), new Date(2024, 1, 29))).toBe(1);
    expect(daysBetween(new Date(2024, 1, 28), new Date(2024, 2, 1))).toBe(2);
    // 2026 is not a leap year — Feb 28 → Mar 1 is one day.
    expect(daysBetween(new Date(2026, 1, 28), new Date(2026, 2, 1))).toBe(1);
  });

  it('survives DST transitions in spring and autumn', () => {
    // EU spring-forward 2026 is Mar 29; autumn-back is Oct 25. Day count
    // must stay integral even though one local day is 23h and another 25h.
    expect(daysBetween(new Date(2026, 2, 28), new Date(2026, 2, 30))).toBe(2);
    expect(daysBetween(new Date(2026, 9, 24), new Date(2026, 9, 26))).toBe(2);
  });

  it('returns negative for backwards dates without NaN', () => {
    expect(daysBetween(new Date(2026, 5, 10), new Date(2026, 5, 5))).toBe(-5);
  });
});

describe('currentCycleDay', () => {
  it('returns 1 on the same day as the last period start', () => {
    const start = new Date(2026, 3, 15);
    expect(currentCycleDay(start, 28, start)).toBe(1);
  });

  it('returns 28 on the day before a new cycle would start (28-day length)', () => {
    expect(currentCycleDay(new Date(2026, 3, 1), 28, new Date(2026, 3, 28))).toBe(28);
  });

  it('wraps to 1 on the next cycle start', () => {
    expect(currentCycleDay(new Date(2026, 3, 1), 28, new Date(2026, 3, 29))).toBe(1);
  });

  it('handles many cycles elapsed (cycle modulo)', () => {
    // 84 days = exactly 3 × 28-day cycles; should land back on day 1.
    expect(currentCycleDay(new Date(2026, 0, 1), 28, new Date(2026, 2, 26))).toBe(1);
  });

  it('handles future-dated last period without going negative', () => {
    // User mistakenly entered a date in the future — we should still
    // return a sensible 1..len value rather than 0 or a negative.
    const today = new Date(2026, 3, 1);
    const future = new Date(2026, 3, 10);
    const day = currentCycleDay(future, 28, today);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(28);
  });

  it('crosses the year boundary correctly', () => {
    // Last period Dec 20 2025, today Jan 5 2026 → 17 days elapsed → day 18.
    expect(
      currentCycleDay(new Date(2025, 11, 20), 28, new Date(2026, 0, 5)),
    ).toBe(17);
  });

  it('crosses the leap-day boundary correctly', () => {
    // Last period Feb 1 2024, today Mar 1 2024 → 29 days (Feb has 29) → day 30 → wraps to day 2.
    // diff = 29, len = 28, ((29 % 28) + 28) % 28 = 1, +1 = 2.
    expect(
      currentCycleDay(new Date(2024, 1, 1), 28, new Date(2024, 2, 1)),
    ).toBe(2);
  });
});

describe('clampCycleLength', () => {
  it('clamps to the [21, 45] range', () => {
    expect(clampCycleLength(15)).toBe(21);
    expect(clampCycleLength(60)).toBe(45);
    expect(clampCycleLength(28)).toBe(28);
  });

  it('falls back to 28 for non-numeric input', () => {
    expect(clampCycleLength('not a number')).toBe(28);
    expect(clampCycleLength(NaN)).toBe(28);
    expect(clampCycleLength(undefined)).toBe(28);
  });
});

describe('buildPhaseMap', () => {
  it('totals always equal the cycle length, for every supported length', () => {
    for (let len = 21; len <= 45; len++) {
      const total = buildPhaseMap(len).reduce((sum, slot) => sum + slot.length, 0);
      expect(total, `cycle length ${len}`).toBe(len);
    }
  });

  it('keeps the menstrual phase at 5 days regardless of cycle length', () => {
    for (const len of [21, 28, 35, 45]) {
      const m = buildPhaseMap(len).find((s) => s.phase === PHASES.MENSTRUAL);
      expect(m.length).toBe(5);
    }
  });

  it('emits contiguous start/end days starting at 1', () => {
    const map = buildPhaseMap(28);
    expect(map[0].startDay).toBe(1);
    for (let i = 1; i < map.length; i++) {
      expect(map[i].startDay).toBe(map[i - 1].endDay + 1);
    }
    expect(map[map.length - 1].endDay).toBe(28);
  });
});

describe('phaseForCycleDay', () => {
  it('classifies day 1 as menstrual', () => {
    expect(phaseForCycleDay(1, 28)).toBe(PHASES.MENSTRUAL);
  });

  it('classifies the final day as luteal', () => {
    expect(phaseForCycleDay(28, 28)).toBe(PHASES.LUTEAL);
    expect(phaseForCycleDay(35, 35)).toBe(PHASES.LUTEAL);
  });

  it('returns a valid phase for every day in every cycle length', () => {
    const valid = new Set(Object.values(PHASES));
    for (let len = 21; len <= 45; len++) {
      for (let day = 1; day <= len; day++) {
        expect(valid.has(phaseForCycleDay(day, len))).toBe(true);
      }
    }
  });
});
