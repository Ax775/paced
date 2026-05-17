/**
 * Tests for src/lib/premium.js — trial / license / paywall gating.
 *
 * Bewust scherp: een bug hier raakt direct of (a) betalende gebruikers
 * verliezen toegang of (b) gratis gebruikers krijgen onbedoeld
 * premium — beide ongewenst.
 */
import { describe, it, expect } from 'vitest';
import {
  TRIAL_DAYS,
  daysSinceFirstLaunch,
  isInTrial,
  trialDaysRemaining,
  verifyLicenseSignature,
  hasValidLicense,
  isPremium,
  premiumStatus,
  canAccessTab,
} from '../src/lib/premium.js';

const day = (offset, base = '2026-05-15T12:00:00Z') => {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d;
};

/* ──────────────────────────  daysSinceFirstLaunch  ─────────────────── */

describe('daysSinceFirstLaunch', () => {
  it('returns 0 when firstLaunchAt is missing', () => {
    expect(daysSinceFirstLaunch({})).toBe(0);
    expect(daysSinceFirstLaunch(null)).toBe(0);
  });

  it('returns 0 wanneer firstLaunchAt invalid', () => {
    expect(daysSinceFirstLaunch({ firstLaunchAt: 'niet-een-datum' })).toBe(0);
  });

  it('returns 0 op de dag zelf', () => {
    const start = day(0);
    expect(daysSinceFirstLaunch({ firstLaunchAt: start.toISOString() }, start)).toBe(0);
  });

  it('telt hele dagen vooruit', () => {
    const start = day(0);
    expect(daysSinceFirstLaunch({ firstLaunchAt: start.toISOString() }, day(7))).toBe(7);
    expect(daysSinceFirstLaunch({ firstLaunchAt: start.toISOString() }, day(30))).toBe(30);
  });

  it('clipt negatieve diff op 0 (clock-skew)', () => {
    const start = day(5);
    expect(daysSinceFirstLaunch({ firstLaunchAt: start.toISOString() }, day(0))).toBe(0);
  });
});

/* ─────────────────────────────  Trial  ─────────────────────────────── */

describe('isInTrial', () => {
  it('false zonder firstLaunchAt — onboarding/consent-gate is verantwoordelijk', () => {
    expect(isInTrial({})).toBe(false);
  });

  it('true op dag 0', () => {
    const start = day(0);
    expect(isInTrial({ firstLaunchAt: start.toISOString() }, start)).toBe(true);
  });

  it('true op dag 29 (laatste trial-dag, < TRIAL_DAYS)', () => {
    const start = day(0);
    expect(isInTrial({ firstLaunchAt: start.toISOString() }, day(29))).toBe(true);
  });

  it('false vanaf dag 30 (trial verlopen)', () => {
    const start = day(0);
    expect(isInTrial({ firstLaunchAt: start.toISOString() }, day(30))).toBe(false);
    expect(isInTrial({ firstLaunchAt: start.toISOString() }, day(60))).toBe(false);
  });

  it('TRIAL_DAYS exporteert 30', () => {
    expect(TRIAL_DAYS).toBe(30);
  });
});

describe('trialDaysRemaining', () => {
  it('0 zonder firstLaunchAt', () => {
    expect(trialDaysRemaining({})).toBe(0);
  });

  it('30 op dag 0', () => {
    const start = day(0);
    expect(trialDaysRemaining({ firstLaunchAt: start.toISOString() }, start)).toBe(30);
  });

  it('1 op dag 29', () => {
    const start = day(0);
    expect(trialDaysRemaining({ firstLaunchAt: start.toISOString() }, day(29))).toBe(1);
  });

  it('0 vanaf dag 30', () => {
    const start = day(0);
    expect(trialDaysRemaining({ firstLaunchAt: start.toISOString() }, day(30))).toBe(0);
    expect(trialDaysRemaining({ firstLaunchAt: start.toISOString() }, day(100))).toBe(0);
  });
});

/* ─────────────────────────────  License  ───────────────────────────── */

describe('verifyLicenseSignature (stub)', () => {
  it('accepteert geldige format', () => {
    expect(verifyLicenseSignature('AURA-PREMIUM-ABCDEFGHIJKL')).toBe(true);
    expect(verifyLicenseSignature('AURA-PREMIUM-Z9Y8X7W6V5U4T3S2R1Q0')).toBe(true);
  });

  it('case-insensitive (normaliseert naar uppercase)', () => {
    expect(verifyLicenseSignature('aura-premium-abcdefghijkl')).toBe(true);
    expect(verifyLicenseSignature('  AURA-PREMIUM-ABCDEFGHIJKL  ')).toBe(true);
  });

  it('weigert te korte body (< 12 chars)', () => {
    expect(verifyLicenseSignature('AURA-PREMIUM-SHORT')).toBe(false);
    expect(verifyLicenseSignature('AURA-PREMIUM-ABCDEFGHIJK')).toBe(false); // 11 chars
  });

  it('weigert verkeerde prefix', () => {
    expect(verifyLicenseSignature('AURA-FREE-ABCDEFGHIJKL')).toBe(false);
    expect(verifyLicenseSignature('PREMIUM-ABCDEFGHIJKL')).toBe(false);
    expect(verifyLicenseSignature('ABCDEFGHIJKL')).toBe(false);
  });

  it('weigert non-strings', () => {
    expect(verifyLicenseSignature(null)).toBe(false);
    expect(verifyLicenseSignature(undefined)).toBe(false);
    expect(verifyLicenseSignature(12345)).toBe(false);
    expect(verifyLicenseSignature({ key: 'AURA-PREMIUM-ABCDEFGHIJKL' })).toBe(false);
  });
});

describe('hasValidLicense', () => {
  const goodKey = 'AURA-PREMIUM-ABCDEFGHIJKL';

  it('false zonder license object', () => {
    expect(hasValidLicense({})).toBe(false);
    expect(hasValidLicense({ license: null })).toBe(false);
  });

  it('false bij key zonder geldige signatuur', () => {
    expect(hasValidLicense({ license: { key: 'bogus' } })).toBe(false);
  });

  it('true bij geldige key zonder exp (lifetime)', () => {
    expect(hasValidLicense({ license: { key: goodKey } })).toBe(true);
  });

  it('true bij geldige key + exp in toekomst', () => {
    const future = new Date('2099-01-01').toISOString();
    expect(hasValidLicense({ license: { key: goodKey, exp: future } })).toBe(true);
  });

  it('false bij geldige key + exp in verleden', () => {
    const past = new Date('2020-01-01').toISOString();
    expect(hasValidLicense({ license: { key: goodKey, exp: past } })).toBe(false);
  });

  it('false bij invalide exp datum', () => {
    expect(hasValidLicense({ license: { key: goodKey, exp: 'niet-een-datum' } })).toBe(false);
  });
});

/* ────────────────────────────  isPremium  ──────────────────────────── */

describe('isPremium', () => {
  const goodKey = 'AURA-PREMIUM-ABCDEFGHIJKL';

  it('false zonder profile', () => {
    expect(isPremium(null)).toBe(false);
  });

  it('true in trial', () => {
    const start = day(0);
    expect(isPremium({ firstLaunchAt: start.toISOString() }, day(10))).toBe(true);
  });

  it('true met geldige license, ook na trial', () => {
    const start = day(0);
    expect(isPremium({
      firstLaunchAt: start.toISOString(),
      license: { key: goodKey },
    }, day(100))).toBe(true);
  });

  it('false na trial + zonder license', () => {
    const start = day(0);
    expect(isPremium({ firstLaunchAt: start.toISOString() }, day(31))).toBe(false);
  });
});

/* ────────────────────────  premiumStatus enum  ─────────────────────── */

describe('premiumStatus', () => {
  const goodKey = 'AURA-PREMIUM-ABCDEFGHIJKL';

  it('"unconfigured" zonder profile', () => {
    expect(premiumStatus(null)).toBe('unconfigured');
  });

  it('"premium" als license geldig', () => {
    expect(premiumStatus({ license: { key: goodKey } })).toBe('premium');
  });

  it('"trial" als geen license maar in trial', () => {
    const start = day(0);
    expect(premiumStatus({ firstLaunchAt: start.toISOString() }, day(10))).toBe('trial');
  });

  it('"basic" als trial verlopen + geen license', () => {
    const start = day(0);
    expect(premiumStatus({ firstLaunchAt: start.toISOString() }, day(31))).toBe('basic');
  });

  it('"premium" wint van trial (geen flicker bij upgrade tijdens trial)', () => {
    const start = day(0);
    expect(premiumStatus({
      firstLaunchAt: start.toISOString(),
      license: { key: goodKey },
    }, day(5))).toBe('premium');
  });
});

/* ────────────────────────────  canAccessTab  ───────────────────────── */

describe('canAccessTab', () => {
  it('basic-user heeft alleen home/settings/legal', () => {
    const basic = { firstLaunchAt: day(-100).toISOString() }; // 100 dagen geleden, geen license
    expect(canAccessTab('home',     basic)).toBe(true);
    expect(canAccessTab('settings', basic)).toBe(true);
    expect(canAccessTab('legal',    basic)).toBe(true);
    expect(canAccessTab('voeding',  basic)).toBe(false);
    expect(canAccessTab('logboek',  basic)).toBe(false);
    expect(canAccessTab('stats',    basic)).toBe(false);
    expect(canAccessTab('charts',   basic)).toBe(false);
  });

  it('trial-user heeft alle tabs', () => {
    const trial = { firstLaunchAt: day(-5).toISOString() };
    for (const tab of ['home', 'voeding', 'logboek', 'stats', 'charts', 'settings', 'legal']) {
      expect(canAccessTab(tab, trial)).toBe(true);
    }
  });

  it('premium-user heeft alle tabs', () => {
    const premium = {
      firstLaunchAt: day(-100).toISOString(),
      license: { key: 'AURA-PREMIUM-ABCDEFGHIJKL' },
    };
    for (const tab of ['home', 'voeding', 'logboek', 'stats', 'charts', 'settings', 'legal']) {
      expect(canAccessTab(tab, premium)).toBe(true);
    }
  });
});
