// Supabase Edge Function: create-checkout-session
// =================================================
// Creates a Stripe Checkout Session for the Paced €3/mo plan and returns
// its URL. The browser is redirected there by the client
// (src/supabaseSubscription.js → startCheckout).
//
// Auth: requires a logged-in Supabase user (JWT in the Authorization
// header — Supabase passes it through). We derive the user from the JWT,
// look up or create the matching Stripe customer, and stamp the user id in
// the subscription metadata so the webhook can map it back.
//
// The remaining local-trial days are forwarded as `trial_period_days`, so a
// user who subscribes on day 3 of her 60-day trial isn't charged until the
// trial would have ended.
//
// Required secrets (supabase secrets set ...):
//   STRIPE_SECRET_KEY        sk_live_… / sk_test_…
//   STRIPE_PRICE_ID          price_…  (the €3/mo recurring price)
//   SUPABASE_URL             (auto-provided)
//   SUPABASE_SERVICE_ROLE_KEY (auto-provided)
//
// Deploy: supabase functions deploy create-checkout-session

import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'not_authenticated' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const trialDaysLeft = Math.max(0, Math.min(60, Number(body.trialDaysLeft) || 0));
    const returnUrl = String(body.returnUrl ?? '');
    const cancelUrl = String(body.cancelUrl ?? returnUrl);

    // Re-use an existing Stripe customer for this user if we have one.
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID')!, quantity: 1 }],
      subscription_data: {
        ...(trialDaysLeft > 0 ? { trial_period_days: trialDaysLeft } : {}),
        metadata: { supabase_user_id: user.id },
      },
      success_url: returnUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    });

    return json({ url: session.url }, 200);
  } catch (e) {
    console.error('create-checkout-session error:', e);
    return json({ error: 'checkout_failed' }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
