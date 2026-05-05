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
  Check, Droplet, Wheat, Salad, ChevronLeft, ChevronRight, ChevronDown,
  BookOpen, Activity, BarChart2, Download, X, TrendingUp, Undo2,
  Thermometer, Info, Heart, Dumbbell, Plus, Pencil,
} from 'lucide-react';

import {
  getCycleState, PHASES, PHASE_META, PHASE_HORMONES, PHASE_SPORTS,
  SPORT_INTENSITIES,
  logPeriodStart, unlogPeriodStart, isPeriodLoggedOn,
  getCycleHistory, isValidTemperature, TEMP_MIN, TEMP_MAX,
  detectOvulationFromTemperatureSeries, toISODate, atMidnight,
  predictNextPeriod, getFertileWindow,
} from './lib/cycle.js';
import { getDailyTargets, ACTIVITY_LEVELS } from './lib/nutrition.js';
import { getDailyInsight, TIPS, MENSTRUAL_SELFCARE } from './lib/insights.js';
import {
  loadProfile, saveProfile, clearProfile,
  loadLog, saveLog, isoDate, emptyLog, logHasData, getStreak,
  loadRecentLogs, loadCardOrder, saveCardOrder,
  setStorageErrorHandler, notifyStorageError,
} from './lib/storage.js';
import { generateCsvExport, csvExportFilename } from './lib/export.js';

/* ------------------------------------------------------------------ */
/*  Dashboard card registry                                            */
/* ------------------------------------------------------------------ */

// Bron-van-waarheid voor welke kaarten op het dashboard staan en in welke
// volgorde ze standaard verschijnen. De gebruiker kan de volgorde
// aanpassen op de profielpagina; de opgeslagen volgorde wordt tegen deze
// lijst gevalideerd zodat hernoemde of nieuwe kaart-IDs niet kapot gaan.
//
// Kaarten met `alwaysVisible: true` kunnen niet verborgen worden — denk
// aan de cyclusring en de check-in: zonder die twee is het scherm leeg.
// (Verbergen wordt op dit moment nog niet ondersteund in de UI; het veld
// staat hier zodat de registry een toekomstige toggle kan dragen.)
export const CARD_REGISTRY = [
  { id: 'cycle-phase',      label: 'Cyclus & fase',          alwaysVisible: true  },
  { id: 'log-today',        label: 'Dagelijkse check-in',    alwaysVisible: true  },
  { id: 'goal-rings',       label: 'Doelen overzicht',       alwaysVisible: false },
  { id: 'protein-tracker',  label: 'Voeding (eiwit & water)',alwaysVisible: false },
  { id: 'basal-temp',       label: 'Basaaltemperatuur',      alwaysVisible: false },
  { id: 'ovulation',        label: 'Ovulatie',               alwaysVisible: false },
  { id: 'bleeding-details', label: 'Bloedverlies details',   alwaysVisible: false },
  { id: 'sport-tracker',    label: 'Sport & intensiteit',    alwaysVisible: false },
  { id: 'wellbeing',        label: 'Welzijn (energie & stemming)', alwaysVisible: false },
  { id: 'cycle-calendar',   label: 'Cyclus-kalender',        alwaysVisible: false },
  { id: 'sleep-movement',   label: 'Slaap & beweging',       alwaysVisible: false },
  { id: 'cycle-history',    label: 'Cyclusgeschiedenis',     alwaysVisible: false },
  { id: 'weekly-history',   label: 'Week-overzicht',         alwaysVisible: false },
  { id: 'gut',              label: 'Darmgezondheid',         alwaysVisible: false },
  { id: 'nutrient-focus',   label: 'Nutriëntenfocus',        alwaysVisible: false },
  { id: 'journal',          label: 'Notitie',                alwaysVisible: false },
  { id: 'tip-of-day',       label: 'Tip van de dag',         alwaysVisible: false },
  { id: 'insights',         label: 'Dagelijks inzicht',      alwaysVisible: false },
  { id: 'selfcare-general', label: 'Zelfzorg tips',          alwaysVisible: false },
];

const CARD_DEFAULT_ORDER = CARD_REGISTRY.map((c) => c.id);
const CARD_ID_SET        = new Set(CARD_DEFAULT_ORDER);

// Validate + heal a saved order: drop unknown IDs, append any new
// registry entries to the end. This way users who upgrade after we add
// a new card don't have to re-customize — the new card just shows up at
// the bottom of their existing layout.
export function resolveCardOrder(saved) {
  if (!Array.isArray(saved)) return CARD_DEFAULT_ORDER.slice();
  const seen = new Set();
  const valid = [];
  for (const id of saved) {
    if (CARD_ID_SET.has(id) && !seen.has(id)) {
      valid.push(id);
      seen.add(id);
    }
  }
  for (const id of CARD_DEFAULT_ORDER) {
    if (!seen.has(id)) valid.push(id);
  }
  return valid;
}

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

const COLLAPSED_KEY = 'aura_card_collapsed';

function readCollapsedMap() {
  try { return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}') || {}; }
  catch { return {}; }
}

function CollapsibleCard({ id, title, headerExtra, className = '', style, children }) {
  const [collapsed, setCollapsed] = useState(() => !!readCollapsedMap()[id]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        const map = readCollapsedMap();
        map[id] = next;
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(map));
      } catch (err) { notifyStorageError(err); }
      return next;
    });
  };

  return (
    <Card className={`overflow-hidden anim-fade-up ${className}`} style={style}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={`${title} ${collapsed ? 'uitklappen' : 'inklappen'}`}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 min-h-[44px] text-left hover:bg-cream-100/40 transition"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-[11px] uppercase tracking-[0.18em] text-ink-400">{title}</span>
          {headerExtra && <div className="ml-auto">{headerExtra}</div>}
        </div>
        <ChevronDown
          className="w-4 h-4 text-ink-400 shrink-0 transition-transform duration-300"
          style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
        />
      </button>
      <div
        aria-hidden={collapsed}
        style={{
          display: 'grid',
          gridTemplateRows: collapsed ? '0fr' : '1fr',
          transition: 'grid-template-rows 300ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div className="px-6 pb-6">{children}</div>
        </div>
      </div>
    </Card>
  );
}

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
      if (patch.gut)       next.gut       = { ...current.gut,       ...patch.gut };
      if (patch.symptoms)  next.symptoms  = { ...current.symptoms,  ...patch.symptoms };
      if (patch.ovulation) next.ovulation = { ...current.ovulation, ...patch.ovulation };
      if (patch.bleeding)  next.bleeding  = { ...current.bleeding,  ...patch.bleeding };
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
  const rows = ['date,cycleDay,phase,mood,energy,cramps,bloating,calories,protein,water,sleep,movement,temperature,sportIntensity,ovulationFelt,ovulationFromTemp,bleedingHeaviness,bleedingColor,bleedingClots,bleedingClarity,note'];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const log = loadLog(d);
    const state = getCycleState(profile, d);
    const s = log.symptoms || {};
    const o = log.ovulation || {};
    const b = log.bleeding || {};
    rows.push([
      isoDate(d),
      state.cycleDay ?? '',
      state.phase,
      s.mood     || '',
      s.energy   || '',
      s.cramps   || '',
      s.bloating || '',
      log.calories     || '',
      log.protein      || '',
      log.hydration    || '',
      log.sleep        || '',
      log.movement     || '',
      log.temperature  || '',
      log.sportIntensity || '',
      o.felt     ? '1' : '',
      o.fromTemp ? '1' : '',
      b.heaviness || '',
      b.color     || '',
      b.clots     || '',
      b.clarity   || '',
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

/**
 * "Voor arts" CSV — kleinere, leesbare kolomset gericht op een gesprek
 * bij de huisarts of gynaecoloog. Pure transformatie via
 * `generateCsvExport`; deze wrapper verzorgt alleen de browser-glue
 * (logs verzamelen → Blob → download).
 */
function exportDoctorCSV(profile) {
  const today = new Date();
  const entries = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const log = loadLog(d);
    const state = getCycleState(profile, d);
    entries.push({ iso: isoDate(d), log, phase: state.phase });
  }
  const csv  = generateCsvExport(entries);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = csvExportFilename(today);
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Apple Health XML export (feature 7)                               */
/* ------------------------------------------------------------------ */

/* Escape a value for safe use inside an XML attribute.
   Covers both single- and double-quoted attribute contexts so the helper
   stays correct if a caller ever switches quote style. */
function xmlAttr(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
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

function NumberValue({ value, unit, target, label, onChange }) {
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
        aria-label={label ? `${label} in ${unit}` : `${unit} ingevoerd`}
      />
      <span className="text-ink-400 text-sm">/ {target} {unit}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Manual food entry — type a meal directly into the day log          */
/* ------------------------------------------------------------------ */

// Lichte input-parser: lege string of niet-numerieke invoer wordt 0.
// Negatieve waarden zijn niet toegestaan; we cappen op 99999 zoals de
// rest van de tracker zodat één foutieve toetsaanslag niet de progress
// ring forever pegt.
function parseFoodNumber(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim().replace(',', '.');
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99999, Math.round(n));
}

function ManualFoodEntryModal({ onClose, onAdd }) {
  const [name,    setName]    = useState('');
  const [kcal,    setKcal]    = useState('');
  const [protein, setProtein] = useState('');
  const [carbs,   setCarbs]   = useState('');
  const [fat,     setFat]     = useState('');
  const [error,   setError]   = useState('');

  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Geef het product of gerecht een naam.');
      nameRef.current?.focus();
      return;
    }
    onAdd({
      name:    trimmed.slice(0, 80),
      kcal:    parseFoodNumber(kcal),
      protein: parseFoodNumber(protein),
      carbs:   parseFoodNumber(carbs),
      fat:     parseFoodNumber(fat),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 py-6 bg-ink-700/40 backdrop-blur-sm anim-fade-up"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-food-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-cream-50 rounded-2xl shadow-glow overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-2 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sage-100 border border-sage-200 flex items-center justify-center shrink-0">
            <Pencil className="w-5 h-5 text-sage-600" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Voeding</div>
            <h2 id="manual-food-title" className="font-display text-[22px] text-ink-700 leading-snug">
              Handmatig invoeren
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="w-9 h-9 rounded-full bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-400 hover:text-ink-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-2 space-y-4">
          <p className="text-xs text-ink-500 leading-relaxed">
            Vul minimaal de naam in. Calorieën en macro's zijn optioneel — alleen
            kcal en eiwitten worden bij je dagtotaal opgeteld.
          </p>

          <Field>
            <label htmlFor="manual-food-name" className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-1.5">
              Naam <span className="text-terracotta-600 normal-case tracking-normal">*</span>
            </label>
            <input
              id="manual-food-name"
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (error) setError(''); }}
              placeholder="bv. Havermout met blauwe bessen"
              maxLength={80}
              className={inputCx}
              required
            />
            {error && (
              <div className="text-xs text-terracotta-600 mt-1.5" role="alert">{error}</div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <label htmlFor="manual-food-kcal" className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-1.5">
                Calorieën <span className="text-ink-400/70 normal-case tracking-normal">(kcal)</span>
              </label>
              <input
                id="manual-food-kcal"
                type="number"
                inputMode="numeric"
                min="0"
                max="99999"
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                placeholder="0"
                className={inputCx}
              />
            </Field>
            <Field>
              <label htmlFor="manual-food-protein" className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-1.5">
                Eiwitten <span className="text-ink-400/70 normal-case tracking-normal">(g)</span>
              </label>
              <input
                id="manual-food-protein"
                type="number"
                inputMode="numeric"
                min="0"
                max="99999"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="0"
                className={inputCx}
              />
            </Field>
            <Field>
              <label htmlFor="manual-food-carbs" className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-1.5">
                Koolhydraten <span className="text-ink-400/70 normal-case tracking-normal">(g)</span>
              </label>
              <input
                id="manual-food-carbs"
                type="number"
                inputMode="numeric"
                min="0"
                max="99999"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                placeholder="0"
                className={inputCx}
              />
            </Field>
            <Field>
              <label htmlFor="manual-food-fat" className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-1.5">
                Vetten <span className="text-ink-400/70 normal-case tracking-normal">(g)</span>
              </label>
              <input
                id="manual-food-fat"
                type="number"
                inputMode="numeric"
                min="0"
                max="99999"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                placeholder="0"
                className={inputCx}
              />
            </Field>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl bg-cream-100 border border-cream-200 text-ink-500
                         hover:bg-cream-200 transition flex items-center gap-1.5 text-sm"
            >
              Annuleren
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-sage-500 text-cream-50 py-3 font-medium
                         hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Toevoegen aan dag
            </button>
          </div>
        </div>
      </form>
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
        <NumberValue value={value} unit={unit} target={target} label={label} onChange={onSet} />
      </div>
      <SoftProgress value={value} target={target} />
      <div className="flex flex-wrap gap-2 mt-3">
        {increments.map((inc) => (
          <Chip key={inc} onClick={() => onAdd(inc)} ariaLabel={`Voeg ${inc} ${unit} toe`}>
            +{inc} {unit}
          </Chip>
        ))}
        {value > 0 && (
          <Chip onClick={() => onSet(0)} ariaLabel={`Wis ${label}`}>
            wis
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
              className="relative grid place-items-center min-w-[44px] min-h-[44px] active:scale-95 transition"
            >
              {/* Visible glass — sits inside a 44×44 invisible hit area for touch */}
              <span
                aria-hidden="true"
                className={`block w-7 h-9 rounded-b-full rounded-t-md border transition ${
                  filled
                    ? 'bg-sage-200 border-sage-300'
                    : 'bg-cream-50 border-cream-200 hover:border-sage-200'
                }`}
              />
            </button>
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
                      className={`flex-1 min-h-[44px] py-3 rounded-xl border transition active:scale-95 text-lg leading-none ${
                        active
                          ? 'bg-sage-100 border-sage-300 shadow-soft'
                          : 'bg-cream-50 border-cream-200 hover:border-sage-200'
                      }`}
                      aria-label={`${label}: ${n} van 5`}
                      aria-pressed={active}
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
/*  Wellbeing — energie / stemming / symptomen                         */
/* ------------------------------------------------------------------ */

// 5-puntsschalen: emoji's per niveau, inclusief alt-tekst voor a11y.
const ENERGIE_LEVELS = [
  { val: 1, icon: '😴', label: 'Uitgeput' },
  { val: 2, icon: '💤', label: 'Slaperig' },
  { val: 3, icon: '🙂', label: 'Oké' },
  { val: 4, icon: '⚡', label: 'Energiek' },
  { val: 5, icon: '🔥', label: 'Vol energie' },
];

const STEMMING_LEVELS = [
  { val: 1, icon: '😢', label: 'Verdrietig' },
  { val: 2, icon: '😕', label: 'Onrustig' },
  { val: 3, icon: '😐', label: 'Neutraal' },
  { val: 4, icon: '🙂', label: 'Tevreden' },
  { val: 5, icon: '😄', label: 'Blij' },
];

// Multi-select chips. Bewust een vlakke array zodat de logbook-renderer
// gewoon strings kan tonen zonder een extra meta-lookup te hoeven doen.
export const SYMPTOMEN_OPTIONS = [
  'Buikkrampen',
  'Hoofdpijn',
  'Rugpijn',
  'Opgeblazen gevoel',
  'Gevoelige borsten',
  'Acne',
  'Misselijkheid',
  'Vermoeidheid',
  'Concentratieproblemen',
  'Slaapproblemen',
  'Libido hoog',
  'Libido laag',
];

function WellbeingCard({ log, onUpdate }) {
  const energie  = log.energie  ?? null;
  const stemming = log.stemming ?? null;
  const symptomen = Array.isArray(log.symptomen) ? log.symptomen : [];

  const setScale = (key, val) => {
    // Tweede tap op dezelfde waarde wist het — consistent met de
    // bestaande SymptomTracker zodat de gebruikster één gebaar kent.
    const current = key === 'energie' ? energie : stemming;
    onUpdate({ [key]: current === val ? null : val });
  };

  const toggleSymptom = (name) => {
    const next = symptomen.includes(name)
      ? symptomen.filter((s) => s !== name)
      : [...symptomen, name];
    onUpdate({ symptomen: next });
  };

  const anyLogged = energie != null || stemming != null || symptomen.length > 0;

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '90ms' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Heart className="w-3.5 h-3.5 text-ink-400" />
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Welzijn vandaag</div>
        </div>
        {anyLogged && (
          <div className="text-[11px] text-sage-600 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full">
            Gelogd
          </div>
        )}
      </div>

      <ScaleRow
        label="Energie"
        value={energie}
        levels={ENERGIE_LEVELS}
        onPick={(n) => setScale('energie', n)}
      />

      <div className="h-px bg-cream-200/70 my-5" />

      <ScaleRow
        label="Stemming"
        value={stemming}
        levels={STEMMING_LEVELS}
        onPick={(n) => setScale('stemming', n)}
      />

      <div className="h-px bg-cream-200/70 my-5" />

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-sm font-medium text-ink-600">Symptomen</div>
          {symptomen.length > 0 && (
            <div className="text-[11px] text-ink-400">{symptomen.length} geselecteerd</div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SYMPTOMEN_OPTIONS.map((name) => {
            const active = symptomen.includes(name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSymptom(name)}
                className={`min-h-[44px] px-3 py-1.5 rounded-full border text-xs transition active:scale-95 ${
                  active
                    ? 'bg-terracotta-100 border-terracotta-300 text-terracotta-600 font-medium'
                    : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-terracotta-200'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
          Tip — meerdere selecties zijn welkom; tik nogmaals om te wissen.
        </p>
      </div>
    </Card>
  );
}

function ScaleRow({ label, value, levels, onPick }) {
  const activeLevel = levels.find((l) => l.val === value);
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-sm font-medium text-ink-600">{label}</div>
        {activeLevel ? (
          <div className="text-[11px] text-ink-500">
            <span className="text-base leading-none mr-1">{activeLevel.icon}</span>
            {activeLevel.label}
          </div>
        ) : (
          <div className="text-[10px] text-ink-400/70">tik om te kiezen</div>
        )}
      </div>
      <div className="flex gap-1.5">
        {levels.map(({ val, icon, label: lvLabel }) => {
          const active = value === val;
          return (
            <button
              key={val}
              type="button"
              onClick={() => onPick(val)}
              aria-label={`${label}: ${lvLabel}`}
              aria-pressed={active}
              className={`flex-1 min-h-[44px] py-3 rounded-xl border transition active:scale-95 text-lg leading-none ${
                active
                  ? 'bg-sage-100 border-sage-300 shadow-soft'
                  : 'bg-cream-50 border-cream-200 hover:border-sage-200'
              }`}
            >
              {icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cycle calendar — 6-week mini grid with predictions                 */
/* ------------------------------------------------------------------ */

const CAL_DAY_HEADERS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

// Kleurpalet — bewust geen Tailwind classes zodat we de tinten dynamisch
// kunnen mengen (toekomst = lagere opacity) zonder een dynamic-class
// purge probleem in productie.
const CAL_COLORS = {
  period:    '#e8748a',   // roze/rood
  fertile:   '#6dbf82',   // lichtgroen
  ovulation: '#3d9e57',   // groen
};

/**
 * Bouw 42 dagen (6 weken × 7) startend op de maandag vóór "vandaag".
 * Elke dag krijgt een tag: 'period' | 'fertile' | 'ovulation' | null,
 * plus `predicted: boolean` als de markering voorspeld is i.p.v. gelogd.
 */
function buildCalendarGrid(profile, today) {
  const start = atMidnight(today);
  // Maandag-start: getDay() geeft 0 voor zondag.
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow - 7); // begin een week vóór deze week

  const cycleLength = profile?.cycleLength || 28;
  const periodLen   = profile?.mensDuration || 5;
  const history     = Array.isArray(profile?.periodHistory) ? profile.periodHistory : [];
  const lastStart   = profile?.lastPeriodStart || null;

  // Verzamel "echte" menstruatie-bereiken uit het verleden.
  const loggedPeriodSet = new Set();
  for (const iso of history) {
    const d = new Date(`${iso}T00:00:00`);
    for (let i = 0; i < periodLen; i++) {
      const day = new Date(d);
      day.setDate(d.getDate() + i);
      loggedPeriodSet.add(toISODate(day));
    }
  }

  // Voorspelde toekomstige menstruaties: vanaf laatste bekende start
  // schuiven we 6 cycli vooruit zodat de hele 6-weeks grid bedekt is.
  const predictedPeriodSet = new Set();
  if (lastStart) {
    const base = new Date(`${toISODate(lastStart)}T00:00:00`);
    for (let c = 1; c <= 6; c++) {
      const cstart = new Date(base);
      cstart.setDate(base.getDate() + cycleLength * c);
      for (let i = 0; i < periodLen; i++) {
        const day = new Date(cstart);
        day.setDate(cstart.getDate() + i);
        predictedPeriodSet.add(toISODate(day));
      }
    }
  }

  // Vruchtbaar venster + ovulatie per voorspelde cyclus.
  const fertileSet = new Set();
  const ovulationSet = new Set();
  if (lastStart) {
    const baseISO = toISODate(lastStart);
    // Huidige + 5 toekomstige cycli
    for (let c = 0; c <= 5; c++) {
      const cBase = new Date(`${baseISO}T00:00:00`);
      cBase.setDate(cBase.getDate() + cycleLength * c);
      const window = getFertileWindow(cBase, cycleLength);
      if (!window) continue;
      const wStart = new Date(`${window.start}T00:00:00`);
      const wEnd   = new Date(`${window.end}T00:00:00`);
      for (let d = new Date(wStart); d <= wEnd; d.setDate(d.getDate() + 1)) {
        fertileSet.add(toISODate(d));
      }
      ovulationSet.add(window.ovulation);
    }
  }

  const todayISO = toISODate(today);
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISODate(d);
    const isToday  = iso === todayISO;
    const isFuture = d.getTime() > atMidnight(today).getTime();

    let tag = null;
    let predicted = false;
    if (loggedPeriodSet.has(iso)) {
      tag = 'period';
    } else if (predictedPeriodSet.has(iso)) {
      tag = 'period';
      predicted = true;
    } else if (ovulationSet.has(iso)) {
      tag = 'ovulation';
      predicted = isFuture;
    } else if (fertileSet.has(iso)) {
      tag = 'fertile';
      predicted = isFuture;
    }

    out.push({
      iso,
      day: d.getDate(),
      isToday,
      isFuture,
      tag,
      predicted,
    });
  }
  return out;
}

function CycleCalendarCard({ profile }) {
  const today = useMemo(() => new Date(), []);
  const grid  = useMemo(() => buildCalendarGrid(profile, today), [profile, today]);
  const [selected, setSelected] = useState(null);

  const cycleLength = profile?.cycleLength || 28;
  const nextStartISO = useMemo(() => {
    const history = Array.isArray(profile?.periodHistory) ? profile.periodHistory : [];
    if (history.length > 0) return predictNextPeriod(history, cycleLength);
    if (profile?.lastPeriodStart) return predictNextPeriod(profile.lastPeriodStart, cycleLength);
    return null;
  }, [profile, cycleLength]);

  const tagLabel = (cell) => {
    if (!cell.tag) return cell.predicted ? '' : 'Geen markering';
    const base = cell.tag === 'period'    ? 'Menstruatie'
              : cell.tag === 'fertile'    ? 'Vruchtbaar venster'
              :                              'Ovulatie';
    return cell.predicted ? `${base} (voorspeld)` : base;
  };

  const swatch = (kind) => {
    if (kind === 'period')    return CAL_COLORS.period;
    if (kind === 'fertile')   return CAL_COLORS.fertile;
    if (kind === 'ovulation') return CAL_COLORS.ovulation;
    return null;
  };

  const tooltipCell = selected ? grid.find((c) => c.iso === selected) : null;

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '110ms' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Cyclus-kalender</div>
        {nextStartISO && (
          <div className="text-[11px] text-terracotta-600 bg-terracotta-100 px-2 py-0.5 rounded-full">
            volgende: {formatShortDate(nextStartISO)}
          </div>
        )}
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {CAL_DAY_HEADERS.map((d) => (
          <div key={d} className="text-[10px] uppercase tracking-wider text-ink-400 text-center">
            {d}
          </div>
        ))}
      </div>

      {/* 6×7 grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          const bg = swatch(cell.tag);
          const opacity = cell.predicted ? 0.4 : 1;
          const isSelected = selected === cell.iso;
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => setSelected(isSelected ? null : cell.iso)}
              aria-label={`${cell.iso} — ${tagLabel(cell) || 'geen'}`}
              aria-pressed={isSelected}
              className={`relative aspect-square rounded-lg flex items-center justify-center text-[11px] transition active:scale-95 ${
                bg ? 'text-cream-50 font-medium' : 'text-ink-500 bg-cream-50 border border-cream-200'
              } ${cell.isToday ? 'ring-2 ring-sage-500 ring-offset-1 ring-offset-cream-50' : ''}`}
              style={bg ? { background: bg, opacity } : undefined}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* Tooltip / detail row */}
      {tooltipCell && (
        <div className="mt-3 px-3 py-2.5 rounded-xl bg-cream-100/80 border border-cream-200 text-[12px] text-ink-600 leading-snug anim-fade-up">
          <div className="font-medium text-ink-700">{formatShortDate(tooltipCell.iso)}</div>
          <div className="text-ink-500">{tagLabel(tooltipCell) || 'Geen markering — gewone cyclusdag.'}</div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <LegendDot color={CAL_COLORS.period}    label="Menstruatie" />
        <LegendDot color={CAL_COLORS.fertile}   label="Vruchtbaar" />
        <LegendDot color={CAL_COLORS.ovulation} label="Ovulatie" />
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-sage-500" aria-hidden="true" />
          <span className="text-[11px] text-ink-500">Vandaag</span>
        </div>
      </div>
      <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
        Lichtere kleuren zijn voorspellingen — ze worden steviger naarmate je meer logt.
      </p>
    </Card>
  );
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-full" style={{ background: color }} aria-hidden="true" />
      <span className="text-[11px] text-ink-500">{label}</span>
    </div>
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

      <div className="flex gap-1.5 mt-3" aria-label="Cyclusfase per dag">
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
              aria-label={`${label} dag ${i + 1}: ${Math.round(v)}% van doel`}
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
          aria-label="Menstruatie-log ongedaan maken"
          className="text-xs text-ink-400 hover:text-ink-600 underline decoration-dotted underline-offset-4 transition px-3 py-2 min-h-[44px] inline-flex items-center"
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
        aria-label="Log dat mijn menstruatie vandaag begon"
        className="w-full max-w-[260px] px-6 py-3.5 rounded-2xl font-medium text-sm text-cream-50
                   active:scale-[0.97] transition-transform flex items-center justify-center gap-3"
        style={{ background: 'linear-gradient(135deg, #C78264 0%, #B06849 100%)' }}
      >
        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-cream-50/70 shrink-0" />
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
    { id: 'probiotics', label: 'Probiotica',          hint: 'Yoghurt, kefir, capsule…',             icon: Sparkles },
    { id: 'fiber',      label: 'Vezelrijke maaltijd', hint: 'Groenten, peulvruchten, volkoren',     icon: Wheat },
    { id: 'fermented',  label: 'Gefermenteerd',       hint: 'Zuurkool, kimchi, miso, kombucha',     icon: Salad },
  ];
  const doneCount = items.reduce((n, { id }) => n + (gut[id] ? 1 : 0), 0);
  const total = items.length;
  const allDone = doneCount === total;

  return (
    <div>
      <p className="text-sm text-ink-500 leading-relaxed mb-2">
        Drie kleine gewoontes voor een gezonde darmflora — tik aan wat je vandaag binnen kreeg.
      </p>
      <p className="text-[11px] text-ink-400 mb-4">
        Schaal: {doneCount} van {total} gewoontes {allDone ? '— alle drie gehaald 🌿' : 'gehaald vandaag'}.
      </p>

      <div className="space-y-2">
        {items.map(({ id, label, hint, icon: Icon }) => {
          const on = !!gut[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              aria-pressed={on}
              aria-label={`${label}${on ? ' — gelogd, tik om te wissen' : ' — tik om te loggen'}`}
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
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${on ? 'text-sage-700' : 'text-ink-600'}`}>{label}</div>
                <div className="text-xs text-ink-400 mt-0.5">{hint}</div>
              </div>
              <div className="ml-auto text-[10px] uppercase tracking-wider shrink-0">
                {on ? (
                  <span className="text-sage-600">Gelogd · tik om te wissen</span>
                ) : (
                  <span className="text-ink-400">Tik om te loggen</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {doneCount === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-cream-200 bg-cream-50/60 px-4 py-3">
          <div className="text-xs text-ink-500 leading-relaxed">
            Nog niets gelogd vandaag. Eén keuze is al genoeg — een kop yoghurt of een schep zuurkool telt.
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
          Tip — meerdere gewoontes mogen samen; tik nogmaals om te wissen.
        </p>
      )}
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
              className={`flex-1 min-h-[44px] py-3 rounded-xl border text-sm transition active:scale-95 ${
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
              className={`min-h-[44px] min-w-[56px] px-3 py-3 rounded-xl border text-sm transition active:scale-95 ${
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
            aria-label="Wis bewegingstijd"
            onClick={() => onChange(0)}
            className="min-h-[44px] px-4 py-3 rounded-xl border border-cream-200 bg-cream-50 text-ink-400 text-sm transition hover:border-sage-200 active:scale-95"
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
/*  Basal temperature tracker + 14-day mini chart                      */
/* ------------------------------------------------------------------ */

/**
 * Tekstuele input voor basaaltemperatuur. We slaan op als number (°C),
 * maar de UI staat tijdelijke ongeldige tussenstanden toe ("36.") zodat
 * typen niet hapert. Pas op blur of Enter committen we de waarde.
 */
function TemperatureInput({ value, onChange }) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : '');
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      setDraft(value > 0 ? String(value) : '');
    }
  }, [value]);

  const commit = () => {
    const cleaned = draft.replace(',', '.').trim();
    if (cleaned === '') {
      if (value !== 0) onChange(0);
      return;
    }
    const num = Number(cleaned);
    if (!isValidTemperature(num)) {
      // Out of plausible range → reset draft to last good value, no commit.
      setDraft(value > 0 ? String(value) : '');
      return;
    }
    const rounded = Math.round(num * 10) / 10;
    setDraft(String(rounded));
    if (rounded !== value) onChange(rounded);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 5))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
        placeholder="36.5"
        aria-label="Basaaltemperatuur in graden Celsius"
        className="w-[5.5rem] text-center bg-cream-50 border border-cream-200 rounded-xl px-2 py-2 text-ink-700 text-base
                   focus:outline-none focus:border-sage-300 focus:ring-2 focus:ring-sage-200/60 transition"
      />
      <span className="text-sm text-ink-400">°C</span>
      {value > 0 && (
        <button
          type="button"
          onClick={() => { setDraft(''); onChange(0); }}
          aria-label="Wis basaaltemperatuur"
          className="ml-auto text-xs text-ink-400 hover:text-ink-600 underline decoration-dotted underline-offset-2 px-2 py-2 min-h-[44px]"
        >
          wis
        </button>
      )}
    </div>
  );
}

/**
 * Mini-lijngrafiek over 14 dagen basaaltemperatuur. Tekent een gladde
 * polyline + dots voor dagen mét meting; dagen zonder meting krijgen
 * een grijze stippel-marker op de baseline. Schaalt automatisch op de
 * min/max van de aanwezige metingen, met een minimum venster van 0.6 °C
 * zodat dagelijkse 0.1 °C ruis niet de hele grafiek vult.
 */
function TemperatureMiniChart({ series }) {
  const W = 320;
  const H = 88;
  const padX = 8;
  const padY = 10;
  const valid = series.filter((s) => s.temperature > 0);
  if (valid.length === 0) {
    return (
      <div className="text-[11px] text-ink-400 italic text-center py-6">
        Nog geen metingen — log dagelijks 's ochtends voor een trend.
      </div>
    );
  }

  const minRaw = Math.min(...valid.map((s) => s.temperature));
  const maxRaw = Math.max(...valid.map((s) => s.temperature));
  const span = Math.max(0.6, maxRaw - minRaw);
  const center = (minRaw + maxRaw) / 2;
  const lo = center - span / 2 - 0.05;
  const hi = center + span / 2 + 0.05;

  const xFor = (i) => padX + (i * (W - 2 * padX)) / Math.max(1, series.length - 1);
  const yFor = (t) => padY + (1 - (t - lo) / (hi - lo)) * (H - 2 * padY);
  const baselineY = padY + (H - 2 * padY) / 2;

  const points = series
    .map((s, i) => (s.temperature > 0 ? `${xFor(i)},${yFor(s.temperature)}` : null))
    .filter(Boolean);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-[88px]"
        aria-label={`Basaaltemperatuur trend over ${series.length} dagen`}
      >
        <line
          x1={padX} x2={W - padX} y1={baselineY} y2={baselineY}
          stroke="#EDE6D3" strokeWidth="1" strokeDasharray="3 4"
        />
        {points.length > 1 && (
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke="#6B8559"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {series.map((s, i) => {
          const x = xFor(i);
          if (s.temperature > 0) {
            return (
              <circle
                key={s.iso}
                cx={x} cy={yFor(s.temperature)}
                r={s.isToday ? 3.5 : 2.3}
                fill={s.isToday ? '#42533A' : '#87A074'}
                stroke="#FBF9F3"
                strokeWidth="1"
              />
            );
          }
          return (
            <circle
              key={s.iso}
              cx={x} cy={baselineY}
              r="1.4"
              fill="#C6D3BB"
              opacity="0.55"
            />
          );
        })}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-ink-400 mt-1">
        <span>{lo.toFixed(1)}°C</span>
        <span>{valid.length} van {series.length} dagen</span>
        <span>{hi.toFixed(1)}°C</span>
      </div>
    </div>
  );
}

function BasalTemperatureCard({ todayTemp, todayISO, onChange, ovulationDetection }) {
  // Bouw de 14-daagse serie. We pakken de huidige dag uit `todayTemp`
  // (live React state) en de overige 13 uit storage zodat de grafiek
  // direct meebeweegt met typen.
  const series = useMemo(() => {
    const recent = loadRecentLogs(14);
    return recent.map((entry) => ({
      iso:    entry.iso,
      isToday: entry.iso === todayISO,
      temperature: entry.iso === todayISO ? todayTemp : (entry.log.temperature || 0),
    }));
  }, [todayTemp, todayISO]);

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '100ms' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Thermometer className="w-3.5 h-3.5 text-ink-400" />
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Basaaltemperatuur</div>
        </div>
        {todayTemp > 0 && (
          <div className="font-display text-ink-700 text-[18px] leading-none">
            {todayTemp.toFixed(1)}<span className="text-ink-400 text-xs ml-1">°C</span>
          </div>
        )}
      </div>
      <TemperatureInput value={todayTemp} onChange={onChange} />
      <p className="text-[11px] text-ink-400 mt-2 leading-relaxed">
        Meet 's ochtends, vóór opstaan. Een aanhoudende stijging van ~0.2°C wijst op een eisprong.
      </p>
      <div className="mt-4">
        <TemperatureMiniChart series={series} />
      </div>
      {ovulationDetection?.ovulationISO && (
        <div className="mt-3 px-3 py-2.5 rounded-xl bg-sage-50 border border-sage-200 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-sage-600 shrink-0" />
          <div className="text-[12px] text-sage-700 leading-snug">
            Mogelijke eisprong rond <strong>{formatShortDate(ovulationDetection.ovulationISO)}</strong>
            <span className="text-sage-600/80"> · op basis van temperatuurstijging</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('nl', { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ */
/*  Ovulation tracker — felt vs read-from-temp                         */
/* ------------------------------------------------------------------ */

function OvulationTracker({ ovulation, onUpdate, autoDetectedISO }) {
  const opts = [
    {
      id:     'felt',
      label:  'Gevoeld',
      hint:   'Krampje, glijmige afscheiding, libido-piek',
      active: !!ovulation.felt,
    },
    {
      id:     'fromTemp',
      label:  'Afgelezen van temperatuur',
      hint:   'Aanhoudende stijging van ~0.2°C',
      active: !!ovulation.fromTemp,
    },
  ];
  const anyMarked = opts.some((o) => o.active);

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '120ms' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Heart className="w-3.5 h-3.5 text-ink-400" />
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Eisprong vandaag</div>
        </div>
        {anyMarked && (
          <div className="text-[11px] text-sage-700 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full">
            Gemarkeerd
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onUpdate({ ovulation: { [o.id]: !o.active } })}
            aria-pressed={o.active}
            className={`text-left px-4 py-3 rounded-xl border transition active:scale-[0.99] ${
              o.active
                ? 'bg-sage-100 border-sage-300 text-sage-700'
                : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                o.active ? 'bg-sage-500 border-sage-500' : 'border-cream-300 bg-cream-50'
              }`}>
                {o.active && <Check className="w-2.5 h-2.5 text-cream-50" />}
              </span>
              <span className="text-sm font-medium">{o.label}</span>
            </div>
            <div className="text-[11px] text-ink-400 mt-1 ml-6">{o.hint}</div>
          </button>
        ))}
      </div>
      {autoDetectedISO && (
        <p className="text-[11px] text-sage-700 mt-3 leading-relaxed">
          🌿 Aura herkent een temperatuurstijging rond {formatShortDate(autoDetectedISO)}.
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Bleeding details — sub-options under menstruation                  */
/* ------------------------------------------------------------------ */

const BLEEDING_GROUPS = [
  {
    key:    'heaviness',
    label:  'Hevigheid',
    options: [
      { id: 'light',      label: 'Licht'       },
      { id: 'normal',     label: 'Normaal'     },
      { id: 'heavy',      label: 'Hevig'       },
      { id: 'very-heavy', label: 'Zeer hevig'  },
    ],
  },
  {
    key:    'color',
    label:  'Kleur',
    options: [
      { id: 'light-pink',  label: 'Lichtroze',  swatch: '#F4C9CB' },
      { id: 'red',         label: 'Rood',       swatch: '#C44848' },
      { id: 'dark-red',    label: 'Donkerrood', swatch: '#8A2A2A' },
      { id: 'brown',       label: 'Bruin',      swatch: '#6B4226' },
    ],
  },
  {
    key:    'clots',
    label:  'Klonters',
    options: [
      { id: 'none',  label: 'Geen'  },
      { id: 'light', label: 'Licht' },
      { id: 'heavy', label: 'Veel'  },
    ],
  },
  {
    key:    'clarity',
    label:  'Helderheid',
    options: [
      { id: 'clear',  label: 'Helder'  },
      { id: 'normal', label: 'Normaal' },
      { id: 'dark',   label: 'Donker'  },
    ],
  },
];

function BleedingDetailsCard({ bleeding, onUpdate }) {
  const setField = (key, value) => {
    const current = bleeding[key];
    onUpdate({ bleeding: { [key]: current === value ? '' : value } });
  };

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '60ms' }}>
      <div className="flex items-center gap-2 mb-4">
        <Droplet className="w-3.5 h-3.5 text-terracotta-500" />
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Bloedingdetails</div>
      </div>
      <p className="text-[12px] text-ink-500 mb-5 leading-relaxed">
        Hoe kleiner de details die je opvolgt, hoe scherper het patroon dat Aura over de maanden ziet.
      </p>
      <div className="space-y-5">
        {BLEEDING_GROUPS.map((group) => {
          const value = bleeding[group.key] || '';
          return (
            <div key={group.key}>
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2.5">
                {group.label}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.options.map((o) => {
                  const active = value === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setField(group.key, o.id)}
                      className={`min-h-[44px] flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs transition active:scale-95 ${
                        active
                          ? 'bg-terracotta-100 border-terracotta-300 text-terracotta-600 font-medium'
                          : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-terracotta-200'
                      }`}
                    >
                      {o.swatch && (
                        <span
                          aria-hidden="true"
                          className="w-3 h-3 rounded-full border border-cream-300"
                          style={{ background: o.swatch }}
                        />
                      )}
                      {o.label}
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
/*  Sport intensity tracker + per-phase suggestions                    */
/* ------------------------------------------------------------------ */

function SportTrackerCard({ phase, intensity, onChange }) {
  const advice = PHASE_SPORTS[phase];

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '160ms' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-3.5 h-3.5 text-ink-400" />
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Sport vandaag</div>
        </div>
        {intensity && (
          <div className="text-[11px] text-sage-700 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full">
            Gelogd
          </div>
        )}
      </div>

      {advice && (
        <div className="mb-5 px-4 py-3.5 rounded-xl bg-sage-50/70 border border-sage-200/70">
          <div className="text-[11px] uppercase tracking-[0.14em] text-sage-700 mb-1">
            Advies voor {PHASE_META[phase].label.toLowerCase()}
          </div>
          <div className="font-display text-base text-ink-700 mb-1">{advice.headline}</div>
          <p className="text-[12px] text-ink-500 leading-relaxed mb-3">{advice.why}</p>
          <div className="flex flex-wrap gap-1.5">
            {advice.examples.map((ex) => (
              <span
                key={ex}
                className="text-[11px] px-2.5 py-1 rounded-full bg-cream-50 border border-cream-200 text-ink-600"
              >
                {ex}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2.5">
        Hoe voelde jouw beweging?
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SPORT_INTENSITIES.map((opt) => {
          const active = intensity === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? '' : opt.id)}
              className={`text-left px-3.5 py-3 rounded-xl border transition active:scale-[0.99] min-h-[44px] ${
                active
                  ? 'bg-sage-100 border-sage-300 text-sage-700'
                  : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[10px] text-ink-400 mt-0.5 leading-snug">{opt.hint}</div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Self-care cards — extended for the menstrual phase                 */
/* ------------------------------------------------------------------ */

function MenstrualSelfCareCards() {
  const [openId, setOpenId] = useState(null);

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '180ms' }}>
      <div className="flex items-center gap-2 mb-2">
        <Heart className="w-3.5 h-3.5 text-terracotta-500" />
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Zachte rituelen</div>
      </div>
      <p className="text-[12px] text-ink-500 mb-4 leading-relaxed">
        Vijf categorieën om uit te kiezen — geen verplichting, alleen ideeën.
      </p>
      <div className="space-y-2">
        {MENSTRUAL_SELFCARE.map((card) => {
          const open = openId === card.id;
          return (
            <div key={card.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : card.id)}
                aria-expanded={open}
                className={`w-full text-left px-4 py-3 rounded-xl border transition active:scale-[0.99] ${
                  open ? 'bg-terracotta-100/60 border-terracotta-300' : 'bg-cream-50 border-cream-200 hover:border-terracotta-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl shrink-0" aria-hidden="true">{card.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-700">{card.title}</div>
                    <div className="text-[11px] text-ink-400 mt-0.5">{card.intro}</div>
                  </div>
                  <ChevronDown
                    className="w-4 h-4 text-ink-400 shrink-0 transition-transform duration-300"
                    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    aria-hidden="true"
                  />
                </div>
              </button>
              {open && (
                <div className="mt-1.5 ml-2 px-4 py-4 rounded-xl bg-cream-100/60 border border-cream-200 space-y-3 anim-fade-up">
                  {card.items.map((item) => (
                    <div key={item.headline}>
                      <div className="text-[12px] font-medium text-ink-700 mb-0.5">{item.headline}</div>
                      <div className="text-[12px] text-ink-500 leading-relaxed">{item.body}</div>
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
/*  Phase hormone-info modal + (i) trigger                             */
/* ------------------------------------------------------------------ */

function PhaseInfoButton({ phase, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Hormonale uitleg over ${PHASE_META[phase].label}`}
      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-400
                 hover:text-sage-600 hover:bg-sage-50 active:scale-95 transition"
    >
      <Info aria-hidden="true" className="w-4 h-4" />
    </button>
  );
}

function PhaseInfoModal({ phase, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!phase) return null;
  const meta = PHASE_META[phase];
  const info = PHASE_HORMONES[phase];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 py-6 bg-ink-700/40 backdrop-blur-sm anim-fade-up"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="phase-info-title"
    >
      <div
        className="w-full max-w-md bg-cream-50 rounded-2xl shadow-glow overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: meta.bg }}
          >
            <Sparkles className="w-5 h-5" style={{ color: meta.hue }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">
              {meta.label} · {meta.subtitle}
            </div>
            <h2 id="phase-info-title" className="font-display text-[22px] text-ink-700 leading-snug">
              {info.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Uitleg sluiten"
            className="w-9 h-9 rounded-full bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-400 hover:text-ink-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div>
            <div className="text-[12px] font-medium text-ink-700 mb-1">{info.summary}</div>
            <p className="text-sm text-ink-500 leading-relaxed">{info.body}</p>
          </div>
          <div className="px-4 py-3.5 rounded-xl bg-cream-100/60 border border-cream-200">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-1">
              {info.moodHeadline}
            </div>
            <p className="text-sm text-ink-600 leading-relaxed">{info.mood}</p>
          </div>
          <div
            className="px-4 py-3.5 rounded-xl border"
            style={{ background: meta.bg + '99', borderColor: meta.hue + '55' }}
          >
            <p className="text-sm font-medium leading-relaxed" style={{ color: meta.hue }}>
              {info.affirmation}
            </p>
          </div>
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-sage-500 text-cream-50 py-3 text-sm font-medium hover:bg-sage-600 active:scale-[0.98] transition"
          >
            Begrepen
          </button>
        </div>
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
    try {
      if (localStorage.getItem('aura.pwa.dismissed')) return;
    } catch { /* storage unavailable — show the prompt anyway */ }
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
    try { localStorage.setItem('aura.pwa.dismissed', '1'); }
    catch (err) { notifyStorageError(err); }
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
          aria-label="Installatie-prompt sluiten"
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
/*  First-run welcome modal — drie stappen, lichtgewicht               */
/* ------------------------------------------------------------------ */

const CYCLE_PRESETS = [
  { id: 'short',  label: 'Kort',      hint: '21–25 dagen', value: 23 },
  { id: 'medium', label: 'Gemiddeld', hint: '26–31 dagen', value: 28 },
  { id: 'long',   label: 'Lang',      hint: '32–38 dagen', value: 35 },
];

function defaultLastPeriodISO() {
  // 14 dagen geleden — typische middenfase, geeft een neutraal beginpunt
  // voor iemand die het écht niet meer weet.
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return toISODate(d);
}

function WelcomeModal({ profile, onComplete }) {
  const [step, setStep] = useState(0);
  const [lastPeriod, setLastPeriod] = useState(
    profile?.lastPeriodStart || defaultLastPeriodISO()
  );
  const [avgCycle, setAvgCycle] = useState(
    profile?.cycleLength || 28
  );

  const finish = (overrides = {}) => {
    const patch = {
      ...profile,
      lastPeriodStart: overrides.lastPeriod ?? lastPeriod,
      cycleLength:     overrides.avgCycle   ?? avgCycle,
      onboardingDone:  true,
    };
    saveProfile(patch);
    onComplete(patch);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center px-4 py-6 bg-ink-700/40 backdrop-blur-sm anim-fade-up"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
    >
      <div className="w-full max-w-md bg-cream-50 rounded-2xl shadow-glow overflow-hidden">
        {/* Step indicator */}
        <div className="flex justify-center gap-2 pt-6">
          {[0, 1, 2].map((i) => (
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

        <div className="px-6 pt-5 pb-6">
          {step === 0 && (
            <>
              <h2 id="welcome-modal-title" className="font-display text-[26px] text-ink-700 leading-tight mb-2">
                Welkom bij Aura 🌸
              </h2>
              <p className="text-sm text-ink-500 leading-relaxed mb-2">
                Aura helpt je je cyclus te begrijpen en je lichaam beter te leren kennen.
              </p>
              <p className="text-sm text-ink-500 leading-relaxed mb-6">
                Drie korte vragen, dan ben je klaar.
              </p>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full rounded-xl bg-sage-500 text-cream-50 py-3.5 font-medium
                           hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2"
              >
                Volgende <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full mt-3 text-[12px] text-ink-400 hover:text-ink-600 underline decoration-dotted underline-offset-4 py-2 min-h-[44px]"
              >
                Sla over
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <h2 id="welcome-modal-title" className="font-display text-[24px] text-ink-700 leading-tight mb-2">
                Wanneer begon je laatste menstruatie?
              </h2>
              <p className="text-sm text-ink-500 leading-relaxed mb-5">
                Geen idee? Een schatting werkt prima — je kunt dit later aanpassen.
              </p>
              <input
                type="date"
                value={lastPeriod}
                onChange={(e) => setLastPeriod(e.target.value)}
                className={inputCx}
                aria-label="Datum laatste menstruatiestart"
              />
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="px-4 py-3 rounded-xl bg-cream-100 border border-cream-200 text-ink-500 text-sm hover:bg-cream-200 transition flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" /> Terug
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 rounded-xl bg-sage-500 text-cream-50 py-3 font-medium hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm"
                >
                  Volgende <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full mt-3 text-[12px] text-ink-400 hover:text-ink-600 underline decoration-dotted underline-offset-4 py-2 min-h-[44px]"
              >
                Sla over
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 id="welcome-modal-title" className="font-display text-[24px] text-ink-700 leading-tight mb-2">
                Hoe lang duurt jouw cyclus gemiddeld?
              </h2>
              <p className="text-sm text-ink-500 leading-relaxed mb-5">
                Aura leert je ritme vanzelf — kies wat het dichtst klopt.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {CYCLE_PRESETS.map((preset) => {
                  const active = avgCycle === preset.value;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setAvgCycle(preset.value)}
                      className={`text-left px-4 py-3 rounded-xl border transition active:scale-[0.99] min-h-[44px] ${
                        active
                          ? 'bg-sage-100 border-sage-300 text-sage-700'
                          : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
                      }`}
                    >
                      <div className="text-sm font-medium">
                        {preset.label} <span className="text-ink-400 font-normal">· {preset.hint}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-xl bg-cream-100 border border-cream-200 text-ink-500 text-sm hover:bg-cream-200 transition flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" /> Terug
                </button>
                <button
                  type="button"
                  onClick={() => finish()}
                  className="flex-1 rounded-xl bg-sage-500 text-cream-50 py-3 font-medium hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm"
                >
                  Aan de slag <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
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
      name:            String(form.name || '').trim().slice(0, 60),
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
                    aria-label="Cycluslengte verlagen"
                    onClick={() => setF('cycleLength', Math.max(21, form.cycleLength - 1))}
                    className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                               text-ink-600 hover:bg-sage-100 hover:border-sage-200
                               transition text-xl flex items-center justify-center"
                  >−</button>
                  <div className="flex-1 text-center" aria-live="polite">
                    <span className="font-display text-[36px] text-ink-700 leading-none">
                      {form.cycleLength}
                    </span>
                    <span className="text-sm text-ink-400 ml-1.5">dagen</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Cycluslengte verhogen"
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
                    aria-label="Menstruatieduur verlagen"
                    onClick={() => setF('mensDuration', Math.max(2, form.mensDuration - 1))}
                    className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                               text-ink-600 hover:bg-sage-100 hover:border-sage-200
                               transition text-xl flex items-center justify-center"
                  >−</button>
                  <div className="flex-1 text-center" aria-live="polite">
                    <span className="font-display text-[36px] text-ink-700 leading-none">
                      {form.mensDuration}
                    </span>
                    <span className="text-sm text-ink-400 ml-1.5">dagen</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Menstruatieduur verhogen"
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
/*  Card order editor — drag-to-reorder dashboard layout               */
/* ------------------------------------------------------------------ */

// HTML5 drag-and-drop op de rijen, plus pijltoetsen voor toetsenbord-
// gebruikers. Auto-save bij elke wijziging — geen aparte "opslaan"-knop
// want dat zou de directe feedback breken die maakt dat slepen leuk
// voelt.
function CardOrderEditor() {
  const [order, setOrder] = useState(() => resolveCardOrder(loadCardOrder()));
  const [dragId, setDragId]       = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const labelById = useMemo(() => {
    const map = {};
    for (const c of CARD_REGISTRY) map[c.id] = c;
    return map;
  }, []);

  const commit = (next) => {
    setOrder(next);
    saveCardOrder(next);
  };

  const move = (id, delta) => {
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= order.length) return;
    const next = order.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
  };

  const reorderTo = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const next = order.filter((id) => id !== sourceId);
    const targetIdx = next.indexOf(targetId);
    if (targetIdx < 0) return;
    next.splice(targetIdx, 0, sourceId);
    commit(next);
  };

  const handleReset = () => {
    saveCardOrder(null);
    setOrder(CARD_REGISTRY.map((c) => c.id));
  };

  return (
    <Card className="p-6 mb-5 anim-fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Schermindeling aanpassen</div>
        <button
          type="button"
          onClick={handleReset}
          className="text-[11px] text-ink-500 hover:text-sage-700 underline-offset-2 hover:underline transition"
        >
          Standaard volgorde herstellen
        </button>
      </div>
      <p className="text-[12px] text-ink-500 mb-4 leading-relaxed">
        Sleep de kaarten in de gewenste volgorde, of gebruik de pijltjes.
        Wijzigingen worden meteen bewaard.
      </p>
      <ul className="space-y-1.5" aria-label="Kaartvolgorde">
        {order.map((id, idx) => {
          const meta = labelById[id];
          if (!meta) return null;
          const isDragging = dragId === id;
          const isOver     = dragOverId === id && dragId && dragId !== id;
          return (
            <li
              key={id}
              draggable
              onDragStart={(e) => {
                setDragId(id);
                e.dataTransfer.effectAllowed = 'move';
                // Sommige browsers tonen geen drag-image zonder payload.
                try { e.dataTransfer.setData('text/plain', id); } catch { /* no-op */ }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverId !== id) setDragOverId(id);
              }}
              onDragLeave={() => {
                if (dragOverId === id) setDragOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                reorderTo(dragId, id);
                setDragId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDragOverId(null);
              }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition select-none
                ${isDragging ? 'opacity-50 border-sage-300 bg-sage-50' : 'border-cream-200 bg-cream-50'}
                ${isOver ? 'border-sage-400 bg-sage-100/60' : ''}`}
            >
              <span
                aria-hidden="true"
                className="text-ink-400 cursor-grab active:cursor-grabbing px-1 select-none text-base leading-none"
                title="Sleep om te verplaatsen"
              >
                ⠿
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-700 truncate">{meta.label}</div>
                {meta.alwaysVisible && (
                  <div className="text-[10px] text-ink-400 mt-0.5">(altijd zichtbaar)</div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={idx === 0}
                  aria-label={`${meta.label} omhoog`}
                  className="w-8 h-8 rounded-lg border border-cream-200 bg-cream-50 text-ink-500
                             hover:border-sage-200 hover:text-sage-700 transition
                             disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(id, +1)}
                  disabled={idx === order.length - 1}
                  aria-label={`${meta.label} omlaag`}
                  className="w-8 h-8 rounded-lg border border-cream-200 bg-cream-50 text-ink-500
                             hover:border-sage-200 hover:text-sage-700 transition
                             disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  ↓
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
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
    // Trim + cap the name so a runaway paste can't bloat the profile blob.
    // React already escapes everything we render, so no HTML stripping needed.
    const cleanName = String(form.name || '').trim().slice(0, 60);
    onSave({
      ...profile,
      name:          cleanName,
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
                aria-label="Cycluslengte verlagen"
                onClick={() => setF('cycleLength', Math.max(21, form.cycleLength - 1))}
                className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                           text-ink-600 hover:bg-sage-100 hover:border-sage-200
                           transition text-xl flex items-center justify-center"
              >−</button>
              <div className="flex-1 text-center" aria-live="polite">
                <span className="font-display text-[36px] text-ink-700 leading-none">
                  {form.cycleLength}
                </span>
                <span className="text-sm text-ink-400 ml-1.5">dagen</span>
              </div>
              <button
                type="button"
                aria-label="Cycluslengte verhogen"
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
            role="switch"
            aria-checked={notifEnabled}
            aria-label="Dagelijkse herinnering inschakelen"
            onClick={handleNotifToggle}
            className={`relative w-12 h-6 rounded-full transition ${notifEnabled ? 'bg-sage-500' : 'bg-cream-300'}`}
          >
            <div aria-hidden="true" className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${notifEnabled ? 'left-7' : 'left-1'}`} />
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
                aria-pressed={active}
                className={`flex flex-col items-center gap-1.5 min-h-[44px] py-3 rounded-xl border transition active:scale-95 ${
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

      {/* Schermindeling — drag-to-reorder dashboard cards */}
      <CardOrderEditor />

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

      {/* Gegevens — exports voor jezelf, je arts, of een andere app */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">Gegevens</div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => exportDoctorCSV(profile)}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-sage-200 bg-sage-50
                       text-sage-700 text-sm hover:bg-sage-100 transition"
          >
            <span aria-hidden="true">📥</span>
            Exporteer naar CSV (voor arts)
          </button>
          <button
            type="button"
            onClick={() => exportCSV(profile)}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-cream-200 bg-cream-50
                       text-ink-600 text-sm hover:border-sage-200 hover:bg-sage-50 transition"
          >
            <Download className="w-4 h-4" />
            CSV exporteren (90 dagen, alle velden)
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

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">Aura · v1.3</div>
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
        Aura · v1.3 · laatst bijgewerkt 3 mei 2026
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

function CycleRing({ state, ovulationDay }) {
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

  // Plaats een ovulatie-marker op de ring als de eisprongdag bekend is.
  // SVG is `-rotate-90`, dus dag 1 begint bovenaan (12 uur). We rekenen
  // de hoek terug naar gewone XY-coordinaten zodat de marker goed
  // gepositioneerd is, ongeacht de rotatie van de hele <svg>.
  const ovulationPos = useMemo(() => {
    if (!ovulationDay || !state.cycleLength) return null;
    const t = (ovulationDay - 1) / state.cycleLength; // 0..1 over cyclus
    const angle = -Math.PI / 2 + t * 2 * Math.PI;
    return {
      x: size / 2 + r * Math.cos(angle),
      y: size / 2 + r * Math.sin(angle),
    };
  }, [ovulationDay, state.cycleLength]);

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
      {ovulationPos && (
        <div
          aria-label="Eisprong-indicator"
          className="absolute pointer-events-none anim-breathe"
          style={{
            left: ovulationPos.x - 9,
            top:  ovulationPos.y - 9,
            width: 18, height: 18,
          }}
        >
          <div className="w-full h-full rounded-full bg-cream-50 border-2 border-sage-500 shadow-soft flex items-center justify-center">
            <span className="block w-1.5 h-1.5 rounded-full bg-sage-500" />
          </div>
        </div>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Dag</div>
        <div className="font-display text-[54px] leading-none text-ink-700">
          {state.cycleDay ?? '—'}
        </div>
        <div className="text-xs text-ink-400 mt-1">van {state.cycleLength}</div>
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

  // Hormone-info modal state. The (i)-icoontje opent altijd een uitleg
  // voor de huidige fase; we houden de phase-key in state zodat een
  // toekomstige aanroep "open uitleg voor andere fase" makkelijk past.
  const [phaseInfo, setPhaseInfo] = useState(null);
  const [manualFoodOpen, setManualFoodOpen] = useState(false);

  const todayISO = useMemo(() => isoDate(), []);

  // Detecteer ovulatie uit de laatste 21 dagen basaaltemperatuur.
  // We herberekenen alleen wanneer de temperatuur van vandaag verandert
  // — eerdere dagen mutaties zijn zeldzaam en het volgende laden van de
  // dashboard-component pakt die alsnog op.
  const ovulationDetection = useMemo(() => {
    const recent = loadRecentLogs(21);
    const liveSeries = recent.map((e) => ({
      date: e.iso,
      temperature: e.iso === todayISO ? log.temperature : e.log.temperature,
    }));
    return detectOvulationFromTemperatureSeries(liveSeries);
  }, [log.temperature, todayISO]);

  // Cyclus-dag van de gedetecteerde eisprong, voor de marker op de ring.
  const ovulationCycleDay = useMemo(() => {
    if (!ovulationDetection?.ovulationISO || !profile?.lastPeriodStart) return null;
    const d = new Date(`${ovulationDetection.ovulationISO}T00:00:00`);
    const start = new Date(`${toISODate(profile.lastPeriodStart)}T00:00:00`);
    const diff = Math.round((d - start) / (24 * 60 * 60 * 1000));
    if (diff < 0 || diff >= state.cycleLength) return null;
    return diff + 1;
  }, [ovulationDetection, profile?.lastPeriodStart, state.cycleLength]);

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
      }, 320);
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

  const addManualFood = (entry) => {
    // We bewaren de meal-rij voor later detail-overzicht én rekenen de
    // macro's door naar het dagtotaal. Carbs/fats hebben (nog) geen eigen
    // teller op het dashboard, maar blijven bewaard in `meals` zodat ze
    // niet verloren gaan.
    const meal = {
      name:    entry.name,
      kcal:    entry.kcal    || 0,
      protein: entry.protein || 0,
      carbs:   entry.carbs   || 0,
      fat:     entry.fat     || 0,
      time:    new Date().toTimeString().slice(0, 5),
    };
    updateLog({
      calories: Math.min(99999, log.calories + meal.kcal),
      protein:  Math.min(99999, log.protein  + meal.protein),
      meals:    [...(Array.isArray(log.meals) ? log.meals : []), meal],
    });
  };

  const addProtein  = (g)    => updateLog({ protein:  Math.min(99999, log.protein  + g) });
  const setProtein  = (g)    => updateLog({ protein:  g });
  const addCalories = (kcal) => updateLog({ calories: Math.min(99999, log.calories + kcal) });
  const setCalories = (kcal) => updateLog({ calories: kcal });
  const setWater    = (g)    => updateLog({ hydration: Math.max(0, Math.min(waterGlassTarget, g)) });
  const toggleGut   = (id)   => updateLog({ gut: { [id]: !log.gut[id] } });
  const setSleep    = (h)    => updateLog({ sleep: h });
  const setMovement = (m)    => updateLog({ movement: m });
  const setNote     = (txt)  => updateLog({ note: txt });
  const setTemperature  = (t)    => updateLog({ temperature: t });
  const setSportIntensity = (id) => updateLog({ sportIntensity: id });

  const periodLoggedToday = isPeriodLoggedOn(profile);

  const displayName = profile.name ? profile.name.split(' ')[0] : null;

  // Volgorde van de kaarten — geladen op mount; Dashboard wordt opnieuw
  // gemount bij elke tabswitch, dus aanpassingen vanuit Instellingen
  // worden vanzelf zichtbaar zodra de gebruiker terug naar 'home' gaat.
  const cardOrder = useMemo(() => resolveCardOrder(loadCardOrder()), []);

  // Per-id renderers. Conditionele kaarten (bleeding-details,
  // selfcare-general, cycle-history, weekly-history) returnen `null`
  // wanneer ze niet relevant zijn — de positie blijft gereserveerd zodat
  // de volgorde stabiel blijft als de conditie omslaat.
  const cardRenderers = {
    'cycle-phase': () => (
      <Card key="cycle-phase" className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '40ms' }}>
        <div className="flex flex-col items-center">
          <CycleRing state={state} ovulationDay={ovulationCycleDay} />
          <div className="flex items-center gap-2 mt-5 flex-wrap justify-center">
            <PhaseIcon className="w-4 h-4 shrink-0" style={{ color: state.phaseMeta.hue }} />
            <div className="font-display text-xl text-ink-700">{state.phaseMeta.label}</div>
            <span className="text-ink-400">·</span>
            <div className="text-sm text-ink-500">{state.phaseMeta.subtitle}</div>
            <PhaseInfoButton phase={state.phase} onOpen={() => setPhaseInfo(state.phase)} />
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
    ),

    'log-today':       () => <SymptomTracker key="log-today" log={log} onUpdate={updateLog} />,
    'goal-rings':      () => <GoalRings key="goal-rings" log={log} goals={profile.goals} targets={targets} />,

    'protein-tracker': () => (
      <Card key="protein-tracker" className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '160ms' }}>
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
        <button
          type="button"
          onClick={() => setManualFoodOpen(true)}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                     border border-sage-200 bg-sage-50 text-sage-700 text-sm font-medium
                     hover:bg-sage-100 hover:border-sage-300 active:scale-[0.99] transition"
          aria-label="Voeg handmatig een voedingsitem toe aan vandaag"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Handmatig invoeren
        </button>
      </Card>
    ),

    'basal-temp': () => (
      <BasalTemperatureCard
        key="basal-temp"
        todayTemp={log.temperature}
        todayISO={todayISO}
        onChange={setTemperature}
        ovulationDetection={ovulationDetection}
      />
    ),

    'ovulation': () => (
      <OvulationTracker
        key="ovulation"
        ovulation={log.ovulation}
        onUpdate={updateLog}
        autoDetectedISO={ovulationDetection?.ovulationISO}
      />
    ),

    'bleeding-details': () =>
      periodLoggedToday
        ? <BleedingDetailsCard key="bleeding-details" bleeding={log.bleeding} onUpdate={updateLog} />
        : null,

    'sport-tracker': () => (
      <SportTrackerCard
        key="sport-tracker"
        phase={state.phase}
        intensity={log.sportIntensity}
        onChange={setSportIntensity}
      />
    ),

    'wellbeing': () => (
      <WellbeingCard key="wellbeing" log={log} onUpdate={updateLog} />
    ),

    'cycle-calendar': () => (
      <CycleCalendarCard key="cycle-calendar" profile={profile} />
    ),

    'sleep-movement': () => (
      <CollapsibleCard
        key="sleep-movement"
        id="sleep-movement"
        title="Slaap & beweging"
        className="mb-5"
        style={{ animationDelay: '200ms' }}
      >
        <div className="space-y-6">
          <SleepTracker hours={log.sleep} onChange={setSleep} />
          <div className="h-px bg-cream-200/70" />
          <MovementTracker minutes={log.movement} onChange={setMovement} phase={state.phase} />
        </div>
      </CollapsibleCard>
    ),

    'cycle-history':  () => <CycleHistoryStrip key="cycle-history" profile={profile} />,
    'weekly-history': () => <WeeklyHistoryStrip key="weekly-history" profile={profile} todayLog={log} />,

    'gut': () => {
      const gutDone = Object.values(log.gut).filter(Boolean).length;
      return (
        <CollapsibleCard
          key="gut"
          id="gut"
          title="Darmgezondheid"
          headerExtra={
            gutDone > 0 ? (
              <span className="text-[11px] text-sage-600 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full">
                {gutDone} van 3 gelogd
              </span>
            ) : (
              <span className="text-[11px] text-ink-400">0 van 3</span>
            )
          }
          className="mb-5"
          style={{ animationDelay: '240ms' }}
        >
          <GutChecklist gut={log.gut} onToggle={toggleGut} />
        </CollapsibleCard>
      );
    },

    'nutrient-focus': () => (
      <CollapsibleCard
        key="nutrient-focus"
        id="focus"
        title="Nutriëntenfocus"
        className="mb-5"
        style={{ animationDelay: '280ms' }}
      >
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
      </CollapsibleCard>
    ),

    'journal': () => (
      <Card key="journal" className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '340ms' }}>
        <JournalNote note={log.note} onChange={setNote} />
      </Card>
    ),

    'tip-of-day': () => (
      <TipVanDeDag
        key="tip-of-day"
        phase={state.phase}
        log={log}
        goals={profile.goals}
        targets={targets}
        name={profile.name}
      />
    ),

    'insights': () => (
      <Card key="insights" className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '380ms' }}>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          Dagelijks inzicht
        </div>
        <p className="font-display text-[19px] leading-snug text-ink-700">
          {insight.text}
        </p>
      </Card>
    ),

    'selfcare-general': () =>
      state.phase === PHASES.MENSTRUAL
        ? <MenstrualSelfCareCards key="selfcare-general" />
        : null,
  };

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
            type="button"
            onClick={onOpenSettings}
            aria-label="Instellingen openen"
            className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-500 hover:text-ink-700 transition"
          >
            <Settings aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Day summary — compact above-the-fold progress */}
      <DaySummaryStrip
        log={log}
        goals={profile.goals}
        targets={targets}
        waterGlassTarget={waterGlassTarget}
      />

      {cardOrder.map((id) => {
        const renderer = cardRenderers[id];
        return renderer ? renderer() : null;
      })}

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">
        Aura · v1.3
      </div>

      <UndoToast visible={!!toast} dismissing={toastDismissing} onUndo={handleUndo} />

      {phaseInfo && (
        <PhaseInfoModal phase={phaseInfo} onClose={() => setPhaseInfo(null)} />
      )}

      {manualFoodOpen && (
        <ManualFoodEntryModal
          onClose={() => setManualFoodOpen(false)}
          onAdd={addManualFood}
        />
      )}
    </div>
  );
}

function UndoToast({ visible, dismissing, onUndo }) {
  if (!visible) return null;
  return (
    <div
      className={`fixed left-0 right-0 bottom-20 z-50 px-4 pointer-events-none
                  transition-all duration-300 ease-out
                  ${dismissing
                    ? 'opacity-0 translate-y-2'
                    : 'opacity-100 translate-y-0 anim-slide-up'}`}
      role="status"
      aria-live="polite"
    >
      <div className="max-w-md mx-auto pointer-events-auto">
        <button
          type="button"
          onClick={onUndo}
          aria-label="Laatste wijziging ongedaan maken"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                     bg-ink-700/95 text-cream-50 text-sm font-medium shadow-lg backdrop-blur-md
                     hover:bg-ink-700 active:scale-[0.99] transition min-h-[44px]"
        >
          <Undo2 aria-hidden="true" className="w-4 h-4" />
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
    { id: 'settings',  label: 'Profiel',     icon: Settings  },
  ];
  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="fixed bottom-0 left-0 right-0 z-50 bg-cream-50/95 backdrop-blur-md border-t border-cream-200 flex pb-safe"
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const on = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-label={label}
            aria-current={on ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center py-3 gap-1 transition min-h-[56px] active:scale-95 ${
              on ? 'text-sage-600' : 'text-ink-400 hover:text-ink-600'
            }`}
          >
            <Icon aria-hidden="true" className="w-5 h-5" strokeWidth={on ? 2 : 1.5} />
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

// Compacte vertaalmaps voor de Logboek-summary. Houden we hier zodat we
// de grotere `BLEEDING_GROUPS`/`SPORT_INTENSITIES` arrays niet dubbel
// hoeven door te lussen in een hot path (logboek rendert tot 31 entries).
const BLEEDING_LABELS = {
  light:        'Licht',
  normal:       'Normaal',
  heavy:        'Hevig',
  'very-heavy': 'Zeer hevig',
  'light-pink': 'Lichtroze',
  red:          'Rood',
  'dark-red':   'Donkerrood',
  brown:        'Bruin',
  none:         'Geen klonters',
  clear:        'Helder',
  dark:         'Donker',
};
const SPORT_INTENSITY_LABELS = Object.fromEntries(
  SPORT_INTENSITIES.map((s) => [s.id, s.label])
);

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
  const ovulationMarked = !!(log.ovulation?.felt || log.ovulation?.fromTemp);
  const bleeding = log.bleeding || {};
  const bleedingSummary = [bleeding.heaviness, bleeding.color, bleeding.clots]
    .filter((v) => v && v.length > 0)
    .map((id) => BLEEDING_LABELS[id] || id)
    .slice(0, 3)
    .join(' · ');
  const sportLabel = SPORT_INTENSITY_LABELS[log.sportIntensity] || '';
  const energieIcon  = log.energie  != null ? ENERGIE_LEVELS[log.energie - 1]?.icon  : null;
  const stemmingIcon = log.stemming != null ? STEMMING_LEVELS[log.stemming - 1]?.icon : null;
  const symptomenList = Array.isArray(log.symptomen) ? log.symptomen : [];

  return (
    <Card
      className={`p-5 anim-fade-up transition-opacity ${!hasData ? 'opacity-40' : ''}`}
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
              {(log.sleep > 0 || log.movement > 0 || log.temperature > 0 || sportLabel) && (
                <div className="flex items-center gap-3 mt-1 flex-wrap">
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
                  {log.temperature > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-ink-400">
                      <Thermometer className="w-3 h-3" />{log.temperature.toFixed(1)}°
                    </div>
                  )}
                  {sportLabel && (
                    <div className="flex items-center gap-1 text-[11px] text-ink-400">
                      <Dumbbell className="w-3 h-3" />{sportLabel}
                    </div>
                  )}
                  {ovulationMarked && (
                    <div className="flex items-center gap-1 text-[11px] text-sage-600">
                      <Heart className="w-3 h-3" />Eisprong
                    </div>
                  )}
                </div>
              )}
              {bleedingSummary && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-terracotta-500">
                  <Droplet className="w-3 h-3" />
                  <span>{bleedingSummary}</span>
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
              {(energieIcon || stemmingIcon) && (
                <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-500">
                  {energieIcon && (
                    <span title="Energie" className="flex items-center gap-1">
                      <span className="text-ink-400">Energie</span>
                      <span className="text-base leading-none">{energieIcon}</span>
                    </span>
                  )}
                  {stemmingIcon && (
                    <span title="Stemming" className="flex items-center gap-1">
                      <span className="text-ink-400">Stemming</span>
                      <span className="text-base leading-none">{stemmingIcon}</span>
                    </span>
                  )}
                </div>
              )}
              {symptomenList.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {symptomenList.map((name) => (
                    <span
                      key={name}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-terracotta-100/70 border border-terracotta-200 text-terracotta-600"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {log.note ? (
                <div className="text-[11px] text-ink-400/80 italic mt-1 line-clamp-2">"{log.note}"</div>
              ) : null}
            </div>
          ) : isToday ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[11px] text-ink-400/70 italic">Nog niets gelogd vandaag.</div>
              {onGoToToday && (
                <button
                  type="button"
                  onClick={onGoToToday}
                  className="text-[11px] text-sage-600 underline decoration-dotted underline-offset-2 hover:text-sage-700 active:scale-95 transition px-2 py-2 min-h-[44px] inline-flex items-center"
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
                     text-ink-500 text-xs hover:bg-cream-200 hover:text-ink-700 active:scale-95 transition min-h-[44px]"
          aria-label="Exporteer CSV"
        >
          <Download aria-hidden="true" className="w-4 h-4" />
          Exporteer
        </button>
      </header>

      {/* Month navigator */}
      <div className="flex items-center justify-between gap-2 mb-5 anim-fade-up">
        <button
          type="button"
          onClick={goPrevMonth}
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-cream-100 border border-cream-200
                     text-ink-500 text-xs hover:bg-cream-200 hover:text-ink-700 active:scale-95 transition min-h-[44px]"
          aria-label={`Ga naar ${prevMonthLabel}`}
        >
          <ChevronLeft aria-hidden="true" className="w-4 h-4" />
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
              : 'bg-cream-100 border-cream-200 text-ink-500 hover:bg-cream-200 hover:text-ink-700 active:scale-95'
          }`}
          aria-label={isCurrentMonth ? 'Geen toekomstige maanden' : `Ga naar ${nextMonthLabel}`}
        >
          {nextMonthLabel}
          <ChevronRight aria-hidden="true" className="w-4 h-4" />
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

function MiniRing({ value, target, label }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = setTimeout(() => setMounted(true), 100); return () => clearTimeout(id); }, []);

  const r = 13;
  const c = 2 * Math.PI * r;
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  const displayRatio = mounted ? ratio : 0;
  const stroke = ratio >= 1 ? '#6B8559' : ratio >= 0.5 ? '#A8BA98' : '#E2D8BE';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
        <circle cx="16" cy="16" r={r} className="goal-ring-track" stroke="#EDE6D3" strokeWidth="3" fill="none" />
        <circle
          cx="16" cy="16" r={r}
          stroke={stroke} strokeWidth="3" fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - displayRatio)}
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">{label}</div>
    </div>
  );
}

function DaySummaryStrip({ log, goals, targets, waterGlassTarget }) {
  const g = goals || {};
  const items = [
    { label: 'Kcal',     value: log.calories,        target: g.calories  || targets.calories },
    { label: 'Eiwit',    value: log.protein,         target: g.protein   || targets.protein  },
    { label: 'Water',    value: log.hydration * 250, target: g.hydration || (waterGlassTarget * 250) },
    { label: 'Beweging', value: log.movement,        target: g.movement  || 30 },
  ];

  if (!items.some((i) => i.value > 0)) return null;

  const allHit = items.every((i) => i.target > 0 && i.value / i.target >= 0.8);

  return (
    <div
      className="flex items-center gap-3 mb-5 px-4 py-4 rounded-xl3 bg-cream-50/80 backdrop-blur-sm border border-cream-200/60 shadow-soft anim-fade-up"
      aria-label="Voortgang vandaag"
    >
      <div className="flex flex-1 items-start justify-between gap-2">
        {items.map((it) => (
          <MiniRing key={it.label} value={it.value} target={it.target} label={it.label} />
        ))}
      </div>
      {allHit && (
        <div className="text-[10px] font-medium text-sage-700 bg-sage-50 border border-sage-200 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
          🌿 Goede dag!
        </div>
      )}
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
            aria-pressed={days === n}
            className={`min-h-[44px] px-5 py-2.5 rounded-full text-sm transition active:scale-95 ${days === n ? 'bg-sage-500 text-cream-50' : 'bg-cream-100 border border-cream-200 text-ink-600 hover:border-sage-200'}`}>
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
        <button
          type="button"
          onClick={onBack}
          aria-label="Terug naar inzichten"
          className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-500 hover:text-ink-700 transition"
        >
          <ChevronLeft aria-hidden="true" className="w-4 h-4" />
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

/**
 * True wanneer er nog geen enkele dagelijkse log is opgeslagen — gebruikt
 * door de welcome-modal om te detecteren of dit echt een eerste opening
 * is. We scannen lokaal naar `aura.log.*` keys want we hebben geen index
 * van logs (één key per dag is bewust gehouden — zie storage.js).
 */
function hasAnyLogs() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('aura.log.')) return true;
    }
  } catch { /* private mode — pretend the user has logs so we don't loop */ return true; }
  return false;
}

function App() {
  const [profile, setProfile] = useState(() => loadProfile());
  const [tab, setTab] = useState('home');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // We controleren één keer bij mount of er logs bestaan — als de
  // gebruikster begint met loggen mag de welkomstmodal niet midden in
  // een sessie alsnog verschijnen.
  const [welcomeNeeded, setWelcomeNeeded] = useState(() => !hasAnyLogs());
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('aura.theme') || 'auto'; }
    catch { return 'auto'; }
  });
  // Toast voor opslagfouten — eerder werden quota/private-mode errors
  // stilletjes geslikt, waardoor de gebruikster dacht dat een entry
  // bewaard was terwijl die bij reload weg was.
  const [storageErrorMsg, setStorageErrorMsg] = useState('');
  const storageErrorTimerRef = useRef(null);

  const handleThemeChange = useCallback((newTheme) => {
    setTheme(newTheme);
    try { localStorage.setItem('aura.theme', newTheme); }
    catch (err) { notifyStorageError(err); }
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = newTheme === 'dark' || (newTheme === 'auto' && sysDark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    setStorageErrorHandler((err) => {
      console.error('[Aura] storage save failed:', err);
      setStorageErrorMsg('Opslaan mislukt — mogelijk vol geheugen');
      if (storageErrorTimerRef.current) clearTimeout(storageErrorTimerRef.current);
      storageErrorTimerRef.current = setTimeout(() => setStorageErrorMsg(''), 4000);
    });
    return () => {
      setStorageErrorHandler(null);
      if (storageErrorTimerRef.current) clearTimeout(storageErrorTimerRef.current);
    };
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
                className="flex-1 min-h-[44px] py-3 rounded-xl border border-cream-200 bg-cream-100 text-ink-600 text-sm font-medium hover:bg-cream-200 active:scale-[0.98] transition"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={confirmReset}
                className="flex-1 min-h-[44px] py-3 rounded-xl bg-terracotta-400 text-cream-50 text-sm font-medium hover:bg-terracotta-500 transition active:scale-[0.98]"
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
      {welcomeNeeded && profile && profile.onboardingDone !== true && (
        <WelcomeModal
          profile={profile}
          onComplete={(next) => {
            setProfile(next);
            setWelcomeNeeded(false);
          }}
        />
      )}
      {storageErrorMsg && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-full bg-terracotta-500 text-cream-50 text-sm shadow-lg anim-fade-up whitespace-nowrap max-w-[90vw]"
        >
          {storageErrorMsg}
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
