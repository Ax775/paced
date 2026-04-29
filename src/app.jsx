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
  Check, Droplet, Wheat, Salad, ChevronLeft, ChevronRight, BookOpen, Activity,
  BarChart2, Download, X, TrendingUp, Undo2,
} from 'lucide-react';

import {
  getCycleState, PHASES, PHASE_META,
  logPeriodStart, unlogPeriodStart, isPeriodLoggedOn,
  getCycleHistory,
} from './lib/cycle.js';
import { getDailyTargets, ACTIVITY_LEVELS } from './lib/nutrition.js';
import { getDailyInsight, TIPS } from './lib/insights.js';
import {
  loadProfile, saveProfile, clearProfile,
  loadLog, saveLog, isoDate, emptyLog, logHasData, getStreak,
} from './lib/storage.js';

/* ------------------------------------------------------------------ */
/*  Small presentational primitives                                    */
/* ------------------------------------------------------------------ */

const Card = ({ className = '', style, children }) => (
  <div
    className={`rounded-xl3 bg-cream-50/80 backdrop-blur-sm shadow-soft border border-cream-200/60 ${className}`}
    style={style}
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

// Loads and persists the log for a given calendar day.
// `key` (ISO date string) is the stable dependency — two `new Date()` calls on
// the same calendar day share the same key but are different object references,
// so we key effects on the string rather than the Date object to avoid spurious
// re-fetches. Currently only called with today's date (Dashboard), so this is safe.
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

  // Overwrite the entire log with a snapshot (used by the undo toast).
  const restore = useCallback((snapshot) => {
    saveLog(date, snapshot);
    setLog(snapshot);
  }, [key]); // eslint-disable-line

  return [log, update, restore];
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
  if (!daysUntil || daysUntil <= 0) return 'Binnenkort';
  if (daysUntil === 1) return 'Morgen';
  const d = new Date();
  d.setDate(d.getDate() + daysUntil);
  const month = d.toLocaleDateString('nl', { month: 'short' });
  return `${month} ${d.getDate()} · over ${daysUntil} dagen`;
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
      `"${(log.note || '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`,
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
/*  Apple Health XML export (feature 7)                               */
/* ------------------------------------------------------------------ */

/* Escape a value for use inside an XML double-quoted attribute. */
function xmlAttr(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function exportAppleHealth(profile, onEmpty) {
  const today = new Date();
  const records = [];

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const log = loadLog(d);
    const iso = d.toISOString();
    const dateStr = d.toISOString().slice(0, 10);

    // Next calendar day — used as the end date for overnight records.
    const nextD = new Date(d);
    nextD.setDate(d.getDate() + 1);
    const nextStr = nextD.toISOString().slice(0, 10);

    if (log.calories > 0) {
      records.push(`    <Record type="HKQuantityTypeIdentifierDietaryEnergyConsumed" sourceName="Aura" unit="kcal" creationDate="${xmlAttr(iso)}" startDate="${dateStr}T00:00:00" endDate="${dateStr}T23:59:59" value="${xmlAttr(log.calories)}"/>`);
    }
    if (log.protein > 0) {
      records.push(`    <Record type="HKQuantityTypeIdentifierDietaryProtein" sourceName="Aura" unit="g" creationDate="${xmlAttr(iso)}" startDate="${dateStr}T00:00:00" endDate="${dateStr}T23:59:59" value="${xmlAttr(log.protein)}"/>`);
    }
    if (log.hydration > 0) {
      records.push(`    <Record type="HKQuantityTypeIdentifierDietaryWater" sourceName="Aura" unit="mL" creationDate="${xmlAttr(iso)}" startDate="${dateStr}T00:00:00" endDate="${dateStr}T23:59:59" value="${xmlAttr(log.hydration * 250)}"/>`);
    }
    if (log.sleep > 0) {
      // Sleep starts previous evening (22:00) and ends next morning.
      const sleepHH = String(log.sleep).padStart(2, '0');
      records.push(`    <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Aura" unit="count" creationDate="${xmlAttr(iso)}" startDate="${dateStr}T22:00:00" endDate="${nextStr}T${sleepHH}:00:00" value="HKCategoryValueSleepAnalysisAsleep"/>`);
    }
    if (log.movement > 0) {
      const est = Math.round(log.movement * 5);
      const movMM = String(log.movement % 60).padStart(2, '0');
      const movHH = String(Math.floor(log.movement / 60)).padStart(2, '0');
      records.push(`    <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Aura" unit="kcal" creationDate="${xmlAttr(iso)}" startDate="${dateStr}T08:00:00" endDate="${dateStr}T${movHH}:${movMM}:00" value="${xmlAttr(est)}"/>`);
    }
  }

  if (records.length === 0) {
    onEmpty?.();
    return;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
  <!ATTLIST Record type CDATA #IMPLIED>
]>
<HealthData locale="nl_NL">
  <ExportDate value="${today.toISOString()}"/>
  <Me HKCharacteristicTypeIdentifierDateOfBirth="" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexFemale"/>
${records.join('\n')}
</HealthData>`;

  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aura-health-export.xml';
  a.click();
  URL.revokeObjectURL(url);
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
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Water</div>
        </div>
        <div className="font-display text-ink-700 text-[20px] leading-none">
          {glasses}<span className="text-ink-400 text-sm"> / {target} glazen</span>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {slots.map((slot) => {
          const filled = slot <= glasses;
          return (
            <button
              key={slot}
              type="button"
              aria-label={`Stel water in op ${slot} glazen`}
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
        Elk glas ≈ 250 ml · tik om te vullen, tik het laatste gevulde glas om te wissen.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Symptom tracker                                                    */
/* ------------------------------------------------------------------ */

const SYMPTOM_META = [
  { id: 'energy',   label: 'Energie',    icons: ['😴','🥱','😐','🙂','⚡'], hint: '1 = uitgeput, 5 = energiek' },
  { id: 'mood',     label: 'Stemming',   icons: ['😢','😔','😐','🙂','😄'], hint: '1 = slecht, 5 = geweldig' },
  { id: 'cramps',   label: 'Krampen',    icons: ['🔥','😣','😐','🙂','✨'], hint: '1 = intens, 5 = geen' },
  { id: 'bloating', label: 'Opgeblazen', icons: ['🎈','😮','😐','🙂','✨'], hint: '1 = ernstig, 5 = geen' },
];

function SymptomTracker({ log, onUpdate }) {
  const syms = log.symptoms || {};
  const anyLogged = Object.values(syms).some(v => v > 0);

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '80ms' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Hoe voel je je?</div>
        {anyLogged && (
          <div className="text-[11px] text-sage-600 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full">
            Gelogd
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
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Recente cycli</div>
        <div className="text-[11px] text-sage-600 bg-sage-100 px-2.5 py-1 rounded-full">
          gem. {avg} dagen
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
              aria-label={`${gap.length} dagen cyclus gestart op ${gap.start}`}
            />
            <div className="text-[10px] text-ink-400 uppercase tracking-wider mt-2">
              {shortMonth(gap.end)}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-ink-400 text-center mt-4 leading-relaxed">
        Cycluslengte varieert van nature — Aura gebruikt jouw ritme, niet een standaard van 28.
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
          Voeding deze week
        </div>
        <div className="text-[11px] text-ink-400">Afgelopen 7 dagen</div>
      </div>

      <WeekBarRow label="Calorieën" values={days.map((d) => d.pctCalories)} />
      <WeekBarRow label="Eiwitten"  values={days.map((d) => d.pctProtein)}  />
      <WeekBarRow label="Water"     values={days.map((d) => d.pctWater)}    />

      <div className="flex gap-1.5 mt-4">
        {days.map((d) => (
          <div key={isoDate(d.date)} className="flex-1 flex flex-col items-center">
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
        {days.map((d) => (
          <div
            key={`phase-${isoDate(d.date)}`}
            className="flex-1 h-[3px] rounded-full"
            style={{ background: d.phaseHue, opacity: 0.55 }}
            title={PHASE_META[d.phase].label}
          />
        ))}
      </div>

      <p className="text-[11px] text-ink-400 text-center mt-4 leading-relaxed">
        Doelen verschuiven met je cyclus — de balken meten per fase.
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
          Menstruatie gelogd vandaag
        </div>
        <button
          type="button"
          onClick={handleUndo}
          className="text-xs text-ink-400 hover:text-ink-600 underline decoration-dotted underline-offset-4 transition"
        >
          ongedaan maken
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
        Mijn menstruatie begon vandaag
      </button>
      {cyclesTracked > 0 && (
        <div className="text-[10px] uppercase tracking-wider text-ink-400/80">
          {cyclesTracked} {cyclesTracked === 1 ? 'cyclus' : 'cycli'} bijgehouden
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
    { id: 'probiotics', label: 'Probiotica',      hint: 'Yoghurt, kefir, capsule…',              icon: Sparkles },
    { id: 'fiber',      label: 'Vezelrijke maaltijd', hint: 'Groenten, peulvruchten, volkoren',  icon: Wheat },
    { id: 'fermented',  label: 'Gefermenteerd',  hint: 'Zuurkool, kimchi, miso, kombucha',      icon: Salad },
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
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Slaap gisteravond</div>
        </div>
        {hours > 0 && (
          <div className="font-display text-ink-700 text-[20px] leading-none">
            {hours}<span className="text-ink-400 text-sm">u</span>
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
              aria-label={`${h} uur slaap`}
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
        Goede slaap ondersteunt hormonale balans en herstel.
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
    menstrual:  'Een rustige wandeling of stretching is genoeg.',
    follicular: 'Goed moment om de intensiteit op te bouwen.',
    ovulatory:  'Piekenergie — ga ervoor!',
    luteal:     'Luister naar je lichaam; matig is ideaal.',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-ink-400" />
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Beweging vandaag</div>
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
              aria-label={`${m} minuten bewegen`}
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
            wis
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
      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2.5">Notitie van vandaag</div>
      <textarea
        value={note}
        onChange={(e) => onChange(e.target.value.slice(0, 280))}
        placeholder="Iets wat je wilt onthouden over vandaag…"
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
          <div className="text-sm font-medium text-ink-700">Aura aan beginscherm toevoegen</div>
          <div className="text-xs text-ink-400 mt-0.5">Werkt offline, voelt als een app.</div>
        </div>
        <button
          type="button"
          onClick={handleInstall}
          className="px-4 py-2 rounded-xl bg-sage-500 text-cream-50 text-xs font-medium hover:bg-sage-600 transition shrink-0 min-h-[44px]"
        >
          Installeer
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
/*  In-app reminder banner (feature 3)                                */
/* ------------------------------------------------------------------ */

function ReminderBanner({ profile }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!profile?.notifEnabled || !profile?.notifTime) return;
    const today = new Date();
    const todayLog = loadLog(today);
    if (logHasData(todayLog)) return;

    const [h, m] = (profile.notifTime || '20:00').split(':').map(Number);
    const now = today.getHours() * 60 + today.getMinutes();
    const target = h * 60 + m;
    if (now >= target) setVisible(true);
  }, [profile]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-safe">
      <div className="max-w-md mx-auto mt-3 bg-sage-50/95 backdrop-blur-md border border-sage-200 rounded-2xl shadow-soft p-4 flex items-center gap-3 anim-slide-up">
        <div className="text-xl">🌸</div>
        <div className="flex-1">
          <div className="text-sm font-medium text-ink-700">Vergeet niet te loggen!</div>
          <div className="text-xs text-ink-400 mt-0.5">Je hebt vandaag nog niets bijgehouden.</div>
        </div>
        <button type="button" onClick={() => setVisible(false)}
          aria-label="Herinnering sluiten"
          className="p-1 text-ink-400 hover:text-ink-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
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
    cycleLength:     28,
    mensDuration:    5,
    lastPeriodStart: new Date().toISOString().slice(0, 10),
    age:             '',
    weightKg:        '',
    heightCm:        '',
    activityLevel:   'moderate',
  });

  const setF  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setFE = (k)    => (e) => setF(k, e.target.value);

  const goTo = (n) => {
    setStep(n);
    setAnimKey(k => k + 1);
  };

  const complete = () => {
    const parsedDate  = new Date(form.lastPeriodStart);
    const validDate   = form.lastPeriodStart && !isNaN(parsedDate.getTime());
    const profile = {
      name:            form.name.trim(),
      cycleLength:     Number(form.cycleLength),
      mensDuration:    Number(form.mensDuration) || 5,
      lastPeriodStart: validDate ? form.lastPeriodStart : new Date().toISOString().slice(0, 10),
      age:             Number(form.age)      || 28,
      weightKg:        Number(form.weightKg) || 62,
      heightCm:        Number(form.heightCm) || 168,
      activityLevel:   form.activityLevel,
      onboardingDone:  true,
      createdAt:       new Date().toISOString(),
    };
    saveProfile(profile);
    onComplete(profile);
  };

  const dots = (
    <div className="flex justify-center gap-2 mb-8">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="rounded-full transition-all duration-400"
          style={{
            width:      i === step ? 24 : 8,
            height:     8,
            background: i === step ? '#6B8559' : i < step ? '#A8BA98' : 'var(--progress-track)',
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

        {/* Step 0 — Naam */}
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
              Hoi, ik ben Aura.
            </h1>
            <p className="text-sm text-ink-500 text-center leading-relaxed mb-8">
              Jouw rustige gids voor cyclus-bewuste voeding, energie en welzijn.
            </p>
            <div className="mb-6">
              <label className="block text-sm text-ink-600 mb-2.5" htmlFor="onboard-name">
                Hoe heet je?
              </label>
              <input
                id="onboard-name"
                className={inputCx}
                value={form.name}
                onChange={setFE('name')}
                placeholder="Jouw naam (optioneel)"
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
              {form.name.trim()
                ? `Fijn je te ontmoeten, ${form.name.trim().split(' ')[0]} ✓`
                : 'Laten we beginnen'}
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-[11px] text-ink-400 text-center leading-relaxed mt-5">
              Aura bewaart alles uitsluitend lokaal op je apparaat — geen accounts, geen tracking.
              <br />
              Volledige privacyverklaring &amp; medische disclaimer vind je in Instellingen.
            </p>
          </Card>
        )}

        {/* Step 1 — Cyclus instellen */}
        {step === 1 && (
          <Card key={animKey} className={cardCx}>
            <h2 className="font-display text-[28px] text-ink-700 leading-tight mb-2">
              {form.name.trim()
                ? `${form.name.trim().split(' ')[0]}, vertel over je cyclus.`
                : 'Vertel over je cyclus.'}
            </h2>
            <p className="text-sm text-ink-500 mb-7 leading-relaxed">
              Hier begint de personalisatie — alles komt hieruit voort.
            </p>

            <div className="space-y-6">
              <Field>
                <Label htmlFor="onboard-last-period">Wanneer begon je laatste menstruatie?</Label>
                <input
                  id="onboard-last-period"
                  className={inputCx}
                  type="date"
                  value={form.lastPeriodStart}
                  onChange={setFE('lastPeriodStart')}
                />
              </Field>

              <Field>
                <Label>Typische cycluslengte</Label>
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
                    <span className="text-sm text-ink-400 ml-1.5">dagen</span>
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
                  28 dagen is gemiddeld — pas aan naar jouw ritme (21–45)
                </div>
              </Field>

              <Field>
                <Label>Hoe lang duurt je menstruatie?</Label>
                <div className="flex items-center gap-4 mt-1">
                  <button
                    type="button"
                    onClick={() => setF('mensDuration', Math.max(2, form.mensDuration - 1))}
                    className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                               text-ink-600 hover:bg-sage-100 hover:border-sage-200
                               transition text-xl flex items-center justify-center"
                  >−</button>
                  <div className="flex-1 text-center">
                    <span className="font-display text-[36px] text-ink-700 leading-none">
                      {form.mensDuration}
                    </span>
                    <span className="text-sm text-ink-400 ml-1.5">dagen</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setF('mensDuration', Math.min(10, form.mensDuration + 1))}
                    className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                               text-ink-600 hover:bg-sage-100 hover:border-sage-200
                               transition text-xl flex items-center justify-center"
                  >+</button>
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
                <ChevronLeft className="w-4 h-4" /> Terug
              </button>
              <button
                type="button"
                onClick={() => goTo(2)}
                className="flex-1 rounded-xl bg-sage-500 text-cream-50 py-3 font-medium
                           hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm"
              >
                Volgende <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        {/* Step 2 — Lichaam & activiteit */}
        {step === 2 && (
          <Card key={animKey} className={cardCx}>
            <h2 className="font-display text-[28px] text-ink-700 leading-tight mb-2">
              Jouw lichaam.
            </h2>
            <p className="text-sm text-ink-500 mb-7 leading-relaxed">
              Dit bepaalt je calorie- en voedingsdoelen. Laat leeg om de standaardwaarden te gebruiken.
            </p>

            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <Field>
                  <Label htmlFor="onboard-age">Leeftijd</Label>
                  <input
                    id="onboard-age"
                    className={inputCx}
                    type="number" min="14" max="70"
                    value={form.age}
                    onChange={setFE('age')}
                    placeholder="28"
                  />
                </Field>
                <Field>
                  <Label htmlFor="onboard-weight">Gewicht kg</Label>
                  <input
                    id="onboard-weight"
                    className={inputCx}
                    type="number" min="30" max="200"
                    value={form.weightKg}
                    onChange={setFE('weightKg')}
                    placeholder="62"
                  />
                </Field>
                <Field>
                  <Label htmlFor="onboard-height">Lengte cm</Label>
                  <input
                    id="onboard-height"
                    className={inputCx}
                    type="number" min="120" max="220"
                    value={form.heightCm}
                    onChange={setFE('heightCm')}
                    placeholder="168"
                  />
                </Field>
              </div>

              <Field>
                <Label>Activiteitsniveau</Label>
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

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => goTo(1)}
                className="px-4 py-3 rounded-xl bg-cream-100 border border-cream-200 text-ink-500
                           hover:bg-cream-200 transition flex items-center gap-1.5 text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> Terug
              </button>
              <button
                type="button"
                onClick={() => goTo(3)}
                className="flex-1 rounded-xl bg-sage-500 text-cream-50 py-3 font-medium
                           hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm"
              >
                Volgende <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        {/* Step 3 — Welkomstscherm */}
        {step === 3 && (
          <Card key={animKey} className={cardCx}>
            <div className="flex justify-center mb-5">
              <div className="text-5xl">🌸</div>
            </div>
            <h2 className="font-display text-[28px] text-ink-700 text-center leading-tight mb-2">
              {form.name.trim() ? `Welkom, ${form.name.trim().split(' ')[0]}!` : 'Welkom bij Aura!'}
            </h2>
            <p className="text-sm text-ink-500 text-center leading-relaxed mb-6">
              Dit vind je in de app:
            </p>
            <div className="space-y-2 mb-7">
              {[
                { emoji: '🌸', label: 'Vandaag', desc: 'Volg voeding, slaap en symptomen' },
                { emoji: '🥗', label: 'Voeding', desc: 'Recepten afgestemd op je fase' },
                { emoji: '📓', label: 'Logboek', desc: 'Jouw dagelijkse geschiedenis' },
                { emoji: '📊', label: 'Inzichten', desc: 'Patronen in je cyclus en data' },
                { emoji: '⚙️', label: 'Instellingen', desc: 'Doelen, herinneringen en meer' },
              ].map(({ emoji, label, desc }) => (
                <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-cream-100/70">
                  <span className="text-xl">{emoji}</span>
                  <div>
                    <div className="text-sm font-medium text-ink-700">{label}</div>
                    <div className="text-xs text-ink-400">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => goTo(2)}
                className="px-4 py-3 rounded-xl bg-cream-100 border border-cream-200 text-ink-500
                           hover:bg-cream-200 transition flex items-center gap-1.5 text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> Terug
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

function SettingsScreen({ profile, onSave, onReset, onBack, theme = 'auto', onThemeChange, onOpenLegal }) {
  const [form, setForm] = useState({
    name:          profile.name          || '',
    age:           profile.age           || '',
    weightKg:      profile.weightKg      || '',
    heightCm:      profile.heightCm      || '',
    activityLevel: profile.activityLevel || 'moderate',
    cycleLength:   profile.cycleLength   || 28,
  });
  const [goals, setGoals] = useState({
    calories:  (profile.goals?.calories)  || '',
    protein:   (profile.goals?.protein)   || '',
    hydration: (profile.goals?.hydration) || '',
    movement:  (profile.goals?.movement)  || '',
    sleep:     (profile.goals?.sleep)     || '',
  });
  const [notifEnabled, setNotifEnabled] = useState(profile.notifEnabled || false);
  const [notifTime, setNotifTime]       = useState(profile.notifTime    || '20:00');
  const [toast, setToast]     = useState('');
  const [saved, setSaved]     = useState(false);
  const timerRef      = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    clearTimeout(toastTimerRef.current);
  }, []);

  const setF  = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setG  = (k, v) => setGoals((g) => ({ ...g, [k]: v }));

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 3000);
  };

  const handleNotifToggle = async () => {
    if (notifEnabled) {
      setNotifEnabled(false);
      return;
    }
    if (!('Notification' in window)) {
      showToast('Notificaties worden niet ondersteund in deze browser');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setNotifEnabled(true);
      showToast('Notificaties ingeschakeld ✓');
    } else {
      showToast('Notificaties geblokkeerd');
    }
  };

  const handleSave = () => {
    const age      = Number(form.age)      || profile.age;
    const weightKg = Number(form.weightKg) || profile.weightKg;
    const heightCm = Number(form.heightCm) || profile.heightCm;

    if (age      && (age      < 12  || age      > 80 )) { showToast('Leeftijd moet tussen 12 en 80 jaar liggen');      return; }
    if (weightKg && (weightKg < 30  || weightKg > 250)) { showToast('Gewicht moet tussen 30 en 250 kg liggen');        return; }
    if (heightCm && (heightCm < 120 || heightCm > 220)) { showToast('Lengte moet tussen 120 en 220 cm liggen');        return; }

    const cleanGoals = {};
    Object.entries(goals).forEach(([k, v]) => { if (Number(v) > 0) cleanGoals[k] = Number(v); });
    onSave({
      ...profile,
      name:          form.name,
      age,
      weightKg,
      heightCm,
      activityLevel: form.activityLevel,
      cycleLength:   Number(form.cycleLength),
      goals:         cleanGoals,
      notifEnabled,
      notifTime,
    });
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setSaved(false); }, 800);
  };

  return (
    <div className="min-h-dvh px-5 py-8 pb-28 max-w-md mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-ink-700 text-cream-50 text-sm shadow-lg anim-fade-up whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="flex items-center gap-3 mb-8 anim-fade-up">
        <button
          type="button"
          onClick={onBack}
          aria-label="Terug"
          className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                     flex items-center justify-center text-ink-500 hover:text-ink-700 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-[28px] text-ink-700 leading-tight">Instellingen</h1>
      </header>

      {/* Profile fields */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-5">Profiel</div>
        <div className="space-y-5">
          <Field>
            <Label htmlFor="settings-name">Naam</Label>
            <input
              id="settings-name"
              className={inputCx}
              value={form.name}
              onChange={(e) => setF('name', e.target.value)}
              placeholder="Jouw naam (optioneel)"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field>
              <Label htmlFor="settings-age">Leeftijd</Label>
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
              <Label htmlFor="settings-weight">Gewicht kg</Label>
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
              <Label htmlFor="settings-height">Lengte cm</Label>
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
            <Label>Cycluslengte</Label>
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
                <span className="text-sm text-ink-400 ml-1.5">dagen</span>
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
            <Label>Activiteitsniveau</Label>
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

      {/* Dagelijkse doelen */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">Dagelijkse doelen</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'calories',  label: 'Calorieën',  unit: 'kcal', placeholder: '1800' },
            { key: 'protein',   label: 'Eiwitdoel',   unit: 'g',    placeholder: '100' },
            { key: 'hydration', label: 'Waterdoel',   unit: 'ml',   placeholder: '2000' },
            { key: 'movement',  label: 'Bewegingsdoel', unit: 'min', placeholder: '30' },
            { key: 'sleep',     label: 'Slaapdoel',   unit: 'uur',  placeholder: '8' },
          ].map(({ key, label, unit, placeholder }) => (
            <Field key={key}>
              <Label>{label}</Label>
              <div className="relative">
                <input
                  className={inputCx + ' pr-10'}
                  type="number"
                  min="0"
                  value={goals[key]}
                  onChange={(e) => setG(key, e.target.value)}
                  placeholder={placeholder}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">{unit}</span>
              </div>
            </Field>
          ))}
        </div>
        <p className="text-[11px] text-ink-400 mt-3">Laat leeg om automatische doelen te gebruiken.</p>
      </Card>

      {/* Herinneringen */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">Herinneringen</div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-medium text-ink-700">Dagelijkse herinnering</div>
            <div className="text-xs text-ink-400 mt-0.5">Push-notificatie om te loggen</div>
          </div>
          <button
            type="button"
            onClick={handleNotifToggle}
            className={`relative w-12 h-6 rounded-full transition ${notifEnabled ? 'bg-sage-500' : 'bg-cream-300'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${notifEnabled ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
        {notifEnabled && (
          <Field>
            <Label>Tijdstip</Label>
            <input
              type="time"
              className={inputCx}
              value={notifTime}
              onChange={(e) => setNotifTime(e.target.value)}
            />
          </Field>
        )}
      </Card>

      {/* Weergave */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">Weergave</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'auto',  label: 'Automatisch', Icon: null },
            { id: 'light', label: 'Licht',        Icon: Sun  },
            { id: 'dark',  label: 'Donker',       Icon: Moon },
          ].map(({ id, label, Icon }) => {
            const active = theme === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onThemeChange && onThemeChange(id)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${
                  active
                    ? 'bg-sage-100 border-sage-300 text-sage-700'
                    : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
                }`}
              >
                {Icon
                  ? <Icon className="w-4 h-4" />
                  : <span className="w-4 h-4 rounded-full border-2 border-current" style={{ borderStyle: 'dashed' }} />
                }
                <span className="text-[11px] font-medium leading-none">{label}</span>
              </button>
            );
          })}
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
        {saved ? <><Check className="w-4 h-4" /> Opgeslagen!</> : 'Wijzigingen opslaan'}
      </button>

      {/* Export */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Exporteren</div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => exportCSV(profile)}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-cream-200 bg-cream-50
                       text-ink-600 text-sm hover:border-sage-200 hover:bg-sage-50 transition"
          >
            <Download className="w-4 h-4" />
            CSV exporteren (90 dagen)
          </button>
          <button
            type="button"
            onClick={() => exportAppleHealth(profile, () => showToast('Geen data om te exporteren'))}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-cream-200 bg-cream-50
                       text-ink-600 text-sm hover:border-sage-200 hover:bg-sage-50 transition"
          >
            <Download className="w-4 h-4" />
            Exporteren naar Apple Health (XML)
          </button>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="p-6 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Gevarenzone</div>
        <p className="text-sm text-ink-500 mb-4 leading-relaxed">
          Profiel resetten en opnieuw beginnen. Dagelijkse logs blijven bewaard.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-xl border border-terracotta-200 bg-terracotta-100/50
                     text-terracotta-600 py-3 text-sm font-medium
                     hover:bg-terracotta-100 active:scale-[0.98] transition"
        >
          Profiel resetten
        </button>
      </Card>

      {/* Legal */}
      <button
        type="button"
        onClick={() => onOpenLegal && onOpenLegal()}
        className="w-full mt-5 px-4 py-3 rounded-xl border border-cream-200 bg-cream-50
                   text-ink-600 text-sm hover:border-sage-200 hover:bg-sage-50 transition
                   flex items-center justify-center gap-2"
      >
        Privacy &amp; disclaimer
      </button>

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">Aura · v1.2</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Legal: privacy + medical disclaimer + imprint                      */
/* ------------------------------------------------------------------ */

function LegalView({ onBack }) {
  return (
    <div className="min-h-dvh px-5 py-8 pb-28 max-w-md mx-auto">
      <header className="flex items-center gap-3 mb-8 anim-fade-up">
        <button
          type="button"
          onClick={onBack}
          aria-label="Terug"
          className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                     flex items-center justify-center text-ink-500 hover:text-ink-700 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-[28px] text-ink-700 leading-tight">Privacy &amp; disclaimer</h1>
      </header>

      {/* Medische disclaimer */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Medische disclaimer</div>
        <p className="text-sm text-ink-600 leading-relaxed mb-3">
          Aura is een hulpmiddel voor zelfreflectie en bewustwording — geen medisch hulpmiddel.
          De app vervangt geen consult bij een (huis)arts, gynaecoloog, voedingsdeskundige of andere zorgverlener.
        </p>
        <p className="text-sm text-ink-600 leading-relaxed mb-3">
          Berekeningen voor cyclus, calorieën en eiwitten zijn schattingen op basis van algemene formules.
          Ze kunnen afwijken van jouw persoonlijke situatie en zijn niet bedoeld als diagnose of behandeling.
        </p>
        <p className="text-sm text-ink-600 leading-relaxed">
          Maak je je zorgen over je gezondheid, je menstruatiecyclus, je voeding of je welzijn?
          Neem dan altijd contact op met een gekwalificeerde zorgverlener.
        </p>
      </Card>

      {/* Wat slaan we op */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Wat slaan we op</div>
        <p className="text-sm text-ink-600 leading-relaxed mb-3">
          Alle gegevens die je in Aura invoert blijven <strong>uitsluitend op dit apparaat</strong>,
          opgeslagen in de lokale opslag van je browser:
        </p>
        <ul className="text-sm text-ink-600 leading-relaxed list-disc pl-5 space-y-1 mb-3">
          <li>Profiel: naam, leeftijd, gewicht, lengte, activiteitsniveau</li>
          <li>Cyclus: lengte, duur menstruatie, datums die je logt</li>
          <li>Dagelijks logboek: voeding, water, slaap, beweging, symptomen, notities</li>
          <li>Voorkeuren: thema (licht/donker), herinneringstijd</li>
        </ul>
        <p className="text-sm text-ink-600 leading-relaxed">
          Er wordt <strong>geen data naar servers gestuurd</strong>. We zien je gegevens niet, niemand anders ook.
        </p>
      </Card>

      {/* Wat doen we niet */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Wat we niet doen</div>
        <ul className="text-sm text-ink-600 leading-relaxed space-y-2">
          <li>✗ Geen accounts, geen inlog, geen wachtwoorden</li>
          <li>✗ Geen tracking-cookies of -pixels</li>
          <li>✗ Geen analytics-diensten</li>
          <li>✗ Geen advertenties</li>
          <li>✗ Geen verkoop, verhuur of delen van data met derden</li>
          <li>✗ Geen synchronisatie tussen apparaten (data blijft op dit apparaat)</li>
        </ul>
      </Card>

      {/* Externe diensten */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Externe diensten</div>
        <p className="text-sm text-ink-600 leading-relaxed">
          De productieversie van Aura laadt <strong>geen externe scripts, lettertypes of CDN's</strong>
          tijdens gebruik. Alle code, stijlen en lettertypes worden samen met de app meegestuurd
          en vanuit dezelfde host geserveerd. Tijdens het bezoeken van Aura wordt dus alleen
          verbinding gemaakt met de Aura-host zelf — niet met Google, niet met derde partijen.
        </p>
      </Card>

      {/* Jouw rechten */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Jouw rechten (AVG / GDPR)</div>
        <p className="text-sm text-ink-600 leading-relaxed mb-3">
          Onder de Europese privacywet heb je recht op inzage, correctie en verwijdering van je gegevens.
          Omdat alle data alleen op dit apparaat staat, heb je dit volledig zelf in handen:
        </p>
        <ul className="text-sm text-ink-600 leading-relaxed list-disc pl-5 space-y-1">
          <li>Inzage en correctie: open Instellingen om alles te zien en aan te passen</li>
          <li>Verwijdering profiel: Instellingen → Profiel resetten</li>
          <li>Verwijdering álles: wis de site-data via je browserinstellingen</li>
        </ul>
      </Card>

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">
        Aura · v1.2 · laatst bijgewerkt 28 april 2026
      </div>
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
              style={{ background: active ? meta.hue : 'var(--progress-track)' }}
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
  const insight = useMemo(() => getDailyInsight(state.phase, new Date(), profile.name ? profile.name.split(' ')[0] : ''), [state.phase, profile.name]);
  const PhaseIcon = PHASE_ICONS[state.phase];

  const [log, commitLog, restoreLog] = useDailyLog();

  // ── Undo toast ───────────────────────────────────────────────────
  // Captures the pre-update log so the user can revert the last save
  // (or burst of saves) within 5s.
  const [toast, setToast]                       = useState(null);
  const [toastDismissing, setToastDismissing]   = useState(false);
  const toastTimerRef     = useRef(null);
  const toastFadeTimerRef = useRef(null);
  const toastSnapshotRef  = useRef(null);

  useEffect(() => () => {
    if (toastTimerRef.current)     clearTimeout(toastTimerRef.current);
    if (toastFadeTimerRef.current) clearTimeout(toastFadeTimerRef.current);
  }, []);

  const updateLog = useCallback((patch) => {
    // If a toast is already showing, keep its older snapshot — that way
    // undo reverts the entire burst (e.g. typing in the journal note),
    // not just the most recent keystroke.
    const snapshot = toastSnapshotRef.current ?? log;
    toastSnapshotRef.current = snapshot;

    commitLog(patch);

    setToast({ snapshot });
    setToastDismissing(false);
    if (toastTimerRef.current)     clearTimeout(toastTimerRef.current);
    if (toastFadeTimerRef.current) clearTimeout(toastFadeTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastDismissing(true);
      toastFadeTimerRef.current = setTimeout(() => {
        setToast(null);
        setToastDismissing(false);
        toastSnapshotRef.current = null;
      }, 220);
    }, 5000);
  }, [log, commitLog]);

  const handleUndo = useCallback(() => {
    if (!toast) return;
    restoreLog(toast.snapshot);
    if (toastTimerRef.current)     clearTimeout(toastTimerRef.current);
    if (toastFadeTimerRef.current) clearTimeout(toastFadeTimerRef.current);
    toastSnapshotRef.current = null;
    setToast(null);
    setToastDismissing(false);
  }, [toast, restoreLog]);

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
          <div className="flex items-center gap-2">
            <Flower2 className="w-5 h-5 text-sage-500" />
            <h1 className="font-display text-[26px] leading-tight text-ink-700">Aura</h1>
          </div>
          {displayName && (
            <div className="text-sm text-ink-500 mt-0.5">Hoi {displayName} 👋</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <div className="text-[11px] text-sage-700 bg-sage-50 border border-sage-200 px-2.5 py-1.5 rounded-full whitespace-nowrap anim-streak-pulse">
              🌿 {streak} {streak === 1 ? 'dag' : 'dagen'}
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
              <span className="text-[11px] text-ink-400">Volgende periode</span>
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

      {/* Goal progress rings */}
      <GoalRings log={log} goals={profile.goals} targets={targets} />

      {/* Symptom tracker */}
      <SymptomTracker log={log} onUpdate={updateLog} />

      {/* Recent cycles (only renders once there's ≥1 completed cycle) */}
      <CycleHistoryStrip profile={profile} />

      {/* Today's nourishment */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '160ms' }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Voeding vandaag</div>
          {targets.calorieDelta > 0 && (
            <div className="text-[11px] text-sage-600 bg-sage-100 px-2.5 py-1 rounded-full">
              +{targets.calorieDelta} kcal voor {state.phaseMeta.label.toLowerCase()}
            </div>
          )}
        </div>
        <div className="space-y-6">
          <TrackerRow
            label="Calorieën"
            value={log.calories}
            target={targets.calories}
            unit="kcal"
            increments={[100, 250, 500]}
            onAdd={addCalories}
            onSet={setCalories}
          />
          <TrackerRow
            label="Eiwitten"
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
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-5">Welzijn</div>
        <div className="space-y-6">
          <SleepTracker hours={log.sleep} onChange={setSleep} />
          <div className="h-px bg-cream-200/70" />
          <MovementTracker minutes={log.movement} onChange={setMovement} phase={state.phase} />
        </div>
      </Card>

      {/* Tip van de dag */}
      <TipVanDeDag phase={state.phase} log={log} goals={profile.goals} targets={targets} name={profile.name} />

      {/* Weekly nourishment history */}
      <WeeklyHistoryStrip profile={profile} todayLog={log} />

      {/* Gut health checklist */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '240ms' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Darmgezondheid</div>
          <div className="text-[11px] text-ink-400">
            {Object.values(log.gut).filter(Boolean).length} of 3
          </div>
        </div>
        <GutChecklist gut={log.gut} onToggle={toggleGut} />
      </Card>

      {/* Nutrient focus */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '280ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-2">Nutriëntenfocus</div>
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

      {/* Journal note */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '340ms' }}>
        <JournalNote note={log.note} onChange={setNote} />
      </Card>

      {/* Daily insight */}
      <Card className="p-6 anim-fade-up" style={{ animationDelay: '380ms' }}>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          Dagelijks inzicht
        </div>
        <p className="font-display text-[19px] leading-snug text-ink-700">
          {insight.text}
        </p>
      </Card>

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">
        Aura · v1.2
      </div>

      <UndoToast visible={!!toast} dismissing={toastDismissing} onUndo={handleUndo} />
    </div>
  );
}

function UndoToast({ visible, dismissing, onUndo }) {
  if (!visible) return null;
  return (
    <div
      className={`fixed left-0 right-0 bottom-20 z-50 px-4 pointer-events-none
                  ${dismissing
                    ? 'opacity-0 transition-opacity duration-200'
                    : 'opacity-100 anim-slide-up'}`}
      role="status"
      aria-live="polite"
    >
      <div className="max-w-md mx-auto pointer-events-auto">
        <button
          type="button"
          onClick={onUndo}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                     bg-ink-700/95 text-cream-50 text-sm font-medium shadow-lg backdrop-blur-md
                     hover:bg-ink-700 active:scale-[0.99] transition min-h-[44px]"
        >
          <Undo2 className="w-4 h-4" />
          Ongedaan maken
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bottom navigation                                                  */
/* ------------------------------------------------------------------ */

function BottomNav({ active, onSelect }) {
  const tabs = [
    { id: 'home',      label: 'Vandaag',     icon: Flower2   },
    { id: 'voeding',   label: 'Voeding',     icon: Salad     },
    { id: 'logboek',   label: 'Logboek',     icon: BookOpen  },
    { id: 'stats',     label: 'Inzichten',   icon: BarChart2 },
    { id: 'settings',  label: 'Stel in',   icon: Settings  },
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

const SYMPTOM_ICONS = Object.fromEntries(SYMPTOM_META.map(s => [s.id, s.icons]));

const DAY_NAMES   = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
const MONTH_NAMES = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

function formatLogDate(date, isToday) {
  if (isToday) return 'Vandaag';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Gisteren';
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

function LogboekEntry({ date, isToday, log, state, targets, hasData, animDelay, onGoToToday }) {
  const dateLabel = formatLogDate(date, isToday);
  const syms = log.symptoms || {};
  const symptomsLogged = Object.entries(syms).filter(([, v]) => v > 0);
  const waterTarget = Math.max(6, Math.round(targets.hydrationL * 4));

  return (
    <Card
      className={`p-4 anim-fade-up transition-opacity ${!hasData ? 'opacity-40' : ''}`}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex flex-col items-center w-16">
          <div className={`text-[11px] font-medium leading-tight text-center ${isToday ? 'text-sage-600' : 'text-ink-500'}`}>
            {dateLabel}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: state.phaseMeta.hue }} />
            <div className="text-[11px] text-ink-500">{state.phaseMeta.label}</div>
            {isToday && (
              <div className="text-[10px] bg-sage-100 text-sage-700 px-1.5 py-0.5 rounded-full">Vandaag</div>
            )}
          </div>

          {hasData ? (
            <div className="space-y-1.5">
              {log.calories > 0 && (
                <div className="flex items-center gap-2">
                  <div className="text-[11px] text-ink-400 w-14 shrink-0">Cal.</div>
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
                  <div className="text-[11px] text-ink-400 w-14 shrink-0">Eiwit</div>
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
                      {SYMPTOM_ICONS[id]?.[val - 1] ?? ''}
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
              <div className="text-[11px] text-ink-400/70 italic">Nog niets gelogd vandaag.</div>
              {onGoToToday && (
                <button
                  type="button"
                  onClick={onGoToToday}
                  className="text-[11px] text-sage-600 underline decoration-dotted underline-offset-2 hover:text-sage-700 transition"
                >
                  Begin met loggen
                </button>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-ink-400/60 italic">Niets gelogd</div>
          )}
        </div>
      </div>
    </Card>
  );
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function LogboekView({ profile, onGoHome }) {
  const today = useMemo(() => new Date(), []);
  const currentMonthStart = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today]
  );
  const [activeMonth, setActiveMonth] = useState(currentMonthStart);

  const isCurrentMonth =
    activeMonth.getFullYear() === currentMonthStart.getFullYear() &&
    activeMonth.getMonth()    === currentMonthStart.getMonth();

  const days = useMemo(() => {
    const out = [];
    const year  = activeMonth.getFullYear();
    const month = activeMonth.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const startDay = isCurrentMonth ? today.getDate() : lastDayOfMonth;

    for (let day = startDay; day >= 1; day--) {
      const d = new Date(year, month, day);
      const log     = loadLog(d);
      const state   = getCycleState(profile, d);
      const targets = getDailyTargets(profile, state.phase);
      const isToday = isCurrentMonth && day === today.getDate();
      out.push({ date: d, isToday, log, state, targets, hasData: logHasData(log) });
    }
    return out;
  }, [profile, activeMonth, isCurrentMonth, today]);

  const goPrevMonth = () => {
    setActiveMonth(new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1));
  };
  const goNextMonth = () => {
    if (isCurrentMonth) return;
    setActiveMonth(new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1));
  };

  const prevMonthDate = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1);
  const nextMonthDate = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1);

  const monthLabel = capitalize(
    activeMonth.toLocaleDateString('nl', {
      month: 'long',
      year: activeMonth.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    })
  );
  const prevMonthLabel = capitalize(prevMonthDate.toLocaleDateString('nl', { month: 'long' }));
  const nextMonthLabel = capitalize(nextMonthDate.toLocaleDateString('nl', { month: 'long' }));

  return (
    <div className="min-h-dvh px-5 pt-8 pb-28 max-w-md mx-auto">
      <header className="flex items-center justify-between mb-7 anim-fade-up">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Jouw dagboek</div>
          <h1 className="font-display text-[30px] leading-tight text-ink-700">Logboek</h1>
        </div>
        <button
          type="button"
          onClick={() => exportCSV(profile)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cream-100 border border-cream-200
                     text-ink-500 text-xs hover:bg-cream-200 hover:text-ink-700 transition min-h-[44px]"
          aria-label="Exporteer CSV"
        >
          <Download className="w-3.5 h-3.5" />
          Exporteer
        </button>
      </header>

      {/* Month navigator */}
      <div className="flex items-center justify-between gap-2 mb-5 anim-fade-up">
        <button
          type="button"
          onClick={goPrevMonth}
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-cream-100 border border-cream-200
                     text-ink-500 text-xs hover:bg-cream-200 hover:text-ink-700 transition min-h-[44px]"
          aria-label={`Ga naar ${prevMonthLabel}`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          {prevMonthLabel}
        </button>
        <div className="font-display text-lg text-ink-700 truncate px-1" aria-live="polite">
          {monthLabel}
        </div>
        <button
          type="button"
          onClick={goNextMonth}
          disabled={isCurrentMonth}
          className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-xs transition min-h-[44px] ${
            isCurrentMonth
              ? 'bg-cream-50 border-cream-100 text-ink-400/40 cursor-not-allowed'
              : 'bg-cream-100 border-cream-200 text-ink-500 hover:bg-cream-200 hover:text-ink-700'
          }`}
          aria-label={isCurrentMonth ? 'Geen toekomstige maanden' : `Ga naar ${nextMonthLabel}`}
        >
          {nextMonthLabel}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {days.every(d => !d.hasData) ? (
        <div className="text-center py-16 text-ink-400 anim-fade-up">
          <p className="text-4xl mb-3">🌱</p>
          <p className="text-sm mb-1">
            {isCurrentMonth ? 'Nog geen logs bijgehouden.' : `Geen logs in ${monthLabel}.`}
          </p>
          {isCurrentMonth && (
            <p className="text-xs text-ink-400/70">Log je eerste dag om je voortgang te zien.</p>
          )}
          {isCurrentMonth && onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="mt-5 px-5 py-2.5 rounded-full bg-sage-500 text-cream-50 text-sm font-medium hover:bg-sage-600 transition"
            >
              Begin met loggen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3" key={isoDate(activeMonth)}>
          {days.map((entry, i) => (
            <LogboekEntry key={isoDate(entry.date)} {...entry} animDelay={i * 25} onGoToToday={onGoHome} />
          ))}
        </div>
      )}
      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">
        Export omvat 90 dagen
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Insights / Statistics tab                                          */
/* ------------------------------------------------------------------ */

const SYMPTOM_LABELS = { energy: 'Energie', mood: 'Stemming', cramps: 'Krampen', bloating: 'Opgeblazen' };

function InsightsView({ profile, onOpenCharts }) {
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
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Jouw patronen</div>
        <h1 className="font-display text-[30px] leading-tight text-ink-700">Inzichten</h1>
      </header>

      {/* Streak card */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '40ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">Log-reeks</div>
        <div className="flex items-end gap-8">
          <div>
            <div className="font-display text-[52px] text-ink-700 leading-none">
              {currentStreak}
            </div>
            <div className="text-xs text-ink-400 mt-1">Huidig (dagen)</div>
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
            Log vandaag iets om je reeks te starten — zelfs een stemmingscheck telt mee.
          </p>
        )}
      </Card>

      {/* Cycle stats */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '80ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">Cyclusoverzicht</div>
        {cycleHistory.length >= 1 ? (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="font-display text-[38px] text-ink-700 leading-none">
                {avgCycle ?? '—'}
              </div>
              <div className="text-xs text-ink-400 mt-1">Gem. cyclus (dagen)</div>
            </div>
            <div>
              <div className="font-display text-[38px] text-ink-700 leading-none">
                {cycleHistory.length}
              </div>
              <div className="text-xs text-ink-400 mt-1">Cycli bijgehouden</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-400 leading-relaxed">
            Log je menstruatiestart op het tabblad Vandaag om cyclusstatistieken te ontgrendelen.
          </p>
        )}
      </Card>

      {/* Symptoms per phase */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">
          Meest gelogd symptoom per fase
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
                    <div className="text-xs text-ink-400/60 italic">te weinig data</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-ink-400 leading-relaxed">
            Log dagelijks je symptomen om patronen te ontdekken in je cyclusfasen.
          </p>
        )}
      </Card>

      {/* Open all charts */}
      <button
        type="button"
        onClick={onOpenCharts}
        className="w-full flex items-center justify-between px-5 py-4 rounded-xl bg-cream-100 border border-cream-200 hover:border-sage-200 transition mb-5 anim-fade-up"
      >
        <div className="text-sm font-medium text-ink-700">Alle grafieken</div>
        <ArrowRight className="w-4 h-4 text-ink-400" />
      </button>

      <div className="text-center text-[11px] text-ink-400 mt-4 mb-2">
        Gebaseerd op de laatste 90 dagen.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Goal progress rings (feature 2)                                   */
/* ------------------------------------------------------------------ */

function GoalRing({ value, target, label, unit, color }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = setTimeout(() => setMounted(true), 150); return () => clearTimeout(id); }, []);

  const r = 26;
  const c = 2 * Math.PI * r;
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  const displayRatio = mounted ? ratio : 0;
  const pctVal = Math.round(ratio * 100);
  const strokeColor = ratio >= 1 ? '#6B8559' : ratio >= 0.5 ? '#C78264' : '#D9A188';
  const opacity = ratio >= 1 ? 1 : 0.85;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 absolute inset-0">
          <circle cx="32" cy="32" r={r} className="goal-ring-track" stroke="#EDE6D3" strokeWidth="5" fill="none" />
          <circle cx="32" cy="32" r={r} stroke={strokeColor} strokeWidth="5" fill="none"
            strokeLinecap="round" strokeOpacity={opacity}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - displayRatio)}
            style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.22,1,0.36,1)' }} />
        </svg>
        {ratio >= 1
          ? <span className="text-[14px] font-semibold relative z-10 text-sage-600">✓</span>
          : <span className="text-[11px] font-medium text-ink-700 relative z-10">{pctVal}%</span>
        }
      </div>
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
        <div className="text-[10px] text-ink-500">{value}/{target}{unit}</div>
      </div>
    </div>
  );
}

function GoalRings({ log, goals, targets }) {
  const g = goals || {};
  const proteinTarget  = g.protein   || targets.protein;
  const hydrationTarget = g.hydration || (targets.hydrationL * 4 * 250);
  const movementTarget = g.movement  || 30;
  const sleepTarget    = g.sleep     || 8;

  return (
    <Card className="p-5 mb-5 anim-fade-up">
      <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">Dagelijkse doelen</div>
      <div className="grid grid-cols-4 gap-2">
        <GoalRing value={log.calories}          target={g.calories  || targets.calories} label="Kcal"    unit="" />
        <GoalRing value={log.protein}           target={proteinTarget}                   label="Eiwit"   unit="g" />
        <GoalRing value={log.hydration * 250}   target={hydrationTarget}                label="Water"   unit="ml" />
        <GoalRing value={log.movement}          target={movementTarget}                  label="Beweging" unit="m" />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Smart tip of the day (feature 6)                                  */
/* ------------------------------------------------------------------ */


function TipVanDeDag({ phase, log, goals, targets, name }) {
  const tips = TIPS[phase] || TIPS.follicular;
  const dayOfWeek = new Date().getDay();
  const tipFn = tips[dayOfWeek % tips.length];

  const displayName = name ? name.split(' ')[0] : '';
  let tip = tipFn(displayName);

  const yLog = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return loadLog(d);
  }, []); // loaded once — yesterday's log doesn't change during a session
  const proteinTarget = goals?.protein || targets.protein;
  const hydrationTarget = goals?.hydration || (targets.hydrationL * 4 * 250);

  if (yLog.protein > 0 && yLog.protein < proteinTarget * 0.7) {
    tip = `Je haalde gisteren minder eiwit${displayName ? `, ${displayName}` : ''} — probeer vandaag ${proteinTarget}g te bereiken 💪`;
  } else if (yLog.hydration > 0 && yLog.hydration * 250 < hydrationTarget * 0.7) {
    const litres = (hydrationTarget / 1000).toFixed(1);
    tip = `Je dronk gisteren gemiddeld ${(yLog.hydration * 0.25).toFixed(1)}L — probeer vandaag ${litres}L te halen 💧`;
  }

  return (
    <Card className="p-5 mb-5 anim-fade-up">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-2">
        <Sparkles className="w-3.5 h-3.5" />
        Tip van de dag
      </div>
      <p className="text-sm text-ink-600 leading-relaxed">{tip}</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Phase recipes (feature 5)                                         */
/* ------------------------------------------------------------------ */

const PHASE_RECIPES = {
  menstrual: [
    { emoji: '🍲', name: 'Linzensoep', desc: 'Verwarmend en ijzerrijk', time: '30 min',
      ingredients: ['Rode linzen', 'Wortel', 'Ui', 'Knoflook', 'Kurkuma', 'Groentebouillon'],
      steps: ['Ui en knoflook fruiten, wortel en linzen toevoegen met bouillon.', 'Zacht koken 20 min, blenderen en op smaak brengen met kurkuma en zout.'] },
    { emoji: '🥣', name: 'Rode bietenstoofpot', desc: 'Aardend en vol antioxidanten', time: '45 min',
      ingredients: ['Rode bieten', 'Kikkererwten', 'Tomaten', 'Ui', 'Kaneel', 'Olijfolie'],
      steps: ['Bieten en ui 10 min bakken in olie, dan tomaten en kikkererwten erbij.', 'Sudderen tot bieten zacht zijn, afsluiten met kaneel en verse kruiden.'] },
    { emoji: '🍵', name: 'Gemberrijst met tofu', desc: 'Milde kruiden, verterend', time: '25 min',
      ingredients: ['Zilvervliesrijst', 'Tofu', 'Verse gember', 'Sojasaus', 'Sesam', 'Lente-ui'],
      steps: ['Tofu goudbruin bakken met gember en sojasaus.', 'Serveren over rijst met sesam en lente-ui.'] },
  ],
  follicular: [
    { emoji: '🥗', name: 'Spinaziesalade', desc: 'Licht, fris en vol ijzer', time: '10 min',
      ingredients: ['Spinazie', 'Avocado', 'Granaatappelzaad', 'Pompoenpitten', 'Citroendressing', 'Fetakaas'],
      steps: ['Spinazie en avocado mengen, granaatappelzaad en pompoenpitten toevoegen.', 'Besprenkelen met citroendressing en feta.'] },
    { emoji: '🥤', name: 'Groene smoothiebowl', desc: 'Energiek en voedingsrijk', time: '10 min',
      ingredients: ['Bevroren banaan', 'Spinazie', 'Mango', 'Kokosmelk', 'Chiazaad', 'Granola'],
      steps: ['Banaan, spinazie, mango en kokosmelk blenden tot glad.', 'Gieten in kom, bestrooien met chiazaad en granola.'] },
    { emoji: '🌮', name: 'Kip-avocadowrap', desc: 'Eiwitrijk en verzadigend', time: '15 min',
      ingredients: ['Kipstoofvlees', 'Avocado', 'Volkoren tortilla', 'Rucola', 'Limoen', 'Koriander'],
      steps: ['Kip met limoen en koriander op smaak brengen.', 'Serveren in tortilla met avocado en rucola.'] },
  ],
  ovulatory: [
    { emoji: '🥦', name: 'Broccolisalade met zalm', desc: 'Antiontsteking en eiwitrijk', time: '20 min',
      ingredients: ['Broccoli', 'Zalm', 'Walnoten', 'Citroen', 'Olijfolie', 'Knoflook'],
      steps: ['Broccoli 5 min stomen, zalm 10 min in de oven op 200°C.', 'Mengen met walnoten, citroen en olijfolie.'] },
    { emoji: '🫙', name: 'Hummus met rauwkost', desc: 'Rauwe groenten, vol vezels', time: '5 min',
      ingredients: ['Kikkererwten hummus', 'Wortel', 'Komkommer', 'Paprika', 'Selderij', 'Olijven'],
      steps: ['Groenten in sticks snijden.', 'Serveren met hummus en olijven.'] },
    { emoji: '🍳', name: 'Eiwitrijke omelet', desc: 'Sterk, simpel en snel', time: '10 min',
      ingredients: ['3 eieren', 'Paprika', 'Champignons', 'Spinazie', 'Feta', 'Kruiden'],
      steps: ['Groenten kort aanfruiten, dan eieren erover gieten.', 'Bedekken met feta en kruiden, vouwen en serveren.'] },
  ],
  luteal: [
    { emoji: '🍠', name: 'Zoete aardappelcurry', desc: 'Complexe koolhydraten, troostend', time: '35 min',
      ingredients: ['Zoete aardappel', 'Kikkererwten', 'Kokosmelk', 'Currypasta', 'Spinazie', 'Rijst'],
      steps: ['Zoete aardappel en kikkererwten 5 min bakken met currypasta.', 'Kokosmelk toevoegen, 20 min sudderen, spinazie erbij en serveren met rijst.'] },
    { emoji: '🍫', name: 'Haver-choco-bites', desc: 'Magnesiumrijke snack', time: '15 min',
      ingredients: ['Havervlokken', 'Pindakaas', 'Pure chocolade 85%', 'Honing', 'Pompoenpitten', 'Zeezout'],
      steps: ['Alles mengen, kleine balletjes rollen en 10 min in de koelkast leggen.', 'Optioneel bedekken met gesmolten chocolade.'] },
    { emoji: '🌰', name: 'Pompoenrisotto', desc: 'Verwarmend en voedzaam', time: '40 min',
      ingredients: ['Risottorijst', 'Pompoen', 'Parmezaan', 'Ui', 'Witte wijn', 'Bouillon'],
      steps: ['Ui glazig fruiten, rijst toevoegen, dan wijn en bouillon schep voor schep.', 'Pompoen roerbakken en erdoor mengen met parmezaan.'] },
  ],
};

function PhaseRecipes({ phase }) {
  const [expanded, setExpanded] = useState(null);
  const recipes = PHASE_RECIPES[phase] || PHASE_RECIPES.follicular;
  const phaseLabels = { menstrual: 'Menstruatie', follicular: 'Folliculair', ovulatory: 'Ovulatie', luteal: 'Luteaal' };

  return (
    <Card className="p-6 mb-5 anim-fade-up">
      <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">
        Recepten voor jouw fase · {phaseLabels[phase]}
      </div>
      <div className="space-y-3">
        {recipes.map((recipe) => {
          const open = expanded === recipe.name;
          return (
            <div key={recipe.name}>
              <button
                type="button"
                onClick={() => setExpanded(open ? null : recipe.name)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition active:scale-[0.99] ${
                  open ? 'bg-sage-50 border-sage-200' : 'bg-cream-50 border-cream-200 hover:border-sage-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{recipe.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-700">{recipe.name}</div>
                    <div className="text-xs text-ink-400 mt-0.5">{recipe.desc}</div>
                  </div>
                  <div className="text-[10px] text-ink-400 shrink-0">{recipe.time}</div>
                </div>
              </button>
              {open && (
                <div className="mt-1 px-4 py-4 rounded-xl bg-cream-100/60 border border-cream-200">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2">Ingrediënten</div>
                  <ul className="space-y-1 mb-4">
                    {recipe.ingredients.map((ing) => (
                      <li key={ing} className="flex items-center gap-2 text-xs text-ink-600">
                        <span className="w-1 h-1 rounded-full bg-sage-400 shrink-0" />
                        {ing}
                      </li>
                    ))}
                  </ul>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2">Bereiding</div>
                  {recipe.steps.map((step, si) => (
                    <div key={si} className="flex gap-2 text-xs text-ink-600 mb-1.5">
                      <span className="text-sage-500 font-medium shrink-0">{si + 1}.</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Extended charts (feature 4)                                        */
/* ------------------------------------------------------------------ */

function ExtendedCharts({ profile }) {
  const [days, setDays] = useState(30);
  const today = useMemo(() => new Date(), []);

  const data = useMemo(() => {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const log = loadLog(d);
      const state = getCycleState(profile, d);
      out.push({ date: d, log, phase: state.phase, label: d.getDate() });
    }
    return out;
  }, [profile, days, today]);

  const avgCal = (phase) => {
    const rows = data.filter(d => d.phase === phase && d.log.calories > 0);
    if (!rows.length) return 0;
    return rows.reduce((s, d) => s + d.log.calories, 0) / rows.length;
  };
  const lutealAvg = avgCal('luteal');
  const follicularAvg = avgCal('follicular');
  const showCorrelation = lutealAvg > 0 && follicularAvg > 0 && lutealAvg > follicularAvg * 1.1;

  const maxCal  = Math.max(...data.map(d => d.log.calories),  1);
  const maxProt = Math.max(...data.map(d => d.log.protein),   1);
  const maxSlp  = Math.max(...data.map(d => d.log.sleep),     1);

  const W = 320;
  const chartH = 80;
  const barW = Math.max(2, Math.floor((W - 8) / data.length) - 1);

  const phaseColor = { menstrual: '#C78264', follicular: '#87A074', ovulatory: '#6B8559', luteal: '#B06849' };

  const moodCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  data.forEach(d => { if (d.log.symptoms?.mood > 0) moodCounts[d.log.symptoms.mood]++; });
  const maxMood = Math.max(...Object.values(moodCounts), 1);

  return (
    <div className="space-y-5">
      {/* Day toggle */}
      <div className="flex gap-2">
        {[30, 90].map(n => (
          <button key={n} type="button" onClick={() => setDays(n)}
            className={`px-4 py-2 rounded-full text-sm transition ${days === n ? 'bg-sage-500 text-cream-50' : 'bg-cream-100 border border-cream-200 text-ink-600 hover:border-sage-200'}`}>
            {n} dagen
          </button>
        ))}
      </div>

      {showCorrelation && (
        <div className="px-4 py-3 rounded-xl bg-sage-50 border border-sage-200 text-sm text-sage-700">
          🧠 Je eet meer in de Luteaal fase — normaal!
        </div>
      )}

      {/* Calorie line chart */}
      <Card className="p-5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-3">Calorieën</div>
        <svg width="100%" viewBox={`0 0 ${W} ${chartH}`} preserveAspectRatio="none">
          {data.map((d, i) => {
            const x = 4 + i * ((W - 8) / (data.length - 1 || 1));
            const y = chartH - (d.log.calories / maxCal) * (chartH - 4) - 2;
            return i === 0 ? null : (
              <line key={i}
                x1={4 + (i-1) * ((W-8)/(data.length-1||1))}
                y1={chartH - (data[i-1].log.calories/maxCal)*(chartH-4)-2}
                x2={x} y2={y}
                stroke={phaseColor[d.phase]} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
            );
          })}
        </svg>
      </Card>

      {/* Protein bar chart */}
      <Card className="p-5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-3">Eiwit (g)</div>
        <svg width="100%" viewBox={`0 0 ${W} ${chartH}`} preserveAspectRatio="none">
          {data.map((d, i) => {
            const h = (d.log.protein / maxProt) * (chartH - 4);
            const x = 4 + i * (barW + 1);
            return <rect key={i} x={x} y={chartH - h - 2} width={barW} height={Math.max(1, h)}
              fill={phaseColor[d.phase]} opacity="0.7" rx="1" />;
          })}
        </svg>
      </Card>

      {/* Sleep area chart */}
      <Card className="p-5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-3">Slaap (uur)</div>
        <svg width="100%" viewBox={`0 0 ${W} ${chartH}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="sleep-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#87A074" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#87A074" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {data.length > 1 && (() => {
            const pts = data.map((d, i) => {
              const x = 4 + i * ((W-8)/(data.length-1));
              const y = chartH - (d.log.sleep / maxSlp) * (chartH-4) - 2;
              return `${x},${y}`;
            });
            const areaBottom = data.map((d, i) => {
              const x = 4 + i * ((W-8)/(data.length-1));
              return `${x},${chartH-2}`;
            }).reverse();
            return <>
              <polyline points={pts.join(' ')} fill="none" stroke="#87A074" strokeWidth="1.5" opacity="0.9" />
              <polygon points={`${pts.join(' ')} ${areaBottom.join(' ')}`} fill="url(#sleep-grad)" />
            </>;
          })()}
        </svg>
      </Card>

      {/* Mood frequency bar chart */}
      <Card className="p-5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-3">Stemmingsfrequentie</div>
        <div className="flex items-end gap-2 h-16">
          {[1,2,3,4,5].map(n => {
            const emojis = ['😢','😔','😐','🙂','😄'];
            const h = moodCounts[n] > 0 ? Math.max(8, (moodCounts[n] / maxMood) * 56) : 4;
            return (
              <div key={n} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[10px] text-ink-400">{moodCounts[n]}</div>
                <div className="w-full rounded-t-lg bg-sage-200" style={{ height: h }} />
                <div className="text-base">{emojis[n-1]}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Voeding tab (stub — filled in by feature 5)                       */
/* ------------------------------------------------------------------ */

function VoedingView({ profile }) {
  const state = useMemo(() => getCycleState(profile), [profile]);
  const targets = useMemo(() => getDailyTargets(profile, state.phase), [profile, state.phase]);
  return (
    <div className="min-h-dvh px-5 pt-8 pb-28 max-w-md mx-auto">
      <header className="mb-7 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Jouw fase</div>
        <h1 className="font-display text-[30px] leading-tight text-ink-700">Voeding</h1>
      </header>
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-2">Nutriëntenfocus</div>
        <div className="font-display text-xl text-ink-700 mb-1">{targets.focus.headline}</div>
        <p className="text-sm text-ink-500 leading-relaxed mb-4">{targets.focus.why}</p>
        <div className="flex flex-wrap gap-2">
          {targets.focus.foods.map((f) => (
            <span key={f} className="text-xs px-3 py-1.5 rounded-full bg-cream-100 border border-cream-200 text-ink-600">{f}</span>
          ))}
        </div>
      </Card>
      <PhaseRecipes phase={state.phase} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  All charts view (stub — filled in by feature 4)                   */
/* ------------------------------------------------------------------ */

function AllChartsView({ profile, onBack }) {
  return (
    <div className="min-h-dvh px-5 pt-8 pb-28 max-w-md mx-auto">
      <header className="flex items-center gap-3 mb-7 anim-fade-up">
        <button type="button" onClick={onBack}
          className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-500 hover:text-ink-700 transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-[28px] leading-tight text-ink-700">Alle grafieken</h1>
      </header>
      <ExtendedCharts profile={profile} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error boundary + crash screen                                      */
/* ------------------------------------------------------------------ */
/*                                                                     */
/*  Privacy-first crash handling: errors stay on the device. Nothing   */
/*  is auto-sent. The user gets a calm fallback UI with a reload       */
/*  button and an opt-in "copy details" action so they can paste the   */
/*  report into an email if they want help debugging.                  */
/*                                                                     */
/* ------------------------------------------------------------------ */

function buildErrorReport(error, errorInfo) {
  const lines = [
    `Aura crash report — ${new Date().toISOString()}`,
    `URL:      ${typeof location !== 'undefined' ? location.href : '?'}`,
    `Theme:    ${document?.documentElement?.getAttribute('data-theme') || '?'}`,
    `UA:       ${navigator?.userAgent || '?'}`,
    `Language: ${navigator?.language || '?'}`,
    '',
    `Message:  ${error?.message || String(error)}`,
    '',
    'Stack:',
    error?.stack || '(no stack)',
  ];
  if (errorInfo?.componentStack) {
    lines.push('', 'Component stack:', errorInfo.componentStack.trim());
  }
  return lines.join('\n');
}

function CrashScreen({ error, errorInfo }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied,      setCopied]      = useState(false);

  const report = useMemo(() => buildErrorReport(error, errorInfo), [error, errorInfo]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API: select the <pre> text.
      const pre = document.getElementById('aura-crash-report');
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  const handleReload = () => window.location.reload();

  return (
    <div className="min-h-dvh px-5 py-10 flex flex-col items-center justify-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-[22px] mb-6 flex items-center justify-center shadow-soft"
           style={{ background: 'linear-gradient(135deg, #F4E2D8 0%, #E2E9DC 100%)' }}>
        <Flower2 className="w-7 h-7 text-terracotta-500" />
      </div>
      <h1 className="font-display text-[28px] text-ink-700 text-center leading-tight mb-3">
        Aura is even uit balans
      </h1>
      <p className="text-sm text-ink-500 text-center leading-relaxed mb-6">
        Er ging iets mis bij het tekenen van het scherm. Je gegevens zijn veilig — alles staat
        nog steeds lokaal op je apparaat. Probeer Aura opnieuw te laden.
      </p>

      <button
        type="button"
        onClick={handleReload}
        className="w-full rounded-xl bg-sage-500 text-cream-50 py-3.5 font-medium
                   hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 mb-3"
      >
        Probeer opnieuw
      </button>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="w-full rounded-xl border border-cream-200 bg-cream-50 text-ink-600 py-3 text-sm
                   hover:border-sage-200 hover:bg-sage-50 transition mb-2"
      >
        {showDetails ? 'Verberg foutgegevens' : 'Toon foutgegevens'}
      </button>

      {showDetails && (
        <div className="w-full mt-2 anim-fade-up">
          <pre
            id="aura-crash-report"
            className="text-[10px] leading-relaxed text-ink-500 bg-cream-100 border border-cream-200
                       rounded-xl p-3 max-h-64 overflow-auto whitespace-pre-wrap"
          >
            {report}
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            className="w-full mt-2 rounded-xl border border-cream-200 bg-cream-50 text-ink-600 py-2.5 text-xs
                       hover:border-sage-200 hover:bg-sage-50 transition"
          >
            {copied ? 'Gekopieerd ✓' : 'Kopieer foutgegevens'}
          </button>
          <p className="text-[10px] text-ink-400 text-center mt-3 leading-relaxed">
            Aura stuurt nooit automatisch foutgegevens. Alleen als jij ze zelf kopieert en deelt.
          </p>
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // eslint-disable-next-line no-console
    console.error('[Aura] render error:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return <CrashScreen error={this.state.error} errorInfo={this.state.errorInfo} />;
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/*  Root                                                               */
/* ------------------------------------------------------------------ */

function App() {
  const [profile, setProfile] = useState(() => loadProfile());
  const [tab, setTab] = useState('home');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('aura.theme') || 'auto');

  const handleThemeChange = useCallback((newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('aura.theme', newTheme);
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = newTheme === 'dark' || (newTheme === 'auto' && sysDark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'aura.profile') setProfile(loadProfile());
    };
    // Quiet logging for async errors that the React boundary can't see
    // (event handlers, setTimeout callbacks, unhandled promise rejections).
    // We don't surface these to the user — most don't break the UI — but
    // they're tagged so anyone copying the console for support can find
    // them quickly. Nothing leaves the device.
    const onError    = (e) => console.error('[Aura] uncaught:',  e.error || e.message || e);
    const onRejected = (e) => console.error('[Aura] rejection:', e.reason);
    window.addEventListener('storage',            onStorage);
    window.addEventListener('error',              onError);
    window.addEventListener('unhandledrejection', onRejected);
    return () => {
      window.removeEventListener('storage',            onStorage);
      window.removeEventListener('error',              onError);
      window.removeEventListener('unhandledrejection', onRejected);
    };
  }, []);

  if (!profile) return <Onboarding onComplete={setProfile} />;

  const updateProfile = (next) => {
    if (!next || next === profile) return;
    saveProfile(next);
    setProfile(next);
  };

  const handleReset = () => setShowResetConfirm(true);

  const confirmReset = () => {
    clearProfile();
    setProfile(null);
    setTab('home');
    setShowResetConfirm(false);
  };

  return (
    <>
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-5 bg-ink-700/30 backdrop-blur-sm"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-cream-50 rounded-2xl shadow-glow p-6 anim-fade-up"
            role="alertdialog"
            aria-labelledby="reset-dialog-title"
            aria-describedby="reset-dialog-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="reset-dialog-title" className="font-display text-[22px] text-ink-700 mb-2">Profiel resetten?</h2>
            <p id="reset-dialog-desc" className="text-sm text-ink-500 leading-relaxed mb-6">
              Weet je het zeker? Alle profieldata wordt gewist. Je dagelijkse logs blijven bewaard.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-cream-200 bg-cream-100 text-ink-600 text-sm font-medium hover:bg-cream-200 transition"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={confirmReset}
                className="flex-1 py-3 rounded-xl bg-terracotta-400 text-cream-50 text-sm font-medium hover:bg-terracotta-500 transition active:scale-[0.98]"
              >
                Ja, reset
              </button>
            </div>
          </div>
        </div>
      )}
      <div key={tab} className="anim-tab-in">
        {tab === 'home' && (
          <Dashboard
            profile={profile}
            onUpdateProfile={updateProfile}
            onOpenSettings={() => setTab('settings')}
          />
        )}
        {tab === 'voeding' && <VoedingView profile={profile} />}
        {tab === 'logboek' && (
          <LogboekView profile={profile} onGoHome={() => setTab('home')} />
        )}
        {tab === 'stats' && <InsightsView profile={profile} onOpenCharts={() => setTab('charts')} />}
        {tab === 'charts' && <AllChartsView profile={profile} onBack={() => setTab('stats')} />}
        {tab === 'settings' && (
          <SettingsScreen
            profile={profile}
            onSave={updateProfile}
            onBack={() => setTab('home')}
            onReset={handleReset}
            theme={theme}
            onThemeChange={handleThemeChange}
            onOpenLegal={() => setTab('legal')}
          />
        )}
        {tab === 'legal' && (
          <LegalView onBack={() => setTab('settings')} />
        )}
      </div>
      <BottomNav active={tab} onSelect={setTab} />
      <PWAInstallBanner />
      <ReminderBanner profile={profile} />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
