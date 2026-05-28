/**
 * PartnerView.jsx — Partner dashboard.
 *
 * Shown to the partner (not the cycle owner) when they open the app after
 * accepting an invite. Displays the owner's current cycle phase in
 * plain, human-friendly Dutch and offers a helpful daily tip.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getPartnerSnapshot } from './supabasePartner.js';

// Phase → { emoji, label, tip }
//
// Tip copy is framed from her perspective ("ze heeft mogelijk minder energie")
// rather than instructions to the partner ("geef haar ruimte", "wees lief").
// The original copy was flagged in the UX audit for treating PMS as a problem
// the man manages — which lands poorly in a women's-health app, especially
// in Dutch press coverage. Information > prescription.
const PHASE_INFO = {
  menstrual: {
    emoji: '❤️',
    label: 'Rustweek',
    tip:   'Ze heeft mogelijk minder energie deze dagen. Warmte en een rustige sfeer kunnen fijn zijn.',
  },
  follicular: {
    emoji: '🌱',
    label: 'Energieke periode',
    tip:   'Energie en focus zijn vaak hoger nu. Goed moment voor samen iets actiefs of nieuws plannen.',
  },
  ovulatory: {
    emoji: '✨',
    label: 'Topvorm week',
    tip:   'Vaak de meest energieke fase van haar cyclus. Een leuke avond samen kan extra goed vallen.',
  },
  luteal: {
    emoji: '🍂',
    label: 'Rustige periode',
    tip:   'Energie kan langzaam afnemen richting de menstruatie. Een rustige avond samen werkt vaak goed.',
  },
  luteal_late: {
    emoji: '🌙',
    label: 'Gevoelige periode',
    tip:   'Stemming kan wisselen in de dagen vóór de menstruatie. Geduld en kleine attenties helpen vaak.',
  },
};

function getPhaseKey(phase, cycleDay) {
  if (phase === 'luteal') {
    return (cycleDay ?? 0) > 21 ? 'luteal_late' : 'luteal';
  }
  return phase;
}

function formatTime(isoStr) {
  if (!isoStr) return null;
  try {
    return new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    }).format(new Date(isoStr));
  } catch { return null; }
}

export default function PartnerView() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getPartnerSnapshot();
    if (err === 'no_link') {
      setError('Geen koppeling gevonden. Vraag je partner om een uitnodigingslink te delen.');
    } else if (err) {
      setError('Kon gegevens niet laden. Probeer opnieuw.');
    } else {
      setSnapshot(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Refresh strategy:
    //   - Background timer every 30 minutes while the tab is visible.
    //   - Pause the timer when the page is hidden (background tabs,
    //     screen locked, app backgrounded on iOS PWA) — saves battery
    //     and avoids piling up Supabase reads for inactive partners.
    //   - Force a fresh fetch on visibility-change → visible, so a
    //     partner who comes back to the tab/app sees current data
    //     immediately instead of waiting up to 30 minutes.
    let id = setInterval(load, 30 * 60 * 1000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load();
        if (!id) id = setInterval(load, 30 * 60 * 1000);
      } else if (id) {
        clearInterval(id);
        id = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (id) clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-5">
        <p className="text-sm text-ink-400">Laden…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
        <div className="text-3xl mb-3">🔗</div>
        <p className="text-sm text-ink-500 leading-relaxed max-w-xs mb-4">{error}</p>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-cream-200
                     bg-cream-50 text-ink-600 text-sm hover:bg-cream-100 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Opnieuw proberen
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-5">
        <p className="text-sm text-ink-400">Geen data beschikbaar.</p>
      </div>
    );
  }

  const key  = getPhaseKey(snapshot.phase, snapshot.cycle_day);
  const info = PHASE_INFO[key] ?? PHASE_INFO.follicular;
  const updated = formatTime(snapshot.updated_at);

  return (
    <div className="min-h-dvh px-5 py-10 pb-28 max-w-md mx-auto flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="text-[72px] mb-4 leading-none">{info.emoji}</div>
        <div className="font-display text-[32px] text-ink-700 leading-tight mb-3">{info.label}</div>
        <p className="text-base text-ink-500 leading-relaxed max-w-xs mb-6">{info.tip}</p>

        {/* Cycle day (if share level allows) */}
        {snapshot.share_level === 'phase+day' && snapshot.cycle_day != null && (
          <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-cream-100 border border-cream-200 mb-6">
            <span className="text-xs text-ink-400">Dag</span>
            <span className="font-display text-lg text-ink-700 leading-none">{snapshot.cycle_day}</span>
          </div>
        )}

        {/* Owner note */}
        {snapshot.owner_note && (
          <div className="w-full max-w-xs bg-cream-100 border border-cream-200 rounded-2xl px-5 py-4 mb-6 text-left">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-400 mb-1">Notitie</div>
            <p className="text-sm text-ink-600 leading-relaxed">{snapshot.owner_note}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center">
        {updated && (
          <p className="text-[11px] text-ink-400 mb-3">Bijgewerkt: {updated}</p>
        )}
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-cream-200
                     bg-cream-50 text-ink-500 text-xs hover:bg-cream-100 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Vernieuwen
        </button>
      </div>
    </div>
  );
}
