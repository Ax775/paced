/**
 * entitlement.js — Pure subscription/entitlement logic for Paced.
 *
 * Business rules (set by the product owner):
 *   - Everyone gets a 60-day free trial of the full app, starting on first
 *     run. The trial is tracked locally so it works offline / without an
 *     account from day one.
 *   - After the trial, premium features require an active €3/mo
 *     subscription. Without it the app keeps working, but premium features
 *     are gated.
 *   - Premium features: Inzichten (insights/charts/badges), Partner-linking,
 *     and data export. Core cycle tracking, the Today view, and the logbook
 *     stay free forever.
 *
 * This module is intentionally free of React, storage, and network code so
 * it can be unit-tested in isolation. Persistence lives in storage.js; the
 * server-authoritative subscription record comes from Supabase.
 */

export const TRIAL_DAYS = 60;

/** Feature keys that require premium once the trial has ended. */
export const PREMIUM_FEATURES = ['insights', 'partner', 'export'];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function atMidnight(input) {
  const d = input instanceof Date ? new Date(input) : new Date(String(input));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole calendar days from `start` up to and including `now`'s date. */
function daysElapsed(start, now) {
  return Math.floor((atMidnight(now).getTime() - atMidnight(start).getTime()) / MS_PER_DAY);
}

/**
 * Resolve the user's current entitlement.
 *
 * @param {object}        opts
 * @param {string|Date}   [opts.trialStartedAt]  ISO/Date the local trial began
 * @param {object|null}   [opts.subscription]    server record:
 *        { status: 'active'|'trialing'|'past_due'|'canceled'|'none',
 *          currentPeriodEnd?: ISO }
 * @param {Date}          [opts.now]
 * @returns {{
 *   isPremium: boolean,
 *   status: 'active'|'trial'|'expired',
 *   source: 'subscription'|'trial',
 *   trialDaysLeft: number,
 * }}
 */
export function resolveEntitlement({ trialStartedAt, subscription, now = new Date() } = {}) {
  // 1. A paid (or Stripe-trialing) subscription always wins, provided it
  //    hasn't lapsed past its current period.
  if (subscription && (subscription.status === 'active' || subscription.status === 'trialing')) {
    const end = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
    if (!end || Number.isNaN(end.getTime()) || end.getTime() > now.getTime()) {
      return { isPremium: true, status: 'active', source: 'subscription', trialDaysLeft: 0 };
    }
  }

  // 2. Otherwise fall back to the local free trial.
  // A missing trial stamp is treated as "trial starts now" (full window) so
  // a not-yet-bootstrapped user is never wrongly downgraded.
  const elapsed = trialStartedAt ? daysElapsed(trialStartedAt, now) : 0;
  const trialDaysLeft = Math.max(0, TRIAL_DAYS - elapsed);

  if (trialDaysLeft > 0) {
    return { isPremium: true, status: 'trial', source: 'trial', trialDaysLeft };
  }
  return { isPremium: false, status: 'expired', source: 'trial', trialDaysLeft: 0 };
}

/** Is this feature behind the paywall at all? */
export function isPremiumFeature(featureKey) {
  return PREMIUM_FEATURES.includes(featureKey);
}

/**
 * Can the user use this feature right now? Free features are always usable;
 * premium features require an active/trial entitlement.
 */
export function canUseFeature(featureKey, entitlement) {
  if (!isPremiumFeature(featureKey)) return true;
  return !!entitlement?.isPremium;
}
