# Paced — Payments setup (Stripe, web)

This wires up the €3/mo subscription for the **web** app (paced.nl). The
60-day free trial works without any of this — it's local. You only need
this to take real payments.

> ⚠️ **App Store note.** This is the WEB path. When the iOS app ships, Apple
> Guideline 3.1.1 requires the same subscription to go through Apple
> In-App Purchase — Stripe cannot unlock features inside the iOS build.
> That's a separate integration (StoreKit / RevenueCat). See the bottom.

## How it fits together

```
User taps "Abonneer"  →  src/supabaseSubscription.js (startCheckout)
                       →  Edge Function create-checkout-session
                       →  Stripe Checkout (hosted page, iDEAL/card)
                       →  back to paced.nl/?checkout=done
Stripe events          →  Edge Function stripe-webhook
                       →  public.subscriptions row (authoritative)
App entitlement        →  reads that row + the local trial
```

The 60-day local trial is forwarded as Stripe `trial_period_days`, so
someone who subscribes on day 3 isn't charged until day 60.

## 1. Database

Run `supabase/migrations/0003_subscriptions.sql` in the Supabase SQL editor
(project `tyvideihbfjfmdzdkyks`). Creates `public.subscriptions` with RLS:
users read only their own row; only the service-role webhook writes.

## 2. Stripe product + price

1. Stripe Dashboard → **Product catalogue** → add product "Paced Premium".
2. Add a **recurring** price: €3.00 / month. Copy the price id (`price_…`).
3. Stripe Dashboard → **Customer portal** → activate it (enables cancel/manage).

## 3. Supabase secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_PRICE_ID=price_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx   # from step 5
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
```

## 4. Deploy the Edge Functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy create-billing-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```

`--no-verify-jwt` on the webhook only — Stripe can't send a Supabase JWT;
it's authenticated by the Stripe signature instead.

## 5. Stripe webhook endpoint

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. URL: `https://tyvideihbfjfmdzdkyks.functions.supabase.co/stripe-webhook`
3. Events to send:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the signing secret (`whsec_…`) → set it as `STRIPE_WEBHOOK_SECRET`
   (step 3) and redeploy the webhook function.

## 6. CSP

Already handled: `_headers` allows `https://*.supabase.co` in `connect-src`,
which covers the `*.functions.supabase.co` calls. Stripe Checkout is a
full-page redirect (not an iframe), so no CSP change is needed for Stripe
itself.

## 7. Test

1. Use Stripe **test mode** keys first.
2. On paced.nl → Profiel → Abonnement → Upgraden → log in (magic link) →
   Abonneer → complete checkout with test card `4242 4242 4242 4242`.
3. Back on paced.nl the `subscriptions` row should appear within a few
   seconds (the client refreshes on `?checkout=done`); the Profiel card
   flips to "Premium actief".
4. Verify the webhook deliveries are 200 in the Stripe dashboard.
5. Switch to live keys when happy.

## Verifying the local trial / gating without Stripe

- Fresh browser → full access, dashboard shows "Nog 60 dagen gratis proef".
- To simulate expiry in dev: in the console set
  `localStorage.setItem('paced.trial', JSON.stringify({ startedAt: '2020-01-01' }))`
  then reload → Insights/Partner/Export show the locked state + upgrade CTA.

## iOS (later) — Apple In-App Purchase

For the App Store build the same Premium entitlement must be sold via Apple
IAP. Options:
- **RevenueCat** — one SDK that brokers both Apple IAP and Stripe, and can
  write entitlement back to Supabase via webhook. Lowest long-term effort
  for cross-platform.
- **StoreKit 2 directly** in the Capacitor iOS shell + a receipt-validation
  function that writes the same `subscriptions` row.

The `entitlement.js` resolver is provider-agnostic — whichever path writes a
valid `subscriptions` row (or a future `apple` source) unlocks Premium with
no client changes.
