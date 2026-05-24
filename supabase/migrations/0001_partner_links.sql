-- Partner linking feature
-- Run this migration in your Supabase project's SQL editor.

create table public.partner_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users not null,
  partner_user_id uuid references auth.users,
  invite_code text unique not null,
  share_level text not null default 'phase',
  active boolean not null default true,
  created_at timestamptz default now(),
  accepted_at timestamptz
);
alter table public.partner_links enable row level security;
create policy "owner_manage" on public.partner_links for all using (auth.uid() = owner_user_id);
create policy "partner_read" on public.partner_links for select using (auth.uid() = partner_user_id);
create policy "invite_lookup" on public.partner_links for select using (auth.uid() is not null);

create table public.partner_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users not null unique,
  phase text not null,
  cycle_day int,
  share_level text not null default 'phase',
  owner_note text,
  updated_at timestamptz default now()
);
alter table public.partner_snapshots enable row level security;
create policy "owner_snapshot" on public.partner_snapshots for all using (auth.uid() = owner_user_id);
create policy "partner_snapshot_read" on public.partner_snapshots for select using (
  exists (
    select 1 from public.partner_links pl
    where pl.owner_user_id = partner_snapshots.owner_user_id
      and pl.partner_user_id = auth.uid()
      and pl.active = true
  )
);
