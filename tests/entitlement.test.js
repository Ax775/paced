import { describe, it, expect } from 'vitest';
import {
  TRIAL_DAYS,
  PREMIUM_FEATURES,
  resolveEntitlement,
  isPremiumFeature,
  canUseFeature,
} from '../src/lib/entitlement.js';

const iso = (daysAgo, base = new Date('2026-06-01T12:00:00')) => {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};
const NOW = new Date('2026-06-01T12:00:00');

describe('resolveEntitlement — trial', () => {
  it('grants full trial on day 0', () => {
    const e = resolveEntitlement({ trialStartedAt: iso(0), now: NOW });
    expect(e.isPremium).toBe(true);
    expect(e.status).toBe('trial');
    expect(e.trialDaysLeft).toBe(TRIAL_DAYS);
  });

  it('counts down through the trial', () => {
    const e = resolveEntitlement({ trialStartedAt: iso(10), now: NOW });
    expect(e.isPremium).toBe(true);
    expect(e.trialDaysLeft).toBe(TRIAL_DAYS - 10);
  });

  it('is still premium on the last trial day', () => {
    const e = resolveEntitlement({ trialStartedAt: iso(TRIAL_DAYS - 1), now: NOW });
    expect(e.isPremium).toBe(true);
    expect(e.trialDaysLeft).toBe(1);
  });

  it('expires to free once the trial window passes', () => {
    const e = resolveEntitlement({ trialStartedAt: iso(TRIAL_DAYS), now: NOW });
    expect(e.isPremium).toBe(false);
    expect(e.status).toBe('expired');
    expect(e.trialDaysLeft).toBe(0);
  });

  it('treats a missing trial stamp as a fresh full trial (never wrongly downgrades)', () => {
    const e = resolveEntitlement({ now: NOW });
    expect(e.isPremium).toBe(true);
    expect(e.trialDaysLeft).toBe(TRIAL_DAYS);
  });
});

describe('resolveEntitlement — subscription', () => {
  it('an active subscription is premium even after the trial expired', () => {
    const e = resolveEntitlement({
      trialStartedAt: iso(120), // long expired
      subscription: { status: 'active', currentPeriodEnd: iso(-30) }, // ends 30d in the future
      now: NOW,
    });
    expect(e.isPremium).toBe(true);
    expect(e.status).toBe('active');
    expect(e.source).toBe('subscription');
  });

  it('a Stripe-trialing subscription is premium', () => {
    const e = resolveEntitlement({
      trialStartedAt: iso(120),
      subscription: { status: 'trialing', currentPeriodEnd: iso(-30) },
      now: NOW,
    });
    expect(e.isPremium).toBe(true);
  });

  it('a lapsed active subscription (period end in the past) falls back to trial', () => {
    const e = resolveEntitlement({
      trialStartedAt: iso(120),
      subscription: { status: 'active', currentPeriodEnd: iso(5) }, // ended 5d ago
      now: NOW,
    });
    expect(e.isPremium).toBe(false);
    expect(e.source).toBe('trial');
  });

  it('a canceled subscription with trial still active stays premium via trial', () => {
    const e = resolveEntitlement({
      trialStartedAt: iso(3),
      subscription: { status: 'canceled' },
      now: NOW,
    });
    expect(e.isPremium).toBe(true);
    expect(e.source).toBe('trial');
  });

  it('past_due is not treated as premium', () => {
    const e = resolveEntitlement({
      trialStartedAt: iso(120),
      subscription: { status: 'past_due', currentPeriodEnd: iso(-30) },
      now: NOW,
    });
    expect(e.isPremium).toBe(false);
  });

  it('active with no period end is premium (open-ended)', () => {
    const e = resolveEntitlement({
      trialStartedAt: iso(120),
      subscription: { status: 'active' },
      now: NOW,
    });
    expect(e.isPremium).toBe(true);
  });
});

describe('feature gating', () => {
  it('marks the premium feature set correctly', () => {
    expect(PREMIUM_FEATURES).toEqual(expect.arrayContaining(['insights', 'partner', 'export']));
    expect(isPremiumFeature('insights')).toBe(true);
    expect(isPremiumFeature('partner')).toBe(true);
    expect(isPremiumFeature('export')).toBe(true);
    expect(isPremiumFeature('home')).toBe(false);
    expect(isPremiumFeature('logbook')).toBe(false);
  });

  it('free features are always usable regardless of entitlement', () => {
    const free = { isPremium: false };
    expect(canUseFeature('home', free)).toBe(true);
    expect(canUseFeature('logbook', free)).toBe(true);
  });

  it('premium features require an active/trial entitlement', () => {
    expect(canUseFeature('insights', { isPremium: true })).toBe(true);
    expect(canUseFeature('insights', { isPremium: false })).toBe(false);
    expect(canUseFeature('partner', null)).toBe(false);
  });
});
