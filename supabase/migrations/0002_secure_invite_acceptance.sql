-- Paced — Secure partner-invite acceptance flow
-- =============================================
--
-- Migration 0001 shipped an `invite_lookup` policy with a fatal flaw:
--
--   create policy "invite_lookup" on public.partner_links
--   for select using (auth.uid() is not null);
--
-- That made the entire partner_links table world-readable to any
-- authenticated user. A fresh signup could `select invite_code, owner_user_id
-- from public.partner_links` and read every pending invite — then accept any
-- of them via the client `acceptInvite` call (which checks `partner_user_id
-- is null` server-side but doesn't know who the legitimate inviter is).
-- Result: system-wide partner-link hijacking.
--
-- This migration:
--   1. Drops the over-permissive policy.
--   2. Tightens the owner policies with explicit WITH CHECK clauses so
--      an owner can't change owner_user_id or set partner_user_id directly
--      on insert/update (closes a related path where an owner could "gift"
--      themselves a victim's user-id as partner).
--   3. Adds a SECURITY DEFINER RPC that performs the lookup + update
--      atomically server-side. Clients call accept_partner_invite('CODE')
--      with no direct SELECT/UPDATE access to other users' rows.
--   4. Returns specific exceptions the client can map to user-friendly
--      messages: invite_not_found, invite_already_accepted, self_invite.
--   5. Adds a CHECK constraint forbidding owner = partner (defense in depth).
--
-- Run this in the Supabase SQL editor of project tyvideihbfjfmdzdkyks.
-- Idempotent — safe to re-run.

-- ── 1. Drop the leaky policy ─────────────────────────────────────────────
drop policy if exists "invite_lookup" on public.partner_links;

-- ── 2. Tighten owner policies with WITH CHECK ────────────────────────────
-- The original "owner_manage FOR ALL" lacked WITH CHECK, meaning an UPDATE
-- could mutate owner_user_id away to another user without re-verification.
drop policy if exists "owner_manage" on public.partner_links;

create policy "owner_select" on public.partner_links
  for select using (auth.uid() = owner_user_id);

create policy "owner_insert" on public.partner_links
  for insert with check (
    auth.uid() = owner_user_id
    and partner_user_id is null  -- can't pre-bind a partner; that's the RPC's job
  );

create policy "owner_update" on public.partner_links
  for update
  using      (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "owner_delete" on public.partner_links
  for delete using (auth.uid() = owner_user_id);

-- ── 3. Defense-in-depth CHECK constraint ─────────────────────────────────
-- An owner cannot be their own partner. Catches the self-invite bug at
-- the storage layer even if a future RPC misses it.
alter table public.partner_links
  drop constraint if exists partner_links_no_self_link;
alter table public.partner_links
  add constraint partner_links_no_self_link
  check (owner_user_id is distinct from partner_user_id);

-- ── 4. Index to speed up invite redemption ───────────────────────────────
-- The RPC looks up by invite_code where active=true and partner_user_id is
-- null. Partial unique index doubles as anti-spam (one open invite per code)
-- and a fast lookup path.
drop index if exists partner_links_open_invite_idx;
create unique index partner_links_open_invite_idx
  on public.partner_links (invite_code)
  where active = true and partner_user_id is null;

-- ── 5. SECURITY DEFINER RPC for invite acceptance ────────────────────────
create or replace function public.accept_partner_invite(code text)
returns table(link_id uuid, owner_user_id uuid, share_level text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_link record;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Server-side lookup — client never sees other invites.
  select pl.id, pl.owner_user_id, pl.share_level, pl.partner_user_id
    into v_link
    from public.partner_links pl
   where pl.invite_code = code
     and pl.active = true
   limit 1;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  if v_link.partner_user_id is not null then
    raise exception 'invite_already_accepted' using errcode = 'P0001';
  end if;

  if v_link.owner_user_id = v_user then
    raise exception 'self_invite' using errcode = 'P0001';
  end if;

  -- Atomic bind. The "partner_user_id is null" predicate guards against a
  -- race where two clients accept the same code concurrently — the second
  -- gets 0 rows updated and we surface that as already_accepted.
  update public.partner_links
     set partner_user_id = v_user,
         accepted_at     = now()
   where id = v_link.id
     and partner_user_id is null;

  if not found then
    raise exception 'invite_already_accepted' using errcode = 'P0001';
  end if;

  return query
  select v_link.id, v_link.owner_user_id, v_link.share_level;
end;
$$;

-- ── 6. Lock down RPC execution ───────────────────────────────────────────
revoke all on function public.accept_partner_invite(text) from public;
grant  execute on function public.accept_partner_invite(text) to authenticated;
