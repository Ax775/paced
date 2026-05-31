// Supabase Edge Function: stripe-webhook
// ========================================
// Receives Stripe subscription lifecycle events and upserts the
// authoritative row into public.subscriptions (service-role → bypasses
// RLS). This is the ONLY writer of that table.
//
// Verifies the Stripe signature against STRIPE_WEBHOOK_SECRET — never trust
// an unverified webhook body.
//
// Required secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET      whsec_…  (from the Stripe webhook endpoint)
//   SUPABASE_URL               (auto)
//   SUPABASE_SERVICE_ROLE_KEY  (auto)
//
// Deploy with signature verification intact and JWT check disabled (Stripe
// can't send a Supabase JWT):
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// Then in the Stripe dashboard add a webhook endpoint pointing at this
// function URL, subscribed to:
//   checkout.session.completed
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted

import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, secret);
  } catch (e) {
    console.error('Webhook signature verification failed:', e);
    return new Response('bad signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(event);
        break;
      }
      default:
        // Ignore unrelated events.
        break;
    }
  } catch (e) {
    console.error('Webhook handler error:', e);
    return new Response('handler error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});

async function syncSubscription(event: Stripe.Event) {
  // Resolve the Stripe subscription object regardless of event shape.
  let sub: Stripe.Subscription | null = null;

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.subscription) {
      sub = await stripe.subscriptions.retrieve(String(session.subscription));
    }
  } else {
    sub = event.data.object as Stripe.Subscription;
  }
  if (!sub) return;

  // Map back to the Supabase user: prefer subscription metadata, fall back
  // to the customer's metadata.
  let userId = sub.metadata?.supabase_user_id ?? null;
  if (!userId && sub.customer) {
    const customer = await stripe.customers.retrieve(String(sub.customer));
    if (customer && !('deleted' in customer && customer.deleted)) {
      userId = (customer as Stripe.Customer).metadata?.supabase_user_id ?? null;
    }
  }
  if (!userId) {
    console.warn('No supabase_user_id on subscription', sub.id);
    return;
  }

  const row = {
    user_id: userId,
    status: sub.status, // active | trialing | past_due | canceled | ...
    stripe_customer_id: String(sub.customer),
    stripe_subscription_id: sub.id,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from('subscriptions')
    .upsert(row, { onConflict: 'user_id' });

  if (error) console.error('Upsert failed:', error);
}
