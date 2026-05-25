/**
 * supabasePartner.js — Lazy Supabase client for the partner-linking feature.
 *
 * Keys are set in index.html as:
 *   window.AURA_SUPABASE_URL      = 'https://xxxx.supabase.co';
 *   window.AURA_SUPABASE_ANON_KEY = 'eyJ...';
 *
 * If not set, all async functions return { data: null, error: 'not_configured' }
 * and the app continues working without any partner features.
 */

let _supabase = null;

async function getSupabase() {
  if (_supabase) return _supabase;
  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  _supabase = createClient(url, key);
  return _supabase;
}

export function isConfigured() {
  return !!(window.AURA_SUPABASE_URL && window.AURA_SUPABASE_ANON_KEY);
}

export async function getCurrentUser() {
  const sb = await getSupabase();
  if (!sb) return null;
  try {
    const { data: { user } } = await sb.auth.getUser();
    return user;
  } catch { return null; }
}

export async function signInWithMagicLink(email) {
  const sb = await getSupabase();
  if (!sb) return { data: null, error: 'not_configured' };
  return sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
}

export async function signOut() {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  _supabase = null;
}

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
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

export async function acceptInvite(code) {
  const sb = await getSupabase();
  if (!sb) return { data: null, error: 'not_configured' };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { data: null, error: 'not_authenticated' };
  return sb.from('partner_links')
    .update({ partner_user_id: user.id, accepted_at: new Date().toISOString() })
    .eq('invite_code', code)
    .eq('active', true)
    .is('partner_user_id', null);
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
