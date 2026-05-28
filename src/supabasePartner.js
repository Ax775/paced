/**
 * supabasePartner.js — Lazy Supabase client for the partner-linking feature.
 *
 * Keys are set in index.html as:
 *   window.PACED_SUPABASE_URL      = 'https://xxxx.supabase.co';
 *   window.PACED_SUPABASE_ANON_KEY = 'eyJ...';
 *
 * If not set, all async functions return { data: null, error: 'not_configured' }
 * and the app continues working without any partner features.
 *
 * Implementation note: @supabase/supabase-js is statically imported and
 * bundled by esbuild. Previously we did a runtime `await import()` from
 * esm.sh which (a) failed under the production CSP (`script-src 'self'`
 * + `connect-src 'self'`) and (b) added 1–2s cold-start latency on
 * mobile. Bundling adds ~35KB to dist/app.js but the feature actually
 * works now.
 */
import { createClient } from '@supabase/supabase-js';

let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;
  const url = window.PACED_SUPABASE_URL;
  const key = window.PACED_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

export function isConfigured() {
  return !!(window.PACED_SUPABASE_URL && window.PACED_SUPABASE_ANON_KEY);
}

export async function getCurrentUser() {
  const sb = await getSupabase();
  if (!sb) return null;
  try {
    const { data: { user } } = await sb.auth.getUser();
    return user;
  } catch { return null; }
}

export async function signInWithMagicLink(email, redirectTo) {
  const sb = await getSupabase();
  if (!sb) return { data: null, error: 'not_configured' };
  return sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo || window.location.origin },
  });
}

export async function signOut() {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  _supabase = null;
}

// Invite codes use cryptographically-strong randomness — Math.random()
// is predictable (V8's xorshift128+ state is recoverable from a few
// observed outputs) which matters even with our SECURITY DEFINER RPC
// because the entropy is the only secret protecting the invite. 12
// base-36 chars from 64 random bytes yields ~62 bits of entropy.
// Uppercase to match the migration 0002 invite_code expectations.
function randomCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const b of bytes) code += b.toString(36).padStart(2, '0');
  return code.slice(0, 12).toUpperCase();
}

export async function createInvite(shareLevel = 'phase') {
  const sb = await getSupabase();
  if (!sb) return { data: null, error: 'not_configured' };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { data: null, error: 'not_authenticated' };
  const code = randomCode();
  return sb.from('partner_links').insert({
    owner_user_id: user.id,
    invite_code: code,
    share_level: shareLevel,
    active: true,
  }).select().single();
}

export async function getMyLink() {
  const sb = await getSupabase();
  if (!sb) return { data: null, error: 'not_configured' };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { data: null, error: 'not_authenticated' };
  return sb.from('partner_links')
    .select('*')
    .eq('owner_user_id', user.id)
    .eq('active', true)
    .maybeSingle();
}

export async function deleteMyLink() {
  const sb = await getSupabase();
  if (!sb) return { data: null, error: 'not_configured' };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { data: null, error: 'not_authenticated' };
  return sb.from('partner_links')
    .update({ active: false })
    .eq('owner_user_id', user.id);
}

// Invite acceptance goes through the accept_partner_invite SECURITY DEFINER
// RPC (see migration 0002). The RPC performs the lookup + bind atomically
// server-side so the client never needs SELECT access to other users' rows.
// Returns one of: 'invite_invalid' | 'invite_already_used' | 'self_invite' |
// 'not_authenticated' | 'not_configured' | null (success).
export async function acceptInvite(code) {
  const sb = getSupabase();
  if (!sb) return { data: null, error: 'not_configured' };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { data: null, error: 'not_authenticated' };

  // Normalize: invite codes are uppercase base36 server-side. Trim handles
  // trailing whitespace from copy-paste; case-insensitive entry handles
  // users who type the code by hand.
  const normalized = (code || '').trim().toUpperCase();
  if (!normalized) return { data: null, error: 'invite_invalid' };

  const { data, error } = await sb.rpc('accept_partner_invite', { code: normalized });

  if (error) {
    // Map Postgres exception messages to stable client codes the UI can
    // branch on. The RPC raises with the literal strings below.
    const msg = error.message || '';
    if (msg.includes('invite_not_found'))       return { data: null, error: 'invite_invalid' };
    if (msg.includes('invite_already_accepted')) return { data: null, error: 'invite_already_used' };
    if (msg.includes('self_invite'))             return { data: null, error: 'self_invite' };
    if (msg.includes('not_authenticated'))       return { data: null, error: 'not_authenticated' };
    return { data: null, error: 'unknown' };
  }

  // RPC returns an array (return type is "table") — take the first row.
  return { data: data?.[0] ?? null, error: null };
}

export async function getPartnerSnapshot() {
  const sb = await getSupabase();
  if (!sb) return { data: null, error: 'not_configured' };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { data: null, error: 'not_authenticated' };
  const { data: link } = await sb.from('partner_links')
    .select('owner_user_id')
    .eq('partner_user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (!link) return { data: null, error: 'no_link' };
  return sb.from('partner_snapshots')
    .select('*')
    .eq('owner_user_id', link.owner_user_id)
    .maybeSingle();
}

export async function pushSnapshot(phase, cycleDay, shareLevel = 'phase', note = null) {
  const sb = await getSupabase();
  if (!sb) return { data: null, error: 'not_configured' };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { data: null, error: 'not_authenticated' };
  return sb.from('partner_snapshots').upsert({
    owner_user_id: user.id,
    phase,
    cycle_day: cycleDay,
    share_level: shareLevel,
    owner_note: note,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_user_id' });
}
