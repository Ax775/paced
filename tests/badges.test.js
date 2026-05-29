import { describe, it, expect } from 'vitest';
import { BADGES, computeBadges, countEarnedBadges, nextBadge } from '../src/lib/badges.js';

describe('computeBadges', () => {
  it('returns one entry per defined badge', () => {
    const result = computeBadges({});
    expect(result).toHaveLength(BADGES.length);
  });

  it('earns nothing on an empty profile', () => {
    const result = computeBadges({});
    expect(result.every(b => !b.earned)).toBe(true);
    expect(result.every(b => b.progress === 0)).toBe(true);
  });

  it('earns the first_log badge after a single logged day', () => {
    const result = computeBadges({ total: 1 });
    const first = result.find(b => b.id === 'first_log');
    expect(first.earned).toBe(true);
    expect(first.progress).toBe(1);
  });

  it('earns streak badges up to the best run, but not beyond', () => {
    const result = computeBadges({ streak: 7 });
    const byId = Object.fromEntries(result.map(b => [b.id, b]));
    expect(byId.streak_3.earned).toBe(true);
    expect(byId.streak_7.earned).toBe(true);
    expect(byId.streak_14.earned).toBe(false);
    expect(byId.streak_30.earned).toBe(false);
  });

  it('reports clamped fractional progress toward a locked badge', () => {
    const result = computeBadges({ streak: 7 });
    const next = result.find(b => b.id === 'streak_14');
    expect(next.earned).toBe(false);
    expect(next.current).toBe(7);
    expect(next.progress).toBeCloseTo(0.5, 5); // 7/14
  });

  it('treats missing / non-finite / negative metrics as zero', () => {
    const result = computeBadges({ streak: -5, total: NaN, cycles: undefined });
    expect(result.every(b => !b.earned)).toBe(true);
  });

  it('keeps a badge earned even if the current streak later drops (uses best)', () => {
    // The caller passes the *best* run as `streak`, so a reset current
    // streak never revokes an earned badge.
    const result = computeBadges({ streak: 30 });
    expect(result.find(b => b.id === 'streak_30').earned).toBe(true);
  });

  it('earns cycle badges independently of streak/total', () => {
    const result = computeBadges({ cycles: 3 });
    expect(result.find(b => b.id === 'cycles_3').earned).toBe(true);
    expect(result.find(b => b.id === 'cycles_12').earned).toBe(false);
    expect(result.find(b => b.id === 'streak_3').earned).toBe(false);
  });
});

describe('countEarnedBadges', () => {
  it('counts the earned subset', () => {
    // total:1 → first_log; streak:7 → streak_3 + streak_7
    expect(countEarnedBadges({ total: 1, streak: 7 })).toBe(3);
  });

  it('is zero for an empty profile', () => {
    expect(countEarnedBadges({})).toBe(0);
  });
});

describe('nextBadge', () => {
  it('returns the locked badge closest to completion', () => {
    // streak 7: streak_14 is 7/14 (0.5), the closest locked streak badge.
    const next = nextBadge({ streak: 7, total: 1 });
    expect(next).not.toBeNull();
    expect(next.earned).toBe(false);
    expect(next.id).toBe('streak_14');
  });

  it('returns null when everything is unlocked', () => {
    const maxed = { streak: 1000, total: 1000, cycles: 1000 };
    expect(nextBadge(maxed)).toBeNull();
  });
});
