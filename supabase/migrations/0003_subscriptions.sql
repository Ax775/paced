-- Paced — Subscriptions (Stripe-backed, web payment path)
-- ========================================================
--
-- One row per user holding their authoritative subscription state. Only
-- the Stripe webhook (running with the service-role key) ever writes here;
-- clients may read their OWN row via RLS. The app's entitlement resolver
-- reads `status` + `current_period_end`.
--
-- Run in the Supabase SQL editor of project tyvideihbfjfmdzdkyks.
-- Idempotent — safe to re-run.

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users on delete cascade,
  status                 text not null default 'none',
    -- none | trialing | active | past_due | canceled | unpaid | incomplete
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Users can read only their own subscription. No client INSERT/UPDATE/DELETE
-- policies exist, so the anon/auth key cannot forge entitlement — only the
-- service-role webhook (which bypasses RLS) writes.
drop policy if exists "own_subscription_read" on public.subscriptions;
create policy "own_subscription_read" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Fast lookup from the webhook by Stripe ids.
create index if not exists subscriptions_stripe_customer_idx
  on public.subscriptions (stripe_customer_id);
create index if not exists subscriptions_stripe_subscription_idx
  on public.subscriptions (stripe_subscription_id);
