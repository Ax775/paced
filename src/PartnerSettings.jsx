/**
 * PartnerSettings.jsx — Partner-linking UI for the settings screen.
 *
 * Shows in SettingsScreen if window.AURA_SUPABASE_URL is configured.
 * Handles: magic-link login, invite creation, link management, share level.
 *
 * Props:
 *   currentPhase  — string  e.g. 'follicular'
 *   cycleDay      — number  e.g. 12
 */

import React, { useEffect, useState } from 'react';
import { Link2, Copy, Check, LogOut, Unlink } from 'lucide-react';
import {
  isConfigured,
  getCurrentUser,
  signInWithMagicLink,
  signOut,
  createInvite,
  getMyLink,
  deleteMyLink,
  pushSnapshot,
} from './supabasePartner.js';

const SHARE_LEVELS = [
  { id: 'phase',      label: 'Fase',             hint: 'Alleen "Rustweek", "Energieke periode", etc.' },
  { id: 'phase+day',  label: 'Fase + dag',        hint: 'Fase én dag van de cyclus zichtbaar.' },
];

export default function PartnerSettings({ currentPhase, cycleDay }) {
  const [loading,    setLoading]    = useState(true);
  const [user,       setUser]       = useState(null);
  const [link,       setLink]       = useState(null);
  const [email,      setEmail]      = useState('');
  const [emailSent,  setEmailSent]  = useState(false);
  const [shareLevel, setShareLevel] = useState('phase');
  const [copied,     setCopied]     = useState(false);
  const [status,     setStatus]     = useState('');

  const configured = isConfigured();

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const u = await getCurrentUser();
      if (cancelled) return;
      setUser(u);
      if (u) {
        const { data } = await getMyLink();
        if (!cancelled) {
          setLink(data);
          setShareLevel(data?.share_level ?? 'phase');
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [configured]);

  const handleMagicLink = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('Bezig…');
    const { error } = await signInWithMagicLink(email.trim());
    if (error && error !== 'not_configured') {
      setStatus('Er ging iets mis. Probeer opnieuw.');
    } else {
      setEmailSent(true);
      setStatus('');
    }
  };

  const handleCreateInvite = async () => {
    setStatus('Uitnodiging aanmaken…');
    const { data, error } = await createInvite(shareLevel);
    if (error || !data) {
      setStatus('Kon uitnodiging niet aanmaken.');
      return;
    }
    setLink(data);
    setStatus('');
    // Push a fresh snapshot so the partner gets data right away.
    if (currentPhase) await pushSnapshot(currentPhase, cycleDay, shareLevel);
  };

  const handleUnlink = async () => {
    setStatus('Ontkoppelen…');
    await deleteMyLink();
    setLink(null);
    setStatus('');
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setLink(null);
    setEmailSent(false);
    setEmail('');
  };

  const handleShareLevelChange = async (lvl) => {
    setShareLevel(lvl);
    if (currentPhase) await pushSnapshot(currentPhase, cycleDay, lvl);
  };

  const handleCopy = () => {
    const url = `${window.location.origin}/?invite=${link.invite_code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Not configured ──────────────────────────────────────────────────
  if (!configured) return null;

  // ── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Partner</div>
        <p className="text-sm text-ink-400">Laden…</p>
      </div>
    );
  }

  const inviteUrl = link ? `${window.location.origin}/?invite=${link.invite_code}` : '';

  return (
    <div className="p-6">
      <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">Partner</div>

      {/* Not logged in */}
      {!user && !emailSent && (
        <form onSubmit={handleMagicLink}>
          <p className="text-sm text-ink-500 leading-relaxed mb-4">
            Log in met een magic link om je partner toegang te geven tot je fasenoverzicht.
          </p>
          <input
            type="email"
            required
            placeholder="jouw@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-cream-200 bg-cream-50 px-4 py-2.5 text-sm
                       text-ink-700 placeholder-ink-400 focus:outline-none focus:border-sage-300
                       focus:ring-2 focus:ring-sage-200 transition mb-3"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-sage-500 text-cream-50 py-3 text-sm font-medium
                       hover:bg-sage-600 active:scale-[0.98] transition"
          >
            Stuur magic link
          </button>
          {status && <p className="text-xs text-ink-400 mt-2 text-center">{status}</p>}
        </form>
      )}

      {/* Magic link sent */}
      {!user && emailSent && (
        <div className="text-center py-4">
          <div className="text-2xl mb-2">📬</div>
          <p className="text-sm text-ink-600 font-medium mb-1">Check je inbox</p>
          <p className="text-xs text-ink-400">We stuurden een inloglink naar {email}.</p>
        </div>
      )}

      {/* Logged in */}
      {user && (
        <>
          <p className="text-xs text-ink-400 mb-4 truncate">Ingelogd als {user.email}</p>

          {/* No link yet */}
          {!link && (
            <>
              <div className="mb-4">
                <div className="text-xs text-ink-500 mb-2 font-medium">Wat mag je partner zien?</div>
                <div className="grid grid-cols-2 gap-2">
                  {SHARE_LEVELS.map(({ id, label, hint }) => {
                    const active = shareLevel === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setShareLevel(id)}
                        className={`text-left px-3 py-2.5 rounded-xl border transition ${
                          active
                            ? 'bg-sage-100 border-sage-300 text-sage-700'
                            : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
                        }`}
                      >
                        <div className="text-xs font-medium">{label}</div>
                        <div className="text-[10px] text-ink-400 mt-0.5 leading-tight">{hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCreateInvite}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-sage-500
                           text-cream-50 py-3 text-sm font-medium hover:bg-sage-600
                           active:scale-[0.98] transition mb-3"
              >
                <Link2 className="w-4 h-4" />
                Uitnodiging aanmaken
              </button>
            </>
          )}

          {/* Active link */}
          {link && (
            <>
              <div className="mb-4">
                <div className="text-xs text-ink-500 mb-2 font-medium">
                  {link.partner_user_id ? '✓ Partner gekoppeld' : 'Wacht op partner'}
                </div>
                <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-4 py-2.5 border border-cream-200">
                  <span className="flex-1 text-xs text-ink-500 truncate">{inviteUrl}</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    aria-label="Kopieer uitnodigingslink"
                    className="shrink-0 text-ink-400 hover:text-ink-700 transition"
                  >
                    {copied ? <Check className="w-4 h-4 text-sage-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-ink-400 mt-1.5">
                  Stuur deze link naar je partner. Hij/zij maakt een account aan om te koppelen.
                </p>
              </div>

              {/* Share level picker */}
              <div className="mb-4">
                <div className="text-xs text-ink-500 mb-2 font-medium">Wat mag je partner zien?</div>
                <div className="grid grid-cols-2 gap-2">
                  {SHARE_LEVELS.map(({ id, label, hint }) => {
                    const active = shareLevel === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleShareLevelChange(id)}
                        className={`text-left px-3 py-2.5 rounded-xl border transition ${
                          active
                            ? 'bg-sage-100 border-sage-300 text-sage-700'
                            : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
                        }`}
                      >
                        <div className="text-xs font-medium">{label}</div>
                        <div className="text-[10px] text-ink-400 mt-0.5 leading-tight">{hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={handleUnlink}
                className="w-full flex items-center justify-center gap-2 rounded-xl border
                           border-terracotta-200 bg-terracotta-100/50 text-terracotta-600
                           py-2.5 text-sm font-medium hover:bg-terracotta-100
                           active:scale-[0.98] transition mb-3"
              >
                <Unlink className="w-4 h-4" />
                Ontkoppelen
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 rounded-xl border
                       border-cream-200 bg-cream-50 text-ink-500 py-2.5 text-xs
                       hover:bg-cream-100 active:scale-[0.98] transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Uitloggen
          </button>

          {status && <p className="text-xs text-ink-400 mt-2 text-center">{status}</p>}
        </>
      )}
    </div>
  );
}
