/**
 * supabaseSubscription.js — Stripe-backed subscription client (web).
 *
 * Flow:
 *   1. The 60-day trial is local (see entitlement.js) — no network needed.
 *   2. To subscribe, the user must be logged in (we reuse the same Supabase
 *      magic-link auth as the partner feature). `startCheckout` calls a
 *      Supabase Edge Function that creates a Stripe Checkout Session and
 *      returns its URL; we redirect the browser there.
 *   3. Stripe's webhook (another Edge Function) writes the authoritative
 *      row into the `subscriptions` table. `fetchSubscription` reads it
 *      back (RLS: a user can only read their own row).
 *
 * NOTE: This is the WEB payment path only. The iOS App Store build must use
 * Apple In-App Purchase for the same subscription (Guideline 3.1.1) — that
 * is a separate integration, deliberately not handled here.
 *
 * If Supabase isn't configured, every function degrades to a safe no-op so
 * the rest of the app keeps working.
 */
import { getSupabase, isConfigured, getCurrentUser } from './supabasePartner.js';

export { isConfigured };

/**
 * Read the current user's subscription row from Supabase.
 * @returns {Promise<{data: object|null, error: string|null}>}
 *   data shape: { status, current_period_end, ... } or null if none.
 */
export async function fetchSubscription() {
  const sb = getSupabase();
  if (!sb) return { data: null, error: 'not_configured' };
  const user = await getCurrentUser();
  if (!user) return { data: null, error: 'not_authenticated' };

  const { data, error } = await sb
    .from('subscriptions')
    .select('status, current_period_end, stripe_subscription_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return { data: null, error: error.message || 'fetch_failed' };
  if (!data) return { data: null, error: null };

  // Normalise to the camelCase shape entitlement.js expects.
  return {
    data: {
      status: data.status,
      currentPeriodEnd: data.current_period_end,
      stripeSubscriptionId: data.stripe_subscription_id,
    },
    error: null,
  };
}

/**
 * Begin Stripe Checkout for the €3/mo plan. Requires a logged-in user.
 * `trialDaysLeft` is forwarded so the Edge Function can set Stripe's
 * `trial_period_days`, honouring whatever is left of the local free trial
 * (so a day-3 subscriber isn't charged until day 60).
 *
 * On success this redirects the browser and never returns; on failure it
 * returns an error code the caller can surface.
 */
export async function startCheckout({ trialDaysLeft = 0 } = {}) {
  const sb = getSupabase();
  if (!sb) return { error: 'not_configured' };
  const user = await getCurrentUser();
  if (!user) return { error: 'not_authenticated' };

  const { data, error } = await sb.functions.invoke('create-checkout-session', {
    body: {
      trialDaysLeft,
      returnUrl: `${window.location.origin}/?checkout=done`,
      cancelUrl: `${window.location.origin}/?checkout=cancelled`,
    },
  });

  if (error) return { error: error.message || 'checkout_failed' };
  if (!data?.url) return { error: 'no_checkout_url' };

  window.location.href = data.url;
  return { error: null };
}

/**
 * Open the Stripe customer billing portal (manage/cancel subscription).
 * Requires a logged-in user with an existing Stripe customer.
 */
export async function openBillingPortal() {
  const sb = getSupabase();
  if (!sb) return { error: 'not_configured' };
  const user = await getCurrentUser();
  if (!user) return { error: 'not_authenticated' };

  const { data, error } = await sb.functions.invoke('create-billing-portal', {
    body: { returnUrl: `${window.location.origin}/?tab=settings` },
  });

  if (error) return { error: error.message || 'portal_failed' };
  if (!data?.url) return { error: 'no_portal_url' };

  window.location.href = data.url;
  return { error: null };
}
