/**
 * Aura — React app entry
 * ----------------------
 * Onboarding → dashboard with cycle engine, daily tracker, symptom log, and insight.
 * All numbers flow from pure functions in src/lib/*; this file is the calm shell.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Flower2, Leaf, Sun, Moon, Sparkles, ArrowRight, Settings,
  Check, Droplet, Wheat, Salad, ChevronLeft, BookOpen, Activity,
  BarChart2, Download, X, TrendingUp, Upload,
} from 'lucide-react';

import {
  getCycleState, PHASES, PHASE_META,
  logPeriodStart, unlogPeriodStart, isPeriodLoggedOn,
  getCycleHistory,
} from './lib/cycle.js';
import { getDailyTargets, ACTIVITY_LEVELS } from './lib/nutrition.js';
import { getDailyInsight } from './lib/insights.js';
import {
  loadProfile, saveProfile, clearProfile,
  loadLog, saveLog, isoDate, emptyLog, logHasData, getStreak,
} from './lib/storage.js';

/* ------------------------------------------------------------------ */
/*  Small presentational primitives                                    */
/* ------------------------------------------------------------------ */

const Card = ({ className = '', style, children }) => (
  <div
    className={`rounded-xl3 backdrop-blur-sm shadow-soft border border-cream-200/60 ${className}`}
    style={{ background: 'var(--aura-bg-card)', borderColor: 'var(--aura-border-card)', ...style }}
  >
    {children}
  </div>
);

const Label = ({ children, htmlFor }) => (
  <label
    htmlFor={htmlFor}
    className="block text-[11px] uppercase tracking-[0.14em] text-ink-400 font-medium mb-2"
  >
    {children}
  </label>
);

const Field = ({ children }) => (
  <div className="flex flex-col">{children}</div>
);

const inputCx =
  'w-full rounded-xl border border-cream-200 bg-cream-50 px-4 py-3 text-ink-700 ' +
  'placeholder:text-ink-400/70 focus:outline-none focus:border-sage-300 focus:ring-2 ' +
  'focus:ring-sage-200/60 transition';

/* ------------------------------------------------------------------ */
/*  Daily log hook                                                     */
/* ------------------------------------------------------------------ */

function useDailyLog(date = new Date()) {
  const key = isoDate(date);
  const [log, setLog] = useState(() => loadLog(date));

  useEffect(() => { setLog(loadLog(date)); }, [key]); // eslint-disable-line

  const update = useCallback((patch) => {
    setLog((current) => {
      const next = { ...current, ...patch };
      if (patch.gut)      next.gut      = { ...current.gut,      ...patch.gut };
      if (patch.symptoms) next.symptoms = { ...current.symptoms, ...patch.symptoms };
      saveLog(date, next);
      return next;
    });
  }, [key]); // eslint-disable-line

  return [log, update];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function pct(value, target) {
  const t = Number(target);
  const v = Number(value);
  if (!Number.isFinite(t) || t <= 0) return 0;
  if (!Number.isFinite(v) || v <= 0) return 0;
  return (v / t) * 100;
}

function formatNextPeriod(daysUntil) {
  if (!daysUntil || daysUntil <= 0) return 'Soon';
  if (daysUntil === 1) return 'Tomorrow';
  const d = new Date();
  d.setDate(d.getDate() + daysUntil);
  const month = d.toLocaleDateString('en', { month: 'short' });
  return `${month} ${d.getDate()} · in ${daysUntil} days`;
}

function shortMonth(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  CSV export                                                         */
/* ------------------------------------------------------------------ */

function exportCSV(profile) {
  const rows = ['date,cycleDay,phase,mood,energy,cramps,bloating,calories,protein,water,sleep,movement,note'];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const log = loadLog(d);
    const state = getCycleState(profile, d);
    const s = log.symptoms || {};
    rows.push([
      isoDate(d),
      state.cycleDay ?? '',
      state.phase,
      s.mood     || '',
      s.energy   || '',
      s.cramps   || '',
      s.bloating || '',
      log.calories  || '',
      log.protein   || '',
      log.hydration || '',
      log.sleep     || '',
      log.movement  || '',
      `"${(log.note || '').replace(/"/g, '""')}"`,
    ].join(','));
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aura-log.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Settings persistence                                               */
/* ------------------------------------------------------------------ */

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('aura.settings') || '{}'); } catch { return {}; }
}

function persistSettings(s) {
  try { localStorage.setItem('aura.settings', JSON.stringify(s)); } catch { /* no-op */ }
}

/* ------------------------------------------------------------------ */
/*  JSON export / import                                               */
/* ------------------------------------------------------------------ */

function exportJSON() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('aura.')) {
      try { data[key] = JSON.parse(localStorage.getItem(key)); } catch { data[key] = null; }
    }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'aura-backup.json'; a.click();
  URL.revokeObjectURL(url);
}

function validateImportData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return Object.keys(data).some(k => k === 'aura.profile' || k.startsWith('aura.log.'));
}

function applyImport(data, mode) {
  if (mode === 'replace') {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('aura.')) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  }
  for (const [key, value] of Object.entries(data)) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* no-op */ }
  }
}

/* ------------------------------------------------------------------ */
/*  Tracker primitives                                                 */
/* ------------------------------------------------------------------ */

/**
 * SoftProgress — calm progress bar with mount animation.
 * Starts at 0 and animates to the real value after a short delay so the
 * fill is visible as the card fades in.
 */
function SoftProgress({ value, target }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 120);
    return () => clearTimeout(id);
  }, []);

  const safeTarget = Math.max(1, target);
  const displayPct = mounted
    ? Math.min(100, Math.round((value / safeTarget) * 100))
    : 0;
  const reached = value >= safeTarget;

  return (
    <div className="h-2 rounded-full bg-cream-200/80 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${displayPct}%`,
          background: reached
            ? 'linear-gradient(90deg, #87A074 0%, #C78264 100%)'
            : '#A8BA98',
        }}
      />
    </div>
  );
}

function Chip({ children, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="min-h-[44px] text-xs px-3 py-1.5 rounded-full bg-cream-100 border border-cream-200
                 text-ink-600 hover:bg-sage-100 hover:border-sage-200 hover:text-sage-700
                 active:scale-95 transition"
    >
      {children}
    </button>
  );
}

function NumberValue({ value, unit, target, onChange }) {
  return (
    <div className="flex items-baseline gap-1 font-display text-ink-700">
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, '');
          onChange(v === '' ? 0 : Math.min(99999, Number(v)));
        }}
        className="w-[3.4rem] text-right bg-transparent text-[26px] leading-none
                   focus:outline-none focus:text-sage-700"
        aria-label={`${unit} entered`}
      />
      <span className="text-ink-400 text-sm">/ {target} {unit}</span>
    </div>
  );
}

function TrackerRow({ icon: Icon, label, value, target, unit, increments, onAdd, onSet }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-ink-400" />}
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{label}</div>
        </div>
        <NumberValue value={value} unit={unit} target={target} onChange={onSet} />
      </div>
      <SoftProgress value={value} target={target} />
      <div className="flex flex-wrap gap-2 mt-3">
        {increments.map((inc) => (
          <Chip key={inc} onClick={() => onAdd(inc)} ariaLabel={`Add ${inc} ${unit}`}>
            +{inc} {unit}
          </Chip>
        ))}
        {value > 0 && (
          <Chip onClick={() => onSet(0)} ariaLabel={`Reset ${label}`}>
            reset
          </Chip>
        )}
      </div>
    </div>
  );
}

function HydrationRow({ glasses, target, onChange }) {
  const slots = Array.from({ length: target }, (_, i) => i + 1);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Droplet className="w-3.5 h-3.5 text-ink-400" />
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Hydration</div>
        </div>
        <div className="font-display text-ink-700 text-[20px] leading-none">
          {glasses}<span className="text-ink-400 text-sm"> / {target} glasses</span>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {slots.map((slot) => {
          const filled = slot <= glasses;
          return (
            <button
              key={slot}
              type="button"
              aria-label={`Set hydration to ${slot} glasses`}
              onClick={() => onChange(filled && slot === glasses ? slot - 1 : slot)}
              className={`w-7 h-9 rounded-b-full rounded-t-md border transition
                          active:scale-95 ${
                            filled
                              ? 'bg-sage-200 border-sage-300'
                              : 'bg-cream-50 border-cream-200 hover:border-sage-200'
                          }`}
            />
          );
        })}
      </div>
      <div className="text-[11px] text-ink-400 mt-2">
        Each glass ≈ 250 ml · tap to fill, tap the last filled to clear.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Symptom tracker                                                    */
/* ------------------------------------------------------------------ */

const SYMPTOM_META = [
  { id: 'energy',   label: 'Energy',   icons: ['😴','🥱','😐','🙂','⚡'], hint: '1 = exhausted, 5 = energised' },
  { id: 'mood',     label: 'Mood',     icons: ['😢','😔','😐','🙂','😄'], hint: '1 = low, 5 = great' },
  { id: 'cramps',   label: 'Cramps',   icons: ['🔥','😣','😐','🙂','✨'], hint: '1 = intense, 5 = none' },
  { id: 'bloating', label: 'Bloating', icons: ['🎈','😮','😐','🙂','✨'], hint: '1 = heavy, 5 = none' },
];

function SymptomTracker({ log, onUpdate }) {
  const syms = log.symptoms || {};
  const anyLogged = Object.values(syms).some(v => v > 0);

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '80ms' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">How are you feeling?</div>
        {anyLogged && (
          <div className="text-[11px] text-sage-600 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full">
            Logged
          </div>
        )}
      </div>
      <div className="space-y-5">
        {SYMPTOM_META.map(({ id, label, icons, hint }) => {
          const val = syms[id] ?? 0;
          return (
            <div key={id}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-sm font-medium text-ink-600">{label}</div>
                {val > 0 ? (
                  <div className="text-base leading-none">{icons[val - 1]}</div>
                ) : (
                  <div className="text-[10px] text-ink-400/70">{hint}</div>
                )}
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = val === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        onUpdate({ symptoms: { ...syms, [id]: active ? 0 : n } })
                      }
                      className={`flex-1 py-2.5 rounded-xl border transition active:scale-95 text-lg leading-none ${
                        active
                          ? 'bg-sage-100 border-sage-300 shadow-soft'
                          : 'bg-cream-50 border-cream-200 hover:border-sage-200'
                      }`}
                    >
                      {icons[n - 1]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Cycle history strip                                                */
/* ------------------------------------------------------------------ */

function CycleHistoryStrip({ profile }) {
  const history = getCycleHistory(profile, 4);
  if (history.length === 0) return null;

  const avg = Math.round(
    history.reduce((sum, g) => sum + g.length, 0) / history.length
  );

  const barHeight = (len) => {
    const t = Math.min(1, Math.max(0, (len - 21) / 24));
    return 44 + Math.round(t * 48);
  };

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '120ms' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Recent cycles</div>
        <div className="text-[11px] text-sage-600 bg-sage-100 px-2.5 py-1 rounded-full">
          avg {avg} days
        </div>
      </div>

      <div className="flex items-end justify-around gap-3 h-[120px] px-1">
        {history.map((gap) => (
          <div key={gap.start} className="flex-1 flex flex-col items-center justify-end min-w-0">
            <div className="font-display text-[15px] text-ink-700 mb-1 leading-none">
              {gap.length}
              <span className="text-[10px] text-ink-400 ml-0.5">d</span>
            </div>
            <div
              className="w-full max-w-[42px] rounded-t-xl shadow-soft"
              style={{
                height: `${barHeight(gap.length)}px`,
                background: 'linear-gradient(180deg, #C6D3BB 0%, #87A074 60%, #C78264 100%)',
              }}
              aria-label={`${gap.length} day cycle starting ${gap.start}`}
            />
            <div className="text-[10px] text-ink-400 uppercase tracking-wider mt-2">
              {shortMonth(gap.end)}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-ink-400 text-center mt-4 leading-relaxed">
        Cycle length naturally varies — Aura uses your rhythm, not a textbook 28.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Weekly nourishment strip                                           */
/* ------------------------------------------------------------------ */

function WeeklyHistoryStrip({ profile, todayLog }) {
  const days = useMemo(() => {
    const out = [];
    const today = new Date();
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(today);
      d.setDate(today.getDate() - offset);
      const isToday = offset === 0;
      const log     = isToday ? todayLog : loadLog(d);
      const state   = getCycleState(profile, d);
      const targets = getDailyTargets(profile, state.phase);
      const waterTarget = Math.max(6, Math.round(targets.hydrationL * 4));
      out.push({
        date:        d,
        isToday,
        phase:       state.phase,
        phaseHue:    state.phaseMeta.hue,
        pctCalories: pct(log.calories,  targets.calories),
        pctProtein:  pct(log.protein,   targets.protein),
        pctWater:    pct(log.hydration, waterTarget),
      });
    }
    return out;
  }, [profile, todayLog]);

  const anyData = days.some(
    (d) => d.pctCalories > 0 || d.pctProtein > 0 || d.pctWater > 0
  );
  if (!anyData) return null;

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '200ms' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">
          This week's nourishment
        </div>
        <div className="text-[11px] text-ink-400">Last 7 days</div>
      </div>

      <WeekBarRow label="Calories" values={days.map((d) => d.pctCalories)} />
      <WeekBarRow label="Protein"  values={days.map((d) => d.pctProtein)}  />
      <WeekBarRow label="Water"    values={days.map((d) => d.pctWater)}    />

      <div className="flex gap-1.5 mt-4">
        {days.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div
              className={`text-[10px] uppercase tracking-wider ${
                d.isToday ? 'text-sage-700 font-semibold' : 'text-ink-400'
              }`}
            >
              {d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
            </div>
            {d.isToday && <div className="w-1 h-1 rounded-full bg-sage-500 mt-1" />}
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 mt-3" aria-label="Cycle phase per day">
        {days.map((d, i) => (
          <div
            key={i}
            className="flex-1 h-[3px] rounded-full"
            style={{ background: d.phaseHue, opacity: 0.55 }}
            title={PHASE_META[d.phase].label}
          />
        ))}
      </div>

      <p className="text-[11px] text-ink-400 text-center mt-4 leading-relaxed">
        Targets shift with your cycle — these bars measure against each day's own phase.
      </p>
    </Card>
  );
}

function WeekBarRow({ label, values }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{label}</div>
      </div>
      <div className="flex items-end gap-1.5 h-[56px]">
        {values.map((v, i) => {
          const capped = Math.min(100, v);
          const reached = v >= 100;
          return (
            <div
              key={i}
              className="flex-1 h-full rounded-md bg-cream-200/60 relative overflow-hidden"
              aria-label={`${label} day ${i + 1}: ${Math.round(v)}% of target`}
            >
              <div
                className="absolute bottom-0 left-0 right-0 rounded-md transition-all duration-500"
                style={{
                  height: `${capped}%`,
                  background: reached
                    ? 'linear-gradient(180deg, #A8BA98 0%, #C78264 100%)'
                    : '#A8BA98',
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Period log button                                                  */
/* ------------------------------------------------------------------ */

function PeriodLogButton({ profile, onUpdateProfile }) {
  const loggedToday = isPeriodLoggedOn(profile);
  const cyclesTracked = profile.periodHistory?.length ?? 0;
  const [justLogged, setJustLogged] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleLog = () => {
    const next = logPeriodStart(profile);
    if (next === profile) return;
    onUpdateProfile(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    setJustLogged(true);
    timerRef.current = setTimeout(() => setJustLogged(false), 2000);
  };

  const handleUndo = () => {
    onUpdateProfile(unlogPeriodStart(profile));
  };

  if (loggedToday) {
    return (
      <div className={`mt-6 flex flex-col items-center gap-2 ${justLogged ? 'anim-pop' : ''}`}>
        <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-terracotta-100 border border-terracotta-200 text-terracotta-600 text-sm">
          <Check className="w-4 h-4" />
          Period logged today
        </div>
        <button
          type="button"
          onClick={handleUndo}
          className="text-xs text-ink-400 hover:text-ink-600 underline decoration-dotted underline-offset-4 transition"
        >
          undo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-2 w-full">
      <button
        type="button"
        onClick={handleLog}
        className="w-full max-w-[260px] px-6 py-3.5 rounded-2xl font-medium text-sm text-cream-50
                   active:scale-[0.97] transition-transform flex items-center justify-center gap-3"
        style={{ background: 'linear-gradient(135deg, #C78264 0%, #B06849 100%)' }}
      >
        <span className="w-2 h-2 rounded-full bg-cream-50/70 shrink-0" />
        My period started today
      </button>
      {cyclesTracked > 0 && (
        <div className="text-[10px] uppercase tracking-wider text-ink-400/80">
          {cyclesTracked} {cyclesTracked === 1 ? 'cycle' : 'cycles'} tracked
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Gut health checklist                                               */
/* ------------------------------------------------------------------ */

function GutChecklist({ gut, onToggle }) {
  const items = [
    { id: 'probiotics', label: 'Probiotics',     hint: 'Yogurt, kefir, capsule…',           icon: Sparkles },
    { id: 'fiber',      label: 'Fibre-rich meal', hint: 'Veg, legumes, whole grains',        icon: Wheat },
    { id: 'fermented',  label: 'Fermented food', hint: 'Sauerkraut, kimchi, miso, kombucha', icon: Salad },
  ];
  return (
    <div className="space-y-2">
      {items.map(({ id, label, hint, icon: Icon }) => {
        const on = !!gut[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition text-left
                        active:scale-[0.99] ${
                          on
                            ? 'bg-sage-100 border-sage-300'
                            : 'bg-cream-50 border-cream-200 hover:border-sage-200'
                        }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition ${
                on ? 'bg-sage-300 text-cream-50' : 'bg-cream-100 text-ink-400'
              }`}
            >
              {on ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className={`text-sm font-medium ${on ? 'text-sage-700' : 'text-ink-600'}`}>{label}</div>
              <div className="text-xs text-ink-400 mt-0.5">{hint}</div>
            </div>
            {on && (
              <div className="ml-auto text-[10px] uppercase tracking-wider text-sage-600">Done</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sleep tracker                                                      */
/* ------------------------------------------------------------------ */

const SLEEP_SLOTS = [5, 6, 7, 8, 9, 10];

function SleepTracker({ hours, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Moon className="w-3.5 h-3.5 text-ink-400" />
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Sleep last night</div>
        </div>
        {hours > 0 && (
          <div className="font-display text-ink-700 text-[20px] leading-none">
            {hours}<span className="text-ink-400 text-sm">h</span>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {SLEEP_SLOTS.map((h) => {
          const active = hours === h;
          return (
            <button
              key={h}
              type="button"
              aria-label={`${h} hours sleep`}
              onClick={() => onChange(active ? 0 : h)}
              className={`flex-1 py-2.5 rounded-xl border text-sm transition active:scale-95 ${
                active
                  ? 'bg-sage-100 border-sage-300 text-sage-700 font-medium shadow-soft'
                  : 'bg-cream-50 border-cream-200 text-ink-500 hover:border-sage-200'
              }`}
            >
              {h}h
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-ink-400 mt-2">
        Quality sleep supports hormone balance and recovery.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Movement tracker                                                   */
/* ------------------------------------------------------------------ */

const MOVEMENT_SLOTS = [15, 30, 45, 60, 90];

function MovementTracker({ minutes, onChange, phase }) {
  const phaseHints = {
    menstrual:  'Gentle walk or stretching is plenty.',
    follicular: 'Great time to ramp up intensity.',
    ovulatory:  'Peak energy — go for it.',
    luteal:     'Listen to your body; moderate is ideal.',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-ink-400" />
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Movement today</div>
        </div>
        {minutes > 0 && (
          <div className="font-display text-ink-700 text-[20px] leading-none">
            {minutes}<span className="text-ink-400 text-sm"> min</span>
          </div>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {MOVEMENT_SLOTS.map((m) => {
          const active = minutes === m;
          return (
            <button
              key={m}
              type="button"
              aria-label={`${m} minutes movement`}
              onClick={() => onChange(active ? 0 : m)}
              className={`px-3 py-2.5 rounded-xl border text-sm transition active:scale-95 ${
                active
                  ? 'bg-sage-100 border-sage-300 text-sage-700 font-medium shadow-soft'
                  : 'bg-cream-50 border-cream-200 text-ink-500 hover:border-sage-200'
              }`}
            >
              {m}m
            </button>
          );
        })}
        {minutes > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            className="px-3 py-2.5 rounded-xl border border-cream-200 bg-cream-50 text-ink-400 text-sm transition hover:border-sage-200"
          >
            reset
          </button>
        )}
      </div>
      {phase && (
        <div className="text-[11px] text-ink-400 mt-2">{phaseHints[phase]}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Journal note                                                       */
/* ------------------------------------------------------------------ */

function JournalNote({ note, onChange }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2.5">Today's note</div>
      <textarea
        value={note}
        onChange={(e) => onChange(e.target.value.slice(0, 280))}
        placeholder="Anything worth remembering about today…"
        rows={3}
        className="w-full rounded-xl border border-cream-200 bg-cream-50 px-4 py-3 text-sm
                   text-ink-700 placeholder:text-ink-400/60 focus:outline-none
                   focus:border-sage-300 focus:ring-2 focus:ring-sage-200/60
                   transition resize-none leading-relaxed"
      />
      <div className="flex justify-end mt-1">
        <span className="text-[10px] text-ink-400/60">{(note || '').length}/280</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PWA install prompt banner                                          */
/* ------------------------------------------------------------------ */

function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('aura.pwa.dismissed')) return;
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('aura.pwa.dismissed', '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2 anim-slide-up">
      <div className="max-w-md mx-auto bg-cream-50/95 backdrop-blur-md border border-cream-200 rounded-2xl shadow-soft p-4 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #E2E9DC 0%, #F4E2D8 100%)' }}
        >
          <Flower2 className="w-5 h-5 text-sage-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-700">Add Aura to home screen</div>
          <div className="text-xs text-ink-400 mt-0.5">Works offline, feels like an app.</div>
        </div>
        <button
          type="button"
          onClick={handleInstall}
          className="px-4 py-2 rounded-xl bg-sage-500 text-cream-50 text-xs font-medium hover:bg-sage-600 transition shrink-0 min-h-[44px]"
        >
          Install
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 text-ink-400 hover:text-ink-600 transition shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Dismiss install prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast notification                                                 */
/* ------------------------------------------------------------------ */

function Toast({ message, type = 'success', onDismiss }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3200);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div className="fixed top-4 left-0 right-0 z-[110] flex justify-center px-4 anim-slide-up pointer-events-none">
      <div
        className={`px-4 py-3 rounded-xl shadow-glow flex items-center gap-2 text-sm pointer-events-auto ${
          type === 'error'
            ? 'bg-terracotta-100 text-terracotta-600 border border-terracotta-200'
            : 'bg-sage-100 text-sage-700 border border-sage-200'
        }`}
      >
        {type === 'error' ? <X className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
        {message}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirm modal                                                       */
/* ------------------------------------------------------------------ */

function ConfirmModal({ title, message, options, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-8"
      style={{ background: 'rgba(42,40,35,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-glow p-6 anim-slide-up"
        style={{ background: 'var(--aura-bg-card)', borderColor: 'var(--aura-border-card)', border: '1px solid' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-medium text-ink-700 mb-2">{title}</div>
        <p className="text-sm text-ink-500 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          {options.map(({ label, onClick, primary }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition active:scale-[0.98] ${
                primary
                  ? 'bg-sage-500 text-cream-50 hover:bg-sage-600'
                  : 'bg-cream-100 border border-cream-200 text-ink-600 hover:bg-cream-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Onboarding — 3-step conversational flow                            */
/* ------------------------------------------------------------------ */

function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [form, setForm] = useState({
    name:            '',
    age:             '',
    weightKg:        '',
    heightCm:        '',
    activityLevel:   'moderate',
    cycleLength:     28,
    lastPeriodStart: new Date().toISOString().slice(0, 10),
  });

  const setF  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setFE = (k)    => (e) => setF(k, e.target.value);

  const goTo = (n) => {
    setStep(n);
    setAnimKey(k => k + 1);
  };

  const complete = () => {
    const profile = {
      ...form,
      age:         Number(form.age)      || 28,
      weightKg:    Number(form.weightKg) || 62,
      heightCm:    Number(form.heightCm) || 168,
      cycleLength: Number(form.cycleLength),
      createdAt:   new Date().toISOString(),
    };
    saveProfile(profile);
    onComplete(profile);
  };

  const dots = (
    <div className="flex justify-center gap-2 mb-8">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="rounded-full transition-all duration-400"
          style={{
            width:      i === step ? 24 : 8,
            height:     8,
            background: i === step ? '#6B8559' : i < step ? '#A8BA98' : '#EDE6D3',
          }}
        />
      ))}
    </div>
  );

  const cardCx = `p-8 anim-fade-up`;

  return (
    <div className="min-h-dvh flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        {dots}

        {/* Step 0 — Welcome + name */}
        {step === 0 && (
          <Card key={animKey} className={cardCx}>
            <div className="flex justify-center mb-6">
              <div
                className="w-16 h-16 rounded-[22px] flex items-center justify-center shadow-soft"
                style={{ background: 'linear-gradient(135deg, #E2E9DC 0%, #F4E2D8 100%)' }}
              >
                <Flower2 className="w-7 h-7 text-sage-600" />
              </div>
            </div>
            <h1 className="font-display text-[34px] text-ink-700 text-center leading-tight mb-2">
              Hey, I'm Aura.
            </h1>
            <p className="text-sm text-ink-500 text-center leading-relaxed mb-8">
              Your calm companion for cycle-synced nutrition, energy awareness, and gut health.
            </p>
            <div className="mb-6">
              <label className="block text-sm text-ink-600 mb-2.5" htmlFor="onboard-name">
                What should I call you?
              </label>
              <input
                id="onboard-name"
                className={inputCx}
                value={form.name}
                onChange={setFE('name')}
                placeholder="Your name (optional)"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && goTo(1)}
              />
            </div>
            <button
              type="button"
              onClick={() => goTo(1)}
              className="w-full rounded-xl bg-sage-500 text-cream-50 py-3.5 font-medium
                         hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              {form.name
                ? `Nice to meet you, ${form.name.split(' ')[0]} ✓`
                : "Let's begin"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </Card>
        )}

        {/* Step 1 — Cycle details */}
        {step === 1 && (
          <Card key={animKey} className={cardCx}>
            <h2 className="font-display text-[28px] text-ink-700 leading-tight mb-2">
              {form.name
                ? `${form.name.split(' ')[0]}, tell me about your cycle.`
                : 'Tell me about your cycle.'}
            </h2>
            <p className="text-sm text-ink-500 mb-7 leading-relaxed">
              This is where Aura's personalisation starts — everything flows from here.
            </p>

            <div className="space-y-6">
              <Field>
                <Label htmlFor="onboard-last-period">When did your last period start?</Label>
                <input
                  id="onboard-last-period"
                  className={inputCx}
                  type="date"
                  value={form.lastPeriodStart}
                  onChange={setFE('lastPeriodStart')}
                />
              </Field>

              <Field>
                <Label>Typical cycle length</Label>
                <div className="flex items-center gap-4 mt-1">
                  <button
                    type="button"
                    onClick={() => setF('cycleLength', Math.max(21, form.cycleLength - 1))}
                    className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                               text-ink-600 hover:bg-sage-100 hover:border-sage-200
                               transition text-xl flex items-center justify-center"
                  >−</button>
                  <div className="flex-1 text-center">
                    <span className="font-display text-[36px] text-ink-700 leading-none">
                      {form.cycleLength}
                    </span>
                    <span className="text-sm text-ink-400 ml-1.5">days</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setF('cycleLength', Math.min(45, form.cycleLength + 1))}
                    className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                               text-ink-600 hover:bg-sage-100 hover:border-sage-200
                               transition text-xl flex items-center justify-center"
                  >+</button>
                </div>
                <div className="text-[11px] text-ink-400 text-center mt-2">
                  28 days is average — adjust to match your rhythm (21–45)
                </div>
              </Field>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => goTo(0)}
                className="px-4 py-3 rounded-xl bg-cream-100 border border-cream-200 text-ink-500
                           hover:bg-cream-200 transition flex items-center gap-1.5 text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                onClick={() => goTo(2)}
                className="flex-1 rounded-xl bg-sage-500 text-cream-50 py-3 font-medium
                           hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        {/* Step 2 — Physical basics */}
        {step === 2 && (
          <Card key={animKey} className={cardCx}>
            <h2 className="font-display text-[28px] text-ink-700 leading-tight mb-2">
              Almost there.
            </h2>
            <p className="text-sm text-ink-500 mb-1 leading-relaxed">
              These help me personalise your nutrition targets.
            </p>
            <p className="text-xs text-ink-400 mb-6">
              Rough estimates are fine — we refine over time. Skip anything you'd rather not share.
            </p>

            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <Field>
                  <Label htmlFor="onboard-age">Age</Label>
                  <input
                    id="onboard-age"
                    className={inputCx}
                    type="number"
                    min="14"
                    max="70"
                    value={form.age}
                    onChange={setFE('age')}
                    placeholder="28"
                  />
                </Field>
                <Field>
                  <Label htmlFor="onboard-weight">Weight kg</Label>
                  <input
                    id="onboard-weight"
                    className={inputCx}
                    type="number"
                    min="30"
                    max="200"
                    value={form.weightKg}
                    onChange={setFE('weightKg')}
                    placeholder="62"
                  />
                </Field>
                <Field>
                  <Label htmlFor="onboard-height">Height cm</Label>
                  <input
                    id="onboard-height"
                    className={inputCx}
                    type="number"
                    min="120"
                    max="220"
                    value={form.heightCm}
                    onChange={setFE('heightCm')}
                    placeholder="168"
                  />
                </Field>
              </div>

              <Field>
                <Label>How active are you?</Label>
                <div className="grid grid-cols-1 gap-2">
                  {ACTIVITY_LEVELS.map((lvl) => {
                    const active = form.activityLevel === lvl.id;
                    return (
                      <button
                        type="button"
                        key={lvl.id}
                        onClick={() => setF('activityLevel', lvl.id)}
                        className={`text-left px-4 py-3 rounded-xl border transition ${
                          active
                            ? 'bg-sage-100 border-sage-300 text-sage-700'
                            : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
                        }`}
                      >
                        <div className="text-sm font-medium">{lvl.label}</div>
                        <div className="text-xs text-ink-400 mt-0.5">{lvl.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            <div className="flex gap-3 mt-7">
              <button
                type="button"
                onClick={() => goTo(1)}
                className="px-4 py-3 rounded-xl bg-cream-100 border border-cream-200 text-ink-500
                           hover:bg-cream-200 transition flex items-center gap-1.5 text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                onClick={complete}
                className="flex-1 rounded-xl bg-sage-500 text-cream-50 py-3 font-medium
                           hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm"
              >
                Begin <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings screen                                                    */
/* ------------------------------------------------------------------ */

function SettingsScreen({ profile, onSave, onReset, onBack, darkMode, onDarkModeChange, onExportJSON, onImportRequest }) {
  const [form, setForm] = useState({
    name:          profile.name          || '',
    age:           profile.age           || '',
    weightKg:      profile.weightKg      || '',
    heightCm:      profile.heightCm      || '',
    activityLevel: profile.activityLevel || 'moderate',
    cycleLength:   profile.cycleLength   || 28,
  });
  const [saved, setSaved] = useState(false);
  const timerRef = useRef(null);
  const fileRef  = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    onSave({
      ...profile,
      name:          form.name,
      age:           Number(form.age)      || profile.age,
      weightKg:      Number(form.weightKg) || profile.weightKg,
      heightCm:      Number(form.heightCm) || profile.heightCm,
      activityLevel: form.activityLevel,
      cycleLength:   Number(form.cycleLength),
    });
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setSaved(false); onBack(); }, 800);
  };

  return (
    <div className="min-h-dvh px-5 py-8 max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center gap-3 mb-8 anim-fade-up">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to dashboard"
          className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                     flex items-center justify-center text-ink-500 hover:text-ink-700 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-[28px] text-ink-700 leading-tight">Settings</h1>
      </header>

      {/* Appearance */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">Weergave</div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-ink-600">Donkere modus</div>
            <div className="text-xs text-ink-400 mt-0.5">
              {darkMode === null ? 'Automatisch (systeem)' : darkMode ? 'Aan' : 'Uit'}
            </div>
          </div>
          <div className="flex bg-cream-100 rounded-lg p-0.5 gap-0.5 border border-cream-200">
            {[
              { val: null, emoji: '✨', label: 'Auto' },
              { val: false, emoji: '☀️', label: 'Licht' },
              { val: true,  emoji: '🌙', label: 'Donker' },
            ].map(({ val, emoji, label }) => (
              <button
                key={String(val)}
                type="button"
                aria-label={label}
                onClick={() => onDarkModeChange(val)}
                className={`px-3 py-1.5 rounded-md text-sm transition ${
                  darkMode === val
                    ? 'bg-cream-50 text-ink-700 shadow-soft'
                    : 'text-ink-400 hover:text-ink-600'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Profile fields */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-5">Profile</div>
        <div className="space-y-5">
          <Field>
            <Label htmlFor="settings-name">Name</Label>
            <input
              id="settings-name"
              className={inputCx}
              value={form.name}
              onChange={(e) => setF('name', e.target.value)}
              placeholder="Your name (optional)"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field>
              <Label htmlFor="settings-age">Age</Label>
              <input
                id="settings-age"
                className={inputCx}
                type="number" min="14" max="70"
                value={form.age}
                onChange={(e) => setF('age', e.target.value)}
                placeholder="28"
              />
            </Field>
            <Field>
              <Label htmlFor="settings-weight">Weight kg</Label>
              <input
                id="settings-weight"
                className={inputCx}
                type="number" min="30" max="200"
                value={form.weightKg}
                onChange={(e) => setF('weightKg', e.target.value)}
                placeholder="62"
              />
            </Field>
            <Field>
              <Label htmlFor="settings-height">Height cm</Label>
              <input
                id="settings-height"
                className={inputCx}
                type="number" min="120" max="220"
                value={form.heightCm}
                onChange={(e) => setF('heightCm', e.target.value)}
                placeholder="168"
              />
            </Field>
          </div>

          <Field>
            <Label>Cycle length</Label>
            <div className="flex items-center gap-4 mt-1">
              <button
                type="button"
                onClick={() => setF('cycleLength', Math.max(21, form.cycleLength - 1))}
                className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                           text-ink-600 hover:bg-sage-100 hover:border-sage-200
                           transition text-xl flex items-center justify-center"
              >−</button>
              <div className="flex-1 text-center">
                <span className="font-display text-[36px] text-ink-700 leading-none">
                  {form.cycleLength}
                </span>
                <span className="text-sm text-ink-400 ml-1.5">days</span>
              </div>
              <button
                type="button"
                onClick={() => setF('cycleLength', Math.min(45, form.cycleLength + 1))}
                className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                           text-ink-600 hover:bg-sage-100 hover:border-sage-200
                           transition text-xl flex items-center justify-center"
              >+</button>
            </div>
          </Field>

          <Field>
            <Label>How active are you?</Label>
            <div className="grid grid-cols-1 gap-2 mt-1">
              {ACTIVITY_LEVELS.map((lvl) => {
                const active = form.activityLevel === lvl.id;
                return (
                  <button
                    type="button"
                    key={lvl.id}
                    onClick={() => setF('activityLevel', lvl.id)}
                    className={`text-left px-4 py-3 rounded-xl border transition ${
                      active
                        ? 'bg-sage-100 border-sage-300 text-sage-700'
                        : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
                    }`}
                  >
                    <div className="text-sm font-medium">{lvl.label}</div>
                    <div className="text-xs text-ink-400 mt-0.5">{lvl.hint}</div>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Card>

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        className={`w-full rounded-xl py-3.5 font-medium text-sm
                    active:scale-[0.98] transition flex items-center justify-center gap-2 mb-5 ${
                      saved
                        ? 'bg-sage-400 text-cream-50'
                        : 'bg-sage-500 text-cream-50 hover:bg-sage-600'
                    }`}
      >
        {saved ? <><Check className="w-4 h-4" /> Saved!</> : 'Save changes'}
      </button>

      {/* Data backup */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Data</div>
        <p className="text-sm text-ink-500 mb-4 leading-relaxed">
          Maak een back-up van al je gegevens of herstel een eerder opgeslagen export.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onExportJSON}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       border border-cream-200 bg-cream-50 text-ink-600 text-sm
                       hover:bg-cream-100 transition active:scale-[0.98]"
          >
            <Download className="w-3.5 h-3.5" /> Exporteren
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       border border-cream-200 bg-cream-50 text-ink-600 text-sm
                       hover:bg-cream-100 transition active:scale-[0.98]"
          >
            <Upload className="w-3.5 h-3.5" /> Importeren
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportRequest(file);
              e.target.value = '';
            }}
          />
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="p-6 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Danger zone</div>
        <p className="text-sm text-ink-500 mb-4 leading-relaxed">
          Reset your profile and start fresh. Your daily logs are kept.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-xl border border-terracotta-200 bg-terracotta-100/50
                     text-terracotta-600 py-3 text-sm font-medium
                     hover:bg-terracotta-100 active:scale-[0.98] transition"
        >
          Reset profile
        </button>
      </Card>

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">Aura · v1.0</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */

const PHASE_ICONS = {
  [PHASES.MENSTRUAL]:  Moon,
  [PHASES.FOLLICULAR]: Leaf,
  [PHASES.OVULATORY]:  Sun,
  [PHASES.LUTEAL]:     Flower2,
};

function CycleRing({ state }) {
  const size = 220;
  const r = 92;
  const c = 2 * Math.PI * r;
  const progress = state.hasData ? state.progressPct / 100 : 0;
  const dashOffset = c * (1 - progress);

  const phaseArcs = useMemo(() => {
    let cursor = 0;
    return state.phaseMap.map((slot) => {
      const fraction = slot.length / state.cycleLength;
      const offset = c * (1 - cursor);
      cursor += fraction;
      return {
        phase:     slot.phase,
        hue:       PHASE_META[slot.phase].hue,
        dasharray: `${c * fraction} ${c * (1 - fraction)}`,
        offset,
      };
    });
  }, [state.phaseMap, state.cycleLength, c]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#A8BA98" />
            <stop offset="100%" stopColor="#C78264" />
          </linearGradient>
        </defs>

        {phaseArcs.map((arc) => (
          <circle
            key={arc.phase}
            cx={size / 2} cy={size / 2} r={r}
            stroke={arc.hue} strokeWidth="14" strokeOpacity="0.22"
            fill="none"
            strokeDasharray={arc.dasharray} strokeDashoffset={arc.offset}
          />
        ))}

        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="url(#ring-grad)" strokeWidth="14" strokeLinecap="round" fill="none"
          strokeDasharray={c} strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Day</div>
        <div className="font-display text-[54px] leading-none text-ink-700">
          {state.cycleDay ?? '—'}
        </div>
        <div className="text-xs text-ink-400 mt-1">of {state.cycleLength}</div>
      </div>
    </div>
  );
}

function PhaseTimeline({ state }) {
  return (
    <div className="flex gap-1.5">
      {state.phaseMap.map((slot) => {
        const active = slot.phase === state.phase;
        const meta = PHASE_META[slot.phase];
        return (
          <div
            key={slot.phase}
            className="flex-1 flex flex-col items-center gap-1.5"
            style={{ flexGrow: slot.length }}
          >
            <div
              className={`h-1.5 w-full rounded-full transition ${active ? 'anim-breathe' : ''}`}
              style={{ background: active ? meta.hue : '#EDE6D3' }}
            />
            <div className={`text-[10px] uppercase tracking-wider ${active ? 'text-ink-600' : 'text-ink-400/70'}`}>
              {meta.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ profile, onUpdateProfile, onOpenSettings }) {
  const state   = useMemo(() => getCycleState(profile), [profile]);
  const targets = useMemo(() => getDailyTargets(profile, state.phase), [profile, state.phase]);
  const insight = useMemo(() => getDailyInsight(state.phase), [state.phase]);
  const PhaseIcon = PHASE_ICONS[state.phase];

  const [log, updateLog] = useDailyLog();

  const streak = useMemo(() => getStreak(log), [log]);

  const waterGlassTarget = Math.max(6, Math.round(targets.hydrationL * 4));

  const addProtein  = (g)    => updateLog({ protein:  Math.min(99999, log.protein  + g) });
  const setProtein  = (g)    => updateLog({ protein:  g });
  const addCalories = (kcal) => updateLog({ calories: Math.min(99999, log.calories + kcal) });
  const setCalories = (kcal) => updateLog({ calories: kcal });
  const setWater    = (g)    => updateLog({ hydration: Math.max(0, Math.min(waterGlassTarget, g)) });
  const toggleGut   = (id)   => updateLog({ gut: { [id]: !log.gut[id] } });
  const setSleep    = (h)    => updateLog({ sleep: h });
  const setMovement = (m)    => updateLog({ movement: m });
  const setNote     = (txt)  => updateLog({ note: txt });

  const displayName = profile.name ? profile.name.split(' ')[0] : null;

  return (
    <div className="min-h-dvh px-5 py-8 pb-28 max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-7 anim-fade-up">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">
            Good day{displayName ? `, ${displayName}` : ''}
          </div>
          <h1 className="font-display text-[30px] leading-tight text-ink-700">Your Aura</h1>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <div className="text-[11px] text-sage-700 bg-sage-50 border border-sage-200 px-2.5 py-1.5 rounded-full whitespace-nowrap anim-streak-pulse">
              🌿 {streak} {streak === 1 ? 'day' : 'days'}
            </div>
          )}
          <button
            onClick={onOpenSettings}
            aria-label="Settings"
            className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-500 hover:text-ink-700 transition"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Cycle ring — the hero card */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '40ms' }}>
        <div className="flex flex-col items-center">
          <CycleRing state={state} />
          <div className="flex items-center gap-2 mt-5 flex-wrap justify-center">
            <PhaseIcon className="w-4 h-4 shrink-0" style={{ color: state.phaseMeta.hue }} />
            <div className="font-display text-xl text-ink-700">{state.phaseMeta.label}</div>
            <span className="text-ink-400">·</span>
            <div className="text-sm text-ink-500">{state.phaseMeta.subtitle}</div>
          </div>
          <p className="text-center text-sm text-ink-500 mt-3 leading-relaxed px-4">
            {state.phaseMeta.blurb}
          </p>
          {state.hasData && (
            <div className="flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-cream-100 border border-cream-200">
              <span className="text-[11px] text-ink-400">Next period</span>
              <span className="text-[11px] font-medium text-ink-600">
                {formatNextPeriod(state.daysUntilNext)}
              </span>
            </div>
          )}
          <PeriodLogButton profile={profile} onUpdateProfile={onUpdateProfile} />
        </div>
        <div className="mt-6">
          <PhaseTimeline state={state} />
        </div>
      </Card>

      {/* Symptom tracker */}
      <SymptomTracker log={log} onUpdate={updateLog} />

      {/* Recent cycles (only renders once there's ≥1 completed cycle) */}
      <CycleHistoryStrip profile={profile} />

      {/* Today's nourishment */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '160ms' }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Today's nourishment</div>
          {targets.calorieDelta > 0 && (
            <div className="text-[11px] text-sage-600 bg-sage-100 px-2.5 py-1 rounded-full">
              +{targets.calorieDelta} kcal for {state.phaseMeta.label.toLowerCase()}
            </div>
          )}
        </div>
        <div className="space-y-6">
          <TrackerRow
            label="Calories"
            value={log.calories}
            target={targets.calories}
            unit="kcal"
            increments={[100, 250, 500]}
            onAdd={addCalories}
            onSet={setCalories}
          />
          <TrackerRow
            label="Protein"
            value={log.protein}
            target={targets.protein}
            unit="g"
            increments={[10, 20, 30]}
            onAdd={addProtein}
            onSet={setProtein}
          />
          <HydrationRow
            glasses={log.hydration}
            target={waterGlassTarget}
            onChange={setWater}
          />
        </div>
      </Card>

      {/* Wellbeing — sleep + movement */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '200ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-5">Wellbeing</div>
        <div className="space-y-6">
          <SleepTracker hours={log.sleep} onChange={setSleep} />
          <div className="h-px bg-cream-200/70" />
          <MovementTracker minutes={log.movement} onChange={setMovement} phase={state.phase} />
        </div>
      </Card>

      {/* Weekly nourishment history */}
      <WeeklyHistoryStrip profile={profile} todayLog={log} />

      {/* Gut health checklist */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '240ms' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Gut health</div>
          <div className="text-[11px] text-ink-400">
            {Object.values(log.gut).filter(Boolean).length} of 3
          </div>
        </div>
        <GutChecklist gut={log.gut} onToggle={toggleGut} />
      </Card>

      {/* Nutrient focus */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '280ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-2">Voeding & fase</div>
        <div className="font-display text-xl text-ink-700 mb-1">{targets.focus.headline}</div>
        <p className="text-sm text-ink-500 leading-relaxed mb-4">{targets.focus.why}</p>

        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2.5">Eet meer</div>
        <div className="flex flex-wrap gap-2 mb-5">
          {(targets.focus.eatItems || []).map(({ emoji, name }) => (
            <span
              key={name}
              className="text-xs px-3 py-1.5 rounded-full bg-cream-100 border border-cream-200 text-ink-600 flex items-center gap-1.5"
            >
              <span>{emoji}</span>{name}
            </span>
          ))}
        </div>

        {(targets.focus.avoidItems?.length > 0) && (
          <>
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2.5">Verminder</div>
            <div className="flex flex-wrap gap-2 mb-5">
              {targets.focus.avoidItems.map((item) => (
                <span
                  key={item}
                  className="text-xs px-3 py-1.5 rounded-full bg-terracotta-100/50 border border-terracotta-200 text-terracotta-600"
                >
                  {item}
                </span>
              ))}
            </div>
          </>
        )}

        {targets.focus.hydrationTip && (
          <div className="flex gap-2.5 mt-1 pt-4 border-t border-cream-200/60">
            <Droplet className="w-3.5 h-3.5 text-sage-400 shrink-0 mt-0.5" />
            <p className="text-xs text-ink-500 leading-relaxed">{targets.focus.hydrationTip}</p>
          </div>
        )}
      </Card>

      {/* Journal note */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '340ms' }}>
        <JournalNote note={log.note} onChange={setNote} />
      </Card>

      {/* Daily insight */}
      <Card className="p-6 anim-fade-up" style={{ animationDelay: '380ms' }}>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          Daily insight
        </div>
        <p className="font-display text-[19px] leading-snug text-ink-700">
          {insight.text}
        </p>
      </Card>

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">
        Aura · v1.0
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bottom navigation                                                  */
/* ------------------------------------------------------------------ */

function BottomNav({ active, onSelect }) {
  const tabs = [
    { id: 'home',     label: 'Vandaag',   icon: Flower2   },
    { id: 'logboek',  label: 'Logboek',   icon: BookOpen  },
    { id: 'stats',    label: 'Inzichten', icon: BarChart2 },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-cream-50/95 backdrop-blur-md border-t border-cream-200 flex">
      {tabs.map(({ id, label, icon: Icon }) => {
        const on = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`flex-1 flex flex-col items-center py-3 gap-1 transition min-h-[56px] ${
              on ? 'text-sage-600' : 'text-ink-400 hover:text-ink-600'
            }`}
          >
            <Icon className="w-5 h-5" strokeWidth={on ? 2 : 1.5} />
            <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  Logboek                                                            */
/* ------------------------------------------------------------------ */

const SYMPTOM_EMOJIS = {
  energy:   ['😴','🥱','😐','🙂','⚡'],
  mood:     ['😢','😔','😐','🙂','😄'],
  cramps:   ['🔥','😣','😐','🙂','✨'],
  bloating: ['🎈','😮','😐','🙂','✨'],
};

function LogboekEntry({ date, isToday, log, state, targets, hasData, animDelay, onGoToToday }) {
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const syms = log.symptoms || {};
  const symptomsLogged = Object.entries(syms).filter(([, v]) => v > 0);
  const waterTarget = Math.max(6, Math.round(targets.hydrationL * 4));

  return (
    <Card
      className={`p-4 anim-fade-up transition-opacity ${!hasData ? 'opacity-40' : ''}`}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex flex-col items-center w-10">
          <div className="text-[10px] uppercase tracking-wider text-ink-400">{weekday}</div>
          <div className="font-display text-[22px] text-ink-700 leading-none">{date.getDate()}</div>
          <div className="text-[10px] text-ink-400">
            {date.toLocaleDateString(undefined, { month: 'short' })}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: state.phaseMeta.hue }} />
            <div className="text-[11px] text-ink-500">{state.phaseMeta.label}</div>
            {isToday && (
              <div className="text-[10px] bg-sage-100 text-sage-700 px-1.5 py-0.5 rounded-full">Today</div>
            )}
          </div>

          {hasData ? (
            <div className="space-y-1.5">
              {log.calories > 0 && (
                <div className="flex items-center gap-2">
                  <div className="text-[11px] text-ink-400 w-14 shrink-0">Calories</div>
                  <div className="flex-1 h-1.5 bg-cream-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sage-300"
                      style={{ width: `${Math.min(100, pct(log.calories, targets.calories))}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-ink-500 w-16 text-right shrink-0">{log.calories} kcal</div>
                </div>
              )}
              {log.protein > 0 && (
                <div className="flex items-center gap-2">
                  <div className="text-[11px] text-ink-400 w-14 shrink-0">Protein</div>
                  <div className="flex-1 h-1.5 bg-cream-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, pct(log.protein, targets.protein))}%`,
                        background: '#C78264',
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-ink-500 w-16 text-right shrink-0">{log.protein} g</div>
                </div>
              )}
              {log.hydration > 0 && (
                <div className="flex items-center gap-2">
                  <div className="text-[11px] text-ink-400 w-14 shrink-0">Water</div>
                  <div className="flex-1 flex gap-px overflow-hidden">
                    {Array.from({ length: waterTarget }, (_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-sm ${i < log.hydration ? 'bg-sage-200' : 'bg-cream-200'}`}
                      />
                    ))}
                  </div>
                  <div className="text-[11px] text-ink-500 w-16 text-right shrink-0">{log.hydration} gl</div>
                </div>
              )}
              {(log.sleep > 0 || log.movement > 0) && (
                <div className="flex items-center gap-3 mt-1">
                  {log.sleep > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-ink-400">
                      <Moon className="w-3 h-3" />{log.sleep}h
                    </div>
                  )}
                  {log.movement > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-ink-400">
                      <Activity className="w-3 h-3" />{log.movement}m
                    </div>
                  )}
                </div>
              )}
              {symptomsLogged.length > 0 && (
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-cream-200/60">
                  {symptomsLogged.map(([id, val]) => (
                    <span key={id} className="text-base leading-none" title={id}>
                      {SYMPTOM_EMOJIS[id]?.[val - 1] ?? ''}
                    </span>
                  ))}
                </div>
              )}
              {log.note ? (
                <div className="text-[11px] text-ink-400/80 italic mt-1 line-clamp-2">"{log.note}"</div>
              ) : null}
            </div>
          ) : isToday ? (
            <div className="flex items-center gap-3">
              <div className="text-[11px] text-ink-400/70 italic">Nothing logged yet today.</div>
              {onGoToToday && (
                <button
                  type="button"
                  onClick={onGoToToday}
                  className="text-[11px] text-sage-600 underline decoration-dotted underline-offset-2 hover:text-sage-700 transition"
                >
                  Start tracking
                </button>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-ink-400/60 italic">Nothing logged</div>
          )}
        </div>
      </div>
    </Card>
  );
}

function LogboekView({ profile, onGoHome }) {
  const days = useMemo(() => {
    const out = [];
    const today = new Date();
    for (let offset = 0; offset < 14; offset++) {
      const d = new Date(today);
      d.setDate(today.getDate() - offset);
      const log     = loadLog(d);
      const state   = getCycleState(profile, d);
      const targets = getDailyTargets(profile, state.phase);
      out.push({ date: d, isToday: offset === 0, log, state, targets, hasData: logHasData(log) });
    }
    return out;
  }, [profile]);

  return (
    <div className="min-h-dvh px-5 pt-8 pb-28 max-w-md mx-auto">
      <header className="flex items-center justify-between mb-7 anim-fade-up">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Your journal</div>
          <h1 className="font-display text-[30px] leading-tight text-ink-700">Logboek</h1>
        </div>
        <button
          type="button"
          onClick={() => exportCSV(profile)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cream-100 border border-cream-200
                     text-ink-500 text-xs hover:bg-cream-200 hover:text-ink-700 transition min-h-[44px]"
          aria-label="Export CSV"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </header>
      <div className="space-y-3">
        {days.map((entry, i) => (
          <LogboekEntry key={i} {...entry} animDelay={i * 25} onGoToToday={onGoHome} />
        ))}
      </div>
      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">
        Showing last 14 days · Export includes 90 days
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Trend mini-charts                                                  */
/* ------------------------------------------------------------------ */

function SymptomTrendCard() {
  const weeks = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 4 }, (_, w) => {
      let count = 0;
      for (let d = 0; d < 7; d++) {
        const date = new Date(today);
        date.setDate(today.getDate() - (w * 7 + d));
        if (Object.values(loadLog(date).symptoms || {}).some(v => v > 0)) count++;
      }
      return count;
    }).reverse();
  }, []);

  if (!weeks.some(Boolean)) return null;

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '160ms' }}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">
        Symptomen per week
      </div>
      <div className="flex items-end gap-3">
        {weeks.map((count, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div className={`text-[11px] ${count > 0 ? 'text-ink-500' : 'text-ink-400/40'}`}>
              {count > 0 ? `${count}d` : '—'}
            </div>
            <div className="w-full bg-cream-200/60 rounded-t-md relative overflow-hidden" style={{ height: 56 }}>
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-700"
                style={{
                  height: `${(count / 7) * 100}%`,
                  background: 'linear-gradient(180deg, #A8BA98 0%, #6B8559 100%)',
                }}
              />
            </div>
            <div className="text-[10px] text-ink-400">{['4w', '3w', '2w', '1w'][i]}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
        Aantal dagen per week met minstens één symptoom gelogd.
      </p>
    </Card>
  );
}

const MOOD_ICONS  = ['😢', '😔', '😐', '🙂', '😄'];
const MOOD_LABELS = ['Somber', 'Neerslachtig', 'Neutraal', 'Goed', 'Geweldig'];

function MoodTrendCard() {
  const { topMoods, totalLogged } = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalLogged = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const mood = loadLog(d).symptoms?.mood;
      if (mood > 0) { counts[mood]++; totalLogged++; }
    }
    const topMoods = Object.entries(counts)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return { topMoods, totalLogged };
  }, []);

  if (totalLogged < 3) return null;

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '200ms' }}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">
        Stemming — laatste 30 dagen
      </div>
      <div className="flex gap-2 flex-wrap">
        {topMoods.map(([val, count]) => {
          const idx = Number(val) - 1;
          return (
            <div
              key={val}
              className="flex items-center gap-2 px-3 py-2 rounded-full bg-cream-100 border border-cream-200"
            >
              <span className="text-lg leading-none">{MOOD_ICONS[idx]}</span>
              <span className="text-xs text-ink-600">{MOOD_LABELS[idx]}</span>
              <span className="text-[10px] font-medium text-sage-600 bg-sage-50 border border-sage-200 px-1.5 py-0.5 rounded-full">
                {count}×
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function EnergyTrendCard() {
  const weeks = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 4 }, (_, w) => {
      const mins = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(today);
        date.setDate(today.getDate() - (w * 7 + d));
        const m = loadLog(date).movement;
        if (m > 0) mins.push(m);
      }
      return mins.length > 0
        ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)
        : 0;
    }).reverse();
  }, []);

  if (!weeks.some(Boolean)) return null;

  const maxVal = Math.max(...weeks, 1);

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '240ms' }}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">
        Gem. beweging per week
      </div>
      <div className="flex items-end gap-3">
        {weeks.map((avg, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div className={`text-[11px] ${avg > 0 ? 'text-ink-500' : 'text-ink-400/40'}`}>
              {avg > 0 ? `${avg}m` : '—'}
            </div>
            <div className="w-full bg-cream-200/60 rounded-t-md relative overflow-hidden" style={{ height: 56 }}>
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-700"
                style={{
                  height: `${(avg / maxVal) * 100}%`,
                  background: 'linear-gradient(180deg, #D9A188 0%, #B06849 100%)',
                }}
              />
            </div>
            <div className="text-[10px] text-ink-400">{['4w', '3w', '2w', '1w'][i]}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
        Gemiddelde activiteitstijd op dagen dat je bewogen hebt.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Insights / Statistics tab                                          */
/* ------------------------------------------------------------------ */

const SYMPTOM_LABELS = { energy: 'Energy', mood: 'Mood', cramps: 'Cramps', bloating: 'Bloating' };

function InsightsView({ profile }) {
  const today = useMemo(() => new Date(), []);

  const { avgCycle, topByPhase, streakRecord, cycleHistory } = useMemo(() => {
    const history = getCycleHistory(profile, 12);
    const avgCycle = history.length
      ? Math.round(history.reduce((sum, g) => sum + g.length, 0) / history.length)
      : null;

    // Symptom tallies per phase, last 90 days
    const tallies = {};
    for (const p of Object.values(PHASES)) tallies[p] = {};
    const scanDate = new Date(today);
    for (let i = 0; i < 90; i++) {
      const log = loadLog(scanDate);
      const state = getCycleState(profile, scanDate);
      for (const [sym, val] of Object.entries(log.symptoms || {})) {
        if (val > 0) {
          tallies[state.phase][sym] = (tallies[state.phase][sym] || 0) + 1;
        }
      }
      scanDate.setDate(scanDate.getDate() - 1);
    }

    const topByPhase = {};
    for (const [phase, counts] of Object.entries(tallies)) {
      const entries = Object.entries(counts);
      if (!entries.length) { topByPhase[phase] = null; continue; }
      entries.sort((a, b) => b[1] - a[1]);
      topByPhase[phase] = entries[0][0];
    }

    // Streak record — longest consecutive run in past 365 days
    let best = 0, run = 0;
    const rd = new Date(today);
    for (let i = 0; i < 365; i++) {
      if (logHasData(loadLog(rd))) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
      rd.setDate(rd.getDate() - 1);
    }

    return { avgCycle, topByPhase, streakRecord: best, cycleHistory: history };
  }, [profile, today]);

  const currentStreak = useMemo(() => {
    return getStreak(loadLog(today), today);
  }, [today]);

  const hasSymptomData = Object.values(topByPhase).some(v => v !== null);

  return (
    <div className="min-h-dvh px-5 pt-8 pb-28 max-w-md mx-auto">
      <header className="mb-7 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Your patterns</div>
        <h1 className="font-display text-[30px] leading-tight text-ink-700">Inzichten</h1>
      </header>

      {/* Streak card */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '40ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">Logging streak</div>
        <div className="flex items-end gap-8">
          <div>
            <div className="font-display text-[52px] text-ink-700 leading-none">
              {currentStreak}
            </div>
            <div className="text-xs text-ink-400 mt-1">Current (days)</div>
          </div>
          {streakRecord > 0 && (
            <div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-sage-500" />
                <div className="font-display text-[32px] text-sage-600 leading-none">
                  {streakRecord}
                </div>
              </div>
              <div className="text-xs text-ink-400 mt-1">Record</div>
            </div>
          )}
        </div>
        {currentStreak === 0 && (
          <p className="text-xs text-ink-400 mt-3 leading-relaxed">
            Log anything today to start your streak — even just a mood check counts.
          </p>
        )}
      </Card>

      {/* Cycle stats */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '80ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">Cycle overview</div>
        {cycleHistory.length >= 1 ? (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="font-display text-[38px] text-ink-700 leading-none">
                {avgCycle ?? '—'}
              </div>
              <div className="text-xs text-ink-400 mt-1">Avg cycle (days)</div>
            </div>
            <div>
              <div className="font-display text-[38px] text-ink-700 leading-none">
                {cycleHistory.length}
              </div>
              <div className="text-xs text-ink-400 mt-1">Cycles tracked</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-400 leading-relaxed">
            Log your period start on the home tab to unlock cycle statistics.
          </p>
        )}
      </Card>

      {/* Symptoms per phase */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">
          Most logged symptom per phase
        </div>
        {hasSymptomData ? (
          <div className="space-y-3.5">
            {Object.entries(PHASE_META).map(([phase, meta]) => {
              const top = topByPhase[phase];
              return (
                <div key={phase} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: meta.hue }}
                  />
                  <div className="text-xs text-ink-500 w-[76px] shrink-0">{meta.label}</div>
                  {top ? (
                    <div className="text-xs font-medium text-ink-700 bg-cream-100 px-2.5 py-1 rounded-full border border-cream-200">
                      {SYMPTOM_LABELS[top]}
                    </div>
                  ) : (
                    <div className="text-xs text-ink-400/60 italic">not enough data</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-ink-400 leading-relaxed">
            Track your symptoms daily to see patterns emerge across your cycle phases.
          </p>
        )}
      </Card>

      {/* Trend charts */}
      <SymptomTrendCard />
      <MoodTrendCard />
      <EnergyTrendCard />

      <div className="text-center text-[11px] text-ink-400 mt-4 mb-2">
        Gebaseerd op je laatste 90 dagen.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Root                                                               */
/* ------------------------------------------------------------------ */

function App() {
  const [profile, setProfile] = useState(() => loadProfile());
  const [tab, setTab]         = useState('home');
  const [view, setView]       = useState('main');

  // Settings (dark mode etc.)
  const [settings, setSettings] = useState(() => loadSettings());
  const darkMode = settings.darkMode ?? null; // null = follow system

  useEffect(() => {
    const apply = (isDark) => document.documentElement.classList.toggle('dark', isDark);
    if (darkMode !== null) { apply(darkMode); return; }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches);
    const handler = (e) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [darkMode]);

  const handleDarkModeChange = (val) => {
    const next = { ...settings, darkMode: val };
    setSettings(next);
    persistSettings(next);
  };

  // Toast
  const [toast, setToast] = useState(null); // { message, type }
  const showToast = (message, type = 'success') => setToast({ message, type });

  // JSON import
  const [importPending, setImportPending] = useState(null); // parsed JSON data

  const handleImportRequest = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!validateImportData(data)) {
          showToast('Ongeldig bestandsformaat', 'error');
          return;
        }
        setImportPending(data);
      } catch {
        showToast('Kon het bestand niet lezen', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = (mode) => {
    applyImport(importPending, mode);
    setImportPending(null);
    setProfile(loadProfile());
    showToast(mode === 'replace' ? 'Gegevens vervangen ✓' : 'Gegevens samengevoegd ✓');
  };

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'aura.profile') setProfile(loadProfile());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (!profile) return <Onboarding onComplete={setProfile} />;

  const updateProfile = (next) => {
    if (!next || next === profile) return;
    saveProfile(next);
    setProfile(next);
  };

  const handleReset = () => {
    if (confirm('Reset your Aura profile? Your daily logs will be kept.')) {
      clearProfile();
      setProfile(null);
      setView('main');
      setTab('home');
    }
  };

  if (view === 'settings') {
    return (
      <>
        <SettingsScreen
          profile={profile}
          onSave={updateProfile}
          onBack={() => setView('main')}
          onReset={handleReset}
          darkMode={darkMode}
          onDarkModeChange={handleDarkModeChange}
          onExportJSON={exportJSON}
          onImportRequest={handleImportRequest}
        />
        {importPending && (
          <ConfirmModal
            title="Gegevens importeren"
            message="Wil je de bestaande gegevens vervangen of samenvoegen met het importbestand?"
            onClose={() => setImportPending(null)}
            options={[
              { label: 'Samenvoegen', onClick: () => handleImportConfirm('merge') },
              { label: 'Vervangen', onClick: () => handleImportConfirm('replace'), primary: true },
            ]}
          />
        )}
        {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      </>
    );
  }

  return (
    <>
      <div key={tab} className="anim-tab-in">
        {tab === 'home' && (
          <Dashboard
            profile={profile}
            onUpdateProfile={updateProfile}
            onOpenSettings={() => setView('settings')}
          />
        )}
        {tab === 'logboek' && (
          <LogboekView profile={profile} onGoHome={() => setTab('home')} />
        )}
        {tab === 'stats' && <InsightsView profile={profile} />}
      </div>
      <BottomNav active={tab} onSelect={setTab} />
      <PWAInstallBanner />
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
