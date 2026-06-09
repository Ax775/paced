/**
 * PartnerSettings.jsx — Partner-linking UI for the settings screen.
 *
 * Shows in SettingsScreen if window.PACED_SUPABASE_URL is configured.
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

// localStorage key tracking the AVG-style consent for the partner-share
// feature. Required by AVG art. 9(2)(a): explicit informed consent before
// any special-category data leaves the device. Persisted so returning
// users aren't re-prompted.
const CONSENT_KEY = 'paced.partner.consent.v1';

export default function PartnerSettings({ currentPhase, cycleDay }) {
  const [loading,    setLoading]    = useState(true);
  const [user,       setUser]       = useState(null);
  const [link,       setLink]       = useState(null);
  const [email,      setEmail]      = useState('');
  const [emailSent,  setEmailSent]  = useState(false);
  const [shareLevel, setShareLevel] = useState('phase');
  const [copied,     setCopied]     = useState(false);
  const [status,     setStatus]     = useState('');
  const [consentGiven, setConsentGiven] = useState(() => {
    try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
  });
  // Two-step confirmation for the unlink action. One-tap unlink after a
  // fight is exactly the kind of relationship signal we don't want the
  // UI to deliver — the user has to click once more to confirm.
  const [unlinkConfirm, setUnlinkConfirm] = useState(false);

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
    setUnlinkConfirm(false);
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

  const handleCopy = async () => {
    const url = `${window.location.origin}/?invite=${link.invite_code}`;
    const flashCopied = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    // navigator.clipboard is undefined on non-secure origins and rejects on
    // iOS when the call isn't seen as a direct user gesture. Without a catch
    // this rejected silently — the user tapped "kopieer", nothing flashed,
    // and the link never made it to their clipboard. Fall back to a hidden
    // <textarea> + execCommand, then surface a status if even that fails.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        flashCopied();
        return;
      }
      throw new Error('clipboard-api-unavailable');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) { flashCopied(); return; }
        throw new Error('execCommand-failed');
      } catch {
        setStatus('Kopiëren lukte niet — selecteer en kopieer de link handmatig.');
      }
    }
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

      {/* Not logged in, consent not yet given — show AVG-explainer first. */}
      {!user && !emailSent && !consentGiven && (
        <div>
          <p className="text-sm text-ink-600 leading-relaxed mb-4">
            Met deze functie kan je partner je <strong>huidige cyclus-fase</strong> volgen.
            Lees eerst wat er precies gedeeld wordt:
          </p>
          <ul className="text-sm text-ink-600 leading-relaxed space-y-2 mb-5 pl-1">
            <li className="flex gap-2"><span aria-hidden="true">✓</span><span>Alleen je huidige fase (en optioneel cyclus-dag). <strong>Geen</strong> symptomen, voeding, notities of andere logs.</span></li>
            <li className="flex gap-2"><span aria-hidden="true">✓</span><span>Opgeslagen op Supabase (EU-region) met row-level security — alleen jij en je gekoppelde partner kunnen het lezen.</span></li>
            <li className="flex gap-2"><span aria-hidden="true">✓</span><span>Stopt direct zodra je op &ldquo;Ontkoppelen&rdquo; klikt — geen historische data blijft over.</span></li>
            <li className="flex gap-2"><span aria-hidden="true">✓</span><span>Volledig optioneel. De rest van Paced blijft 100% op je eigen apparaat.</span></li>
          </ul>
          <p className="text-[11px] text-ink-500 leading-relaxed mb-5">
            Volgens AVG art. 9 lid 2 sub a heb je expliciete toestemming nodig om gezondheidsgegevens te delen.
            Door op &ldquo;Akkoord, log in&rdquo; te klikken geef je die toestemming — je kan hem later intrekken via &ldquo;Ontkoppelen&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => {
              try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* private mode */ }
              setConsentGiven(true);
            }}
            className="w-full rounded-xl bg-sage-600 text-cream-50 py-3 text-sm font-medium
                       hover:bg-sage-700 active:scale-[0.98] transition"
          >
            Akkoord, log in
          </button>
        </div>
      )}

      {/* Not logged in, consent given — show magic-link form. */}
      {!user && !emailSent && consentGiven && (
        <form onSubmit={handleMagicLink}>
          <p className="text-sm text-ink-600 leading-relaxed mb-4">
            Log in met een magic link op je email-adres. Je partner krijgt zelf ook een eigen account
            wanneer hij/zij de uitnodigingslink opent.
          </p>
          <label htmlFor="partner-magic-email" className="block text-xs font-medium text-ink-600 mb-1.5">
            Jouw email-adres
          </label>
          <input
            id="partner-magic-email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck="false"
            placeholder="jouw@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-cream-200 bg-cream-50 px-4 py-3 text-base
                       text-ink-700 placeholder-ink-500 focus:outline-none focus:border-sage-400
                       focus:ring-2 focus:ring-sage-200 transition mb-3"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-sage-600 text-cream-50 py-3 text-sm font-medium
                       hover:bg-sage-700 active:scale-[0.98] transition"
          >
            Stuur magic link
          </button>
          <button
            type="button"
            onClick={() => setConsentGiven(false)}
            className="w-full mt-2 text-xs text-ink-500 underline hover:text-ink-700 transition"
          >
            Terug naar uitleg
          </button>
          {status && <p role="status" aria-live="polite" className="text-xs text-ink-500 mt-2 text-center">{status}</p>}
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
                <div className="flex items-center gap-1 bg-cream-100 rounded-xl pl-4 pr-1 py-1 border border-cream-200">
                  <span className="flex-1 text-xs text-ink-500 truncate">{inviteUrl}</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    aria-label={copied ? 'Link gekopieerd' : 'Kopieer uitnodigingslink'}
                    className="shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-ink-400 hover:text-ink-700 hover:bg-cream-200 active:scale-95 transition-all duration-200"
                  >
                    {copied ? <Check className="w-5 h-5 text-sage-500" aria-hidden="true" /> : <Copy className="w-5 h-5" aria-hidden="true" />}
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

              {!unlinkConfirm ? (
                <button
                  type="button"
                  onClick={() => setUnlinkConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border
                             border-terracotta-200 bg-terracotta-100/50 text-terracotta-600
                             min-h-[44px] text-sm font-medium hover:bg-terracotta-100
                             active:scale-[0.98] transition-all duration-200 mb-3"
                >
                  <Unlink className="w-4 h-4" aria-hidden="true" />
                  Ontkoppelen
                </button>
              ) : (
                <div className="mb-3">
                  <p className="text-xs text-ink-600 leading-relaxed mb-2 text-center">
                    Weet je het zeker? Je partner ziet direct geen fase meer.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setUnlinkConfirm(false)}
                      className="flex-1 min-h-[44px] rounded-xl border border-cream-200 bg-cream-100 text-ink-600 text-xs font-medium hover:bg-cream-200 active:scale-[0.98] transition"
                    >
                      Annuleer
                    </button>
                    <button
                      type="button"
                      onClick={handleUnlink}
                      className="flex-1 min-h-[44px] rounded-xl bg-terracotta-600 text-cream-50 text-xs font-medium hover:opacity-90 active:scale-[0.98] transition"
                    >
                      Ja, ontkoppel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 rounded-xl border
                       border-cream-200 bg-cream-50 text-ink-500 min-h-[44px] text-sm
                       hover:bg-cream-100 active:scale-[0.98] transition-all duration-200"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Uitloggen
          </button>

          {status && <p className="text-xs text-ink-400 mt-2 text-center">{status}</p>}
        </>
      )}
    </div>
  );
}
