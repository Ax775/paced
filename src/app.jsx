/**
 * Aura — React app entry
 * ----------------------
 * Onboarding → dashboard with cycle engine, daily tracker, and insight.
 * All numbers flow from pure functions in src/lib/*; this file is just
 * the calm shell that arranges them.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Flower2, Leaf, Sun, Moon, Sparkles, ArrowRight, Settings,
  Check, Droplet, Wheat, Salad,
} from 'lucide-react';

import { getCycleState, PHASES, PHASE_META } from './lib/cycle.js';
import { getDailyTargets, ACTIVITY_LEVELS } from './lib/nutrition.js';
import { getDailyInsight } from './lib/insights.js';
import {
  loadProfile, saveProfile, clearProfile,
  loadLog, saveLog, isoDate,
} from './lib/storage.js';

/* ------------------------------------------------------------------ */
/*  Small presentational primitives                                    */
/* ------------------------------------------------------------------ */

const Card = ({ className = '', children }) => (
  <div className={`rounded-xl3 bg-cream-50/80 backdrop-blur-sm shadow-soft border border-cream-200/60 ${className}`}>
    {children}
  </div>
);

const Label = ({ children }) => (
  <label className="block text-[11px] uppercase tracking-[0.14em] text-ink-400 font-medium mb-2">
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

/**
 * Reactive wrapper around storage.loadLog / saveLog.
 * The `update(patch)` callback merges shallowly and persists immediately,
 * so every keystroke / tap is durable without explicit "save" buttons.
 */
function useDailyLog(date = new Date()) {
  const key = isoDate(date);
  const [log, setLog] = useState(() => loadLog(date));

  // If the date changes (e.g. midnight rollover in an open tab) re-hydrate.
  useEffect(() => { setLog(loadLog(date)); }, [key]); // eslint-disable-line

  const update = useCallback((patch) => {
    setLog((current) => {
      const next = { ...current, ...patch };
      if (patch.gut) next.gut = { ...current.gut, ...patch.gut };
      saveLog(date, next);
      return next;
    });
  }, [key]); // eslint-disable-line

  return [log, update];
}

/* ------------------------------------------------------------------ */
/*  Tracker primitives                                                 */
/* ------------------------------------------------------------------ */

/**
 * SoftProgress — calm progress bar.
 *
 * Below target: sage fill.
 * At target:    sage → terracotta gradient (a quiet "you got there").
 * Over target:  same gradient, capped at 100% width — never red, never
 *               a "you failed" colour. Aura is supportive by design.
 */
function SoftProgress({ value, target }) {
  const safeTarget = Math.max(1, target);
  const pct = Math.min(100, Math.round((value / safeTarget) * 100));
  const reached = value >= safeTarget;
  return (
    <div className="h-2 rounded-full bg-cream-200/80 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${pct}%`,
          background: reached
            ? 'linear-gradient(90deg, #87A074 0%, #C78264 100%)'
            : '#A8BA98',
        }}
      />
    </div>
  );
}

/** Pill button used for quick-add increments. */
function Chip({ children, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full bg-cream-100 border border-cream-200
                 text-ink-600 hover:bg-sage-100 hover:border-sage-200 hover:text-sage-700
                 active:scale-95 transition"
    >
      {children}
    </button>
  );
}

/**
 * Editable numeric value — tap to enter custom amount, otherwise driven
 * by the quick-add chips. We use a plain text input so iOS shows the
 * numeric keyboard via inputMode without spinner clutter.
 */
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

/**
 * One row of the tracker: label, current/target, progress bar, quick-add chips.
 * Designed to be re-used for any "log against a daily target" metric.
 */
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

/**
 * Hydration tracker rendered as a row of glass icons. Tap a glass to
 * "fill up to here", tap a filled one twice to clear it. Calmer than a
 * pair of +/- buttons and immediately legible at a glance.
 */
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

/** Gut health checklist — three soft toggles, no shame on missed items. */
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
              <div className="ml-auto text-[10px] uppercase tracking-wider text-sage-600">
                Done
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Onboarding                                                         */
/* ------------------------------------------------------------------ */

function Onboarding({ onComplete }) {
  const [form, setForm] = useState({
    name: '',
    age: '',
    weightKg: '',
    heightCm: '',
    activityLevel: 'moderate',
    cycleLength: 28,
    lastPeriodStart: new Date().toISOString().slice(0, 10),
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const canSubmit =
    form.age && form.weightKg && form.heightCm && form.lastPeriodStart;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const profile = {
      ...form,
      age:          Number(form.age),
      weightKg:     Number(form.weightKg),
      heightCm:     Number(form.heightCm),
      cycleLength:  Number(form.cycleLength),
      createdAt:    new Date().toISOString(),
    };
    saveProfile(profile);
    onComplete(profile);
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-5 py-10">
      <Card className="w-full max-w-md p-7 anim-fade-up">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-sage-100 flex items-center justify-center">
            <Flower2 className="w-5 h-5 text-sage-600" />
          </div>
          <div>
            <div className="font-display text-2xl text-ink-700 leading-none">Aura</div>
            <div className="text-xs text-ink-400 mt-1">A calmer way to nourish.</div>
          </div>
        </div>

        <h1 className="font-display text-[26px] text-ink-700 leading-tight mb-1">
          Let's set your baseline.
        </h1>
        <p className="text-sm text-ink-500 mb-6">
          Bio-individuality first. Nothing here is about restriction — just a gentle starting point.
        </p>

        <form onSubmit={submit} className="space-y-5">
          <Field>
            <Label>Name (optional)</Label>
            <input className={inputCx} value={form.name} onChange={set('name')} placeholder="e.g. Maya" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <Label>Age</Label>
              <input className={inputCx} type="number" min="14" max="70" value={form.age} onChange={set('age')} placeholder="28" />
            </Field>
            <Field>
              <Label>Cycle length</Label>
              <input className={inputCx} type="number" min="21" max="45" value={form.cycleLength} onChange={set('cycleLength')} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <Label>Weight (kg)</Label>
              <input className={inputCx} type="number" min="30" max="200" value={form.weightKg} onChange={set('weightKg')} placeholder="62" />
            </Field>
            <Field>
              <Label>Height (cm)</Label>
              <input className={inputCx} type="number" min="120" max="220" value={form.heightCm} onChange={set('heightCm')} placeholder="168" />
            </Field>
          </div>

          <Field>
            <Label>Activity level</Label>
            <div className="grid grid-cols-1 gap-2">
              {ACTIVITY_LEVELS.map((lvl) => {
                const active = form.activityLevel === lvl.id;
                return (
                  <button
                    type="button"
                    key={lvl.id}
                    onClick={() => setForm((f) => ({ ...f, activityLevel: lvl.id }))}
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

          <Field>
            <Label>First day of your last period</Label>
            <input className={inputCx} type="date" value={form.lastPeriodStart} onChange={set('lastPeriodStart')} />
          </Field>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full mt-2 rounded-xl bg-sage-500 text-cream-50 py-3.5 font-medium tracking-wide
                       hover:bg-sage-600 transition disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            Begin <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard (scaffold)                                               */
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

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"  stopColor="#A8BA98" />
            <stop offset="100%" stopColor="#C78264" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#EDE6D3" strokeWidth="14" fill="none" />
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

function Dashboard({ profile, onReset }) {
  const state   = useMemo(() => getCycleState(profile), [profile]);
  const targets = useMemo(() => getDailyTargets(profile, state.phase), [profile, state.phase]);
  const insight = useMemo(() => getDailyInsight(state.phase), [state.phase]);
  const PhaseIcon = PHASE_ICONS[state.phase];

  // Daily tracker state, persisted to LocalStorage on every change.
  const [log, updateLog] = useDailyLog();

  // Hydration target in glasses (250 ml each), derived from the L target.
  const waterGlassTarget = Math.max(6, Math.round(targets.hydrationL * 4));

  const addProtein  = (g)    => updateLog({ protein:  Math.min(99999, log.protein  + g) });
  const setProtein  = (g)    => updateLog({ protein:  g });
  const addCalories = (kcal) => updateLog({ calories: Math.min(99999, log.calories + kcal) });
  const setCalories = (kcal) => updateLog({ calories: kcal });
  const setWater    = (g)    => updateLog({ hydration: Math.max(0, Math.min(waterGlassTarget, g)) });
  const toggleGut   = (id)   => updateLog({ gut: { [id]: !log.gut[id] } });

  return (
    <div className="min-h-dvh px-5 py-8 max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-7 anim-fade-up">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Good day{profile.name ? `, ${profile.name}` : ''}</div>
          <h1 className="font-display text-[30px] leading-tight text-ink-700">Your Aura</h1>
        </div>
        <button
          onClick={onReset}
          aria-label="Settings"
          className="w-10 h-10 rounded-full bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-500 hover:text-ink-700 transition"
        >
          <Settings className="w-4 h-4" />
        </button>
      </header>

      {/* Cycle ring + phase label */}
      <Card className="p-6 mb-5 anim-fade-up" >
        <div className="flex flex-col items-center">
          <CycleRing state={state} />
          <div className="flex items-center gap-2 mt-5">
            <PhaseIcon className="w-4 h-4" style={{ color: state.phaseMeta.hue }} />
            <div className="font-display text-xl text-ink-700">{state.phaseMeta.label}</div>
            <span className="text-ink-400">·</span>
            <div className="text-sm text-ink-500">{state.phaseMeta.subtitle}</div>
          </div>
          <p className="text-center text-sm text-ink-500 mt-3 leading-relaxed px-4">
            {state.phaseMeta.blurb}
          </p>
        </div>
        <div className="mt-6">
          <PhaseTimeline state={state} />
        </div>
      </Card>

      {/* Today's tracker — interactive, persisted */}
      <Card className="p-6 mb-5 anim-fade-up">
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

      {/* Gut health checklist */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Gut health</div>
          <div className="text-[11px] text-ink-400">
            {Object.values(log.gut).filter(Boolean).length} of 3
          </div>
        </div>
        <GutChecklist gut={log.gut} onToggle={toggleGut} />
      </Card>

      {/* Nutrient focus */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-2">Nutrient focus</div>
        <div className="font-display text-xl text-ink-700 mb-1">{targets.focus.headline}</div>
        <p className="text-sm text-ink-500 leading-relaxed mb-4">{targets.focus.why}</p>
        <div className="flex flex-wrap gap-2">
          {targets.focus.foods.map((f) => (
            <span
              key={f}
              className="text-xs px-3 py-1.5 rounded-full bg-cream-100 border border-cream-200 text-ink-600"
            >
              {f}
            </span>
          ))}
        </div>
      </Card>

      {/* Daily insight */}
      <Card className="p-6 anim-fade-up">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          Daily insight
        </div>
        <p className="font-display text-[19px] leading-snug text-ink-700">
          {insight.text}
        </p>
      </Card>

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">
        Aura · v0.2 · tracker
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Root                                                               */
/* ------------------------------------------------------------------ */

function App() {
  const [profile, setProfile] = useState(() => loadProfile());

  // Keep profile reactive if another tab edits it.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'aura.profile') setProfile(loadProfile());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (!profile) return <Onboarding onComplete={setProfile} />;

  return (
    <Dashboard
      profile={profile}
      onReset={() => {
        if (confirm('Reset your Aura profile? Your daily logs will be kept.')) {
          clearProfile();
          setProfile(null);
        }
      }}
    />
  );
}

createRoot(document.getElementById('root')).render(<App />);
