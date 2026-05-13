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
  Thermometer, Info, Heart, Dumbbell, Plus, RefreshCw, Calendar, Briefcase,
} from 'lucide-react';

import {
  getCycleState, PHASES, PHASE_META,
  CONTRACEPTION_OPTIONS, PREGNANCY_INTENTS, suppressesCycle,
  logPeriodStart, unlogPeriodStart, isPeriodLoggedOn,
  getCycleHistory, isValidTemperature, TEMP_MIN, TEMP_MAX,
  detectOvulationFromTemperatureSeries, toISODate,
  predictNextPeriod, getFertileWindow, getFertilityStatus, atMidnight,
  daysBetween, getOverdueDays,
} from './lib/cycle.js';
import { getDailyTargets, ACTIVITY_LEVELS } from './lib/nutrition.js';
import {
  loadProfile, saveProfile, clearProfile, setStorageErrorHandler,
  loadLog, saveLog, isoDate, emptyLog, logHasData, getStreak,
  loadRecentLogs,
} from './lib/storage.js';
import {
  LocaleProvider, useT, t as tStatic, detectLocale,
} from './lib/i18n.js';
import {
  generateCsvExport, csvExportFilename,
  generateAppleHealthXml, appleHealthFilename,
  generateFullJsonExport, fullJsonExportFilename,
} from './lib/export.js';

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

function CollapsibleCard({ id, title, headerExtra, infoButton, icon: Icon, defaultCollapsed = false, className = '', style, children, bodyClassName = 'px-6 pb-6' }) {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(() => {
    const stored = readCollapsedMap()[id];
    return stored === undefined ? !!defaultCollapsed : !!stored;
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        const map = readCollapsedMap();
        map[id] = next;
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(map));
      } catch { /* storage unavailable — state still updates in memory */ }
      return next;
    });
  };

  return (
    <Card className={`overflow-hidden anim-fade-up ${className}`} style={style}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={`${title} ${collapsed ? t('common.expand') : t('common.collapse')}`}
          className="flex-1 flex items-center justify-between gap-3 px-6 py-4 min-h-[44px] text-left hover:bg-cream-100/40 transition"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {Icon && <Icon aria-hidden="true" className="w-3.5 h-3.5 text-ink-400 shrink-0" />}
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-400">{title}</span>
            {headerExtra && <div className="ml-auto">{headerExtra}</div>}
          </div>
          <ChevronDown
            className="w-4 h-4 text-ink-400 shrink-0 transition-transform duration-300"
            style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
          />
        </button>
        {infoButton && (
          <div className="flex items-center pr-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            {infoButton}
          </div>
        )}
      </div>
      <div
        aria-hidden={collapsed}
        style={{
          display: 'grid',
          gridTemplateRows: collapsed ? '0fr' : '1fr',
          transition: 'grid-template-rows 300ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div className={bodyClassName}>{children}</div>
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
      // lateCheck is óók een nested object met meerdere ja/nee-velden.
      // Zonder deze merge wist een tap op "Ja" alle eerder beantwoorde
      // vragen — gevonden in audit, regression-test in storage.test.js.
      if (patch.lateCheck) next.lateCheck = { ...current.lateCheck, ...patch.lateCheck };
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

function formatNextPeriod(daysUntil, t, formatDate) {
  if (!daysUntil || daysUntil <= 0) return t('common.soon');
  if (daysUntil === 1) return t('common.tomorrow');
  const d = new Date();
  d.setDate(d.getDate() + daysUntil);
  const month = formatDate(d, { month: 'short' });
  return t('cycle.next.daysFmt', { month, day: d.getDate(), n: daysUntil });
}

function shortMonth(iso, formatDate) {
  const d = new Date(`${iso}T00:00:00`);
  return formatDate(d, { month: 'short' }).toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  CSV export                                                         */
/* ------------------------------------------------------------------ */
//
// XML/CSV pure-generatie staat in `src/lib/export.js`. Deze wrapper
// verzamelt 90 dagen aan logs + cycle-state, geeft 'm aan de pure
// helper en doet de Blob-download. Eerder zat de generatie inline
// hier; dat had:
//   1. CSV-injection (geen `=`/`@`/`+`/`-` prefix escape) — aanvallen
//      via een journal-note die in Excel/Sheets/Numbers RCE gaf
//      wanneer de gebruikster de export met haar arts deelde.
//   2. Lege dagen werden als rijen met nullen geëxporteerd — een arts
//      die de CSV las dacht "die dag heeft ze niks gehad", terwijl het
//      betekende "die dag heeft ze niks gelogd". Klinisch verschil.
// `generateCsvExport` lost beide op (csvCell escape + skip-empty
// optioneel — hier filteren we via logHasData).

function exportCSV(profile) {
  const today = new Date();
  const entries = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const log = loadLog(d);
    if (!logHasData(log)) continue;       // skip lege dagen — geen valse-leeg-rijen
    const state = getCycleState(profile, d);
    entries.push({
      iso: isoDate(d),
      date: d,
      phase: state.phase,
      cycleDay: state.cycleDay ?? '',
      log,
    });
  }

  const csv = generateCsvExport(entries);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = csvExportFilename(today);
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Apple Health XML export (feature 7)                               */
/* ------------------------------------------------------------------ */
//
// XML-generatie zit in src/lib/export.js (`generateAppleHealthXml`)
// zodat 'm getest kan worden zonder DOM. Deze functie verzamelt 90
// dagen aan logs en regelt het Blob-download — meer niet.

function exportAppleHealth(profile, onEmpty) {
  const today = new Date();
  const entries = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    entries.push({ iso: d.toISOString().slice(0, 10), log: loadLog(d) });
  }

  const xml = generateAppleHealthXml(entries, { today });
  if (!xml) {
    onEmpty?.();
    return;
  }

  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = appleHealthFilename(today);
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Full JSON export — AVG art. 20 portabiliteit                       */
/* ------------------------------------------------------------------ */
//
// CSV en Apple Health zijn quick-share-formaten met afgeleide data.
// Voor de echte data-portabiliteit (AVG art. 20: gestructureerd,
// gangbaar, machineleesbaar) is een volledige JSON-dump nodig die
// álle logs én profile bevat — niet alleen de laatste 90 dagen.
//
// We scannen iso-keys uit localStorage (geen vast venster) zodat een
// gebruikster die 2+ jaar tracking heeft niet zwijgend afgekapt wordt.

function exportFullJson(profile) {
  const today = new Date();
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('aura.log.')) {
        const iso = key.slice('aura.log.'.length);
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
          // Gebruik loadLog zodat we via de gevalideerde pipeline
          // gaan (type-safe, prototype-pollution guard, length-caps).
          entries.push({ iso, log: loadLog(new Date(`${iso}T00:00:00`)) });
        }
      }
    }
  } catch (err) {
    console.error('[Aura] full export: localStorage scan failed', err);
  }
  // Sort chronologisch — de blob is daarna voor mensen leesbaar.
  entries.sort((a, b) => a.iso.localeCompare(b.iso));

  const json = generateFullJsonExport(profile, entries, { today });
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fullJsonExportFilename(today);
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
  const { t } = useT();
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
        aria-label={label ? t('tracker.input.aria', { label, unit }) : t('tracker.input.unitOnly', { unit })}
      />
      <span className="text-ink-400 text-sm">/ {target} {unit}</span>
    </div>
  );
}

function TrackerRow({ icon: Icon, label, value, target, unit, increments, onAdd, onSet }) {
  const { t } = useT();
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  const pctVal = Math.round(ratio * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-ink-400" />}
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{label}</div>
        </div>
        <NumberValue value={value} unit={unit} target={target} label={label} onChange={onSet} />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1"><SoftProgress value={value} target={target} /></div>
        <div className={`text-[10px] font-semibold tabular-nums w-9 text-right ${ratio >= 1 ? 'text-sage-600' : pctVal > 0 ? 'text-ink-600' : 'text-ink-400'}`}>
          {ratio >= 1 ? '✓' : `${pctVal}%`}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {increments.map((inc) => (
          <Chip key={inc} onClick={() => onAdd(inc)} ariaLabel={t('tracker.add.aria', { inc, unit })}>
            +{inc} {unit}
          </Chip>
        ))}
        {value > 0 && (
          <Chip onClick={() => onSet(0)} ariaLabel={t('tracker.clear.aria', { label })}>
            {t('tracker.clear')}
          </Chip>
        )}
      </div>
    </div>
  );
}

function HydrationRow({ glasses, target, onChange }) {
  const { t } = useT();
  const slots = Array.from({ length: target }, (_, i) => i + 1);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Droplet className="w-3.5 h-3.5 text-ink-400" />
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{t('tracker.water')}</div>
        </div>
        <div className="font-display text-ink-700 text-[20px] leading-none">
          {glasses}<span className="text-ink-400 text-sm"> / {target} {t('common.glasses')}</span>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {slots.map((slot) => {
          const filled = slot <= glasses;
          return (
            <button
              key={slot}
              type="button"
              aria-label={t('tracker.water.aria', { n: slot })}
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
        {t('tracker.water.hint')}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Symptom tracker                                                    */
/* ------------------------------------------------------------------ */

function SymptomTracker({ log, onUpdate }) {
  const { t, symptomMeta } = useT();
  const syms = log.symptoms || {};
  const anyLogged = Object.values(syms).some(v => v > 0);
  const meta = symptomMeta();

  return (
    <CollapsibleCard
      id="symptoms"
      title={t('symptoms.title')}
      defaultCollapsed={false}
      headerExtra={anyLogged && (
        <span className="text-[11px] text-sage-600 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full">
          {t('symptoms.logged')}
        </span>
      )}
      className="mb-5"
      style={{ animationDelay: '80ms' }}
    >
      <div className="space-y-5">
        {meta.map(({ id, label, icons, hint }) => {
          const val = syms[id] ?? 0;
          return (
            <div key={id}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-sm font-medium text-ink-600">{label}</div>
                {val > 0 ? (
                  <div className="text-xs font-semibold text-sage-600 bg-sage-100 px-2 py-0.5 rounded-full">{val}/5</div>
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
                      className={`flex-1 min-h-[44px] py-3 rounded-xl border transition active:scale-95 text-sm font-medium ${
                        active
                          ? 'bg-sage-100 border-sage-300 text-sage-700 shadow-soft'
                          : 'bg-cream-50 border-cream-200 text-ink-500 hover:border-sage-200'
                      }`}
                      aria-label={t('symptoms.aria', { label, n })}
                      aria-pressed={active}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Cycle history strip                                                */
/* ------------------------------------------------------------------ */

function CycleHistoryStrip({ profile }) {
  const { t, formatDate } = useT();
  const history = getCycleHistory(profile, 4);
  if (history.length === 0) return null;

  const avg = Math.round(
    history.reduce((sum, g) => sum + g.length, 0) / history.length
  );

  const barHeight = (len) => {
    const tt = Math.min(1, Math.max(0, (len - 21) / 24));
    return 44 + Math.round(tt * 48);
  };

  return (
    <CollapsibleCard
      id="cycleHistory"
      title={t('cycle.recent.title')}
      defaultCollapsed={true}
      headerExtra={(
        <span className="text-[11px] text-sage-600 bg-sage-100 px-2.5 py-1 rounded-full">
          {t('cycle.recent.avg', { n: avg })}
        </span>
      )}
      className="mb-5"
      style={{ animationDelay: '120ms' }}
    >
      <div className="flex items-end justify-around gap-3 h-[120px] px-1">
        {history.map((gap) => (
          <div key={gap.start} className="flex-1 flex flex-col items-center justify-end min-w-0">
            <div className="font-display text-[15px] text-ink-700 mb-1 leading-none">
              {gap.length}
              <span className="text-[10px] text-ink-400 ml-0.5">{t('common.daysShort')}</span>
            </div>
            <div
              className="w-full max-w-[42px] rounded-t-xl shadow-soft"
              style={{
                height: `${barHeight(gap.length)}px`,
                background: 'linear-gradient(180deg, #C6D3BB 0%, #87A074 60%, #C78264 100%)',
              }}
              aria-label={t('cycle.recent.barAria', { len: gap.length, date: gap.start })}
            />
            <div className="text-[10px] text-ink-400 uppercase tracking-wider mt-2">
              {shortMonth(gap.end, formatDate)}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-ink-400 text-center mt-4 leading-relaxed">
        {t('cycle.recent.foot')}
      </p>
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Weekly nourishment strip                                           */
/* ------------------------------------------------------------------ */

function WeeklyHistoryStrip({ profile, todayLog }) {
  const { t, formatDate, phaseMeta } = useT();
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
    <CollapsibleCard
      id="weeklyHistory"
      title={t('week.title')}
      defaultCollapsed={true}
      headerExtra={(
        <span className="text-[11px] text-ink-400">{t('week.last7')}</span>
      )}
      className="mb-5"
      style={{ animationDelay: '200ms' }}
    >
      <WeekBarRow label={t('tracker.cal')}     values={days.map((d) => d.pctCalories)} />
      <WeekBarRow label={t('tracker.protein')} values={days.map((d) => d.pctProtein)}  />
      <WeekBarRow label={t('tracker.water')}   values={days.map((d) => d.pctWater)}    />

      <div className="flex gap-1.5 mt-4">
        {days.map((d) => (
          <div key={isoDate(d.date)} className="flex-1 flex flex-col items-center">
            <div
              className={`text-[10px] uppercase tracking-wider ${
                d.isToday ? 'text-sage-700 font-semibold' : 'text-ink-400'
              }`}
            >
              {formatDate(d.date, { weekday: 'narrow' })}
            </div>
            {d.isToday && <div className="w-1 h-1 rounded-full bg-sage-500 mt-1" />}
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 mt-3" aria-label={t('week.phaseStrip.aria')}>
        {days.map((d) => (
          <div
            key={`phase-${isoDate(d.date)}`}
            className="flex-1 h-[3px] rounded-full"
            style={{ background: d.phaseHue, opacity: 0.55 }}
            title={phaseMeta(d.phase).label}
          />
        ))}
      </div>

      <p className="text-[11px] text-ink-400 text-center mt-4 leading-relaxed">
        {t('week.foot')}
      </p>
    </CollapsibleCard>
  );
}

function WeekBarRow({ label, values }) {
  const { t } = useT();
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
              aria-label={t('week.bar.aria', { label, n: i + 1, pct: Math.round(v) })}
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

function PeriodLogButton({ profile, onUpdateProfile, state }) {
  const { t, plural } = useT();
  const loggedToday = isPeriodLoggedOn(profile);
  const cyclesTracked = profile.periodHistory?.length ?? 0;
  const [justLogged, setJustLogged] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Days since most recent period start — only meaningful while in the
  // menstrual phase. Used to show "Day X" / "Started X days ago" so the
  // CTA confirms what was just logged instead of a generic "logged today".
  const daysSinceStart = useMemo(() => {
    if (!profile.lastPeriodStart) return null;
    const start = new Date(toISODate(profile.lastPeriodStart) + 'T00:00:00');
    const now = new Date(toISODate(new Date()) + 'T00:00:00');
    const diff = Math.round((now - start) / (24 * 60 * 60 * 1000));
    return diff >= 0 && diff < 14 ? diff : null;
  }, [profile.lastPeriodStart]);

  const inMenstrualPhase = state?.phase === PHASES.MENSTRUAL;

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
        <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-terracotta-100 border border-terracotta-200 text-terracotta-700 text-sm">
          <Check className="w-4 h-4" />
          {t('period.logged.label')}
        </div>
        {daysSinceStart === 0 && (
          <div className="text-[11px] text-ink-500">
            {t('period.day', { n: 1 })}
          </div>
        )}
        <button
          type="button"
          onClick={handleUndo}
          aria-label={t('period.logged.undoAria')}
          className="text-xs text-ink-400 hover:text-ink-600 underline decoration-dotted underline-offset-4 transition px-3 py-2 min-h-[44px] inline-flex items-center"
        >
          {t('period.logged.undo')}
        </button>
      </div>
    );
  }

  // Period is currently active (any day in menstrual phase) → show day count, hide log button.
  if (inMenstrualPhase) {
    return (
      <div className="mt-6 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-terracotta-100 border border-terracotta-200 text-terracotta-700 text-sm">
          <Droplet className="w-4 h-4" />
          {daysSinceStart !== null ? t('period.day', { n: daysSinceStart + 1 }) : t('period.active')}
        </div>
        {daysSinceStart !== null && daysSinceStart > 0 && (
          <div className="text-[11px] text-ink-500">
            {t('period.startedAgo', { n: daysSinceStart })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-2 w-full">
      <button
        type="button"
        onClick={handleLog}
        aria-label={t('period.log.aria')}
        className="w-full max-w-[260px] px-6 py-3.5 rounded-2xl font-medium text-sm text-cream-50
                   active:scale-[0.97] transition-transform flex items-center justify-center gap-3"
        style={{ background: 'linear-gradient(135deg, #C78264 0%, #B06849 100%)' }}
      >
        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-cream-50/70 shrink-0" />
        {t('period.log.button')}
      </button>
      {cyclesTracked > 0 && (
        <div className="text-[10px] uppercase tracking-wider text-ink-400/80">
          {t('period.tracked', { n: cyclesTracked, label: plural(cyclesTracked, 'common.cycle') })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Generic section info modal                                         */
/* ------------------------------------------------------------------ */

function SectionInfoModal({ title, body, onClose }) {
  // Focus the dialog itself so the title is in view immediately on
  // mobile, and let the body scroll internally if it overflows the
  // sheet height — content shouldn't fall off-screen behind the fold.
  const dialogRef = useRef(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm anim-fade-up"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="section-info-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-md bg-cream-50 rounded-t-2xl sm:rounded-2xl shadow-glow flex flex-col max-h-[92dvh] sm:max-h-[85dvh] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 shrink-0 border-b border-cream-100">
          <h2 id="section-info-title" className="font-display text-[22px] text-ink-700 leading-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="w-9 h-9 rounded-full bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-500 hover:text-ink-700 shrink-0 transition"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
          <p className="text-sm text-ink-600 leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  );
}

function SectionInfoButton({ title, body }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Info: ${title}`}
        className="relative inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full text-ink-400 hover:text-ink-600 active:scale-95 transition"
      >
        <span aria-hidden="true" className="absolute inset-2 rounded-full bg-cream-100 border border-cream-200" />
        <Info aria-hidden="true" className="w-3.5 h-3.5 relative z-10" />
      </button>
      {open && <SectionInfoModal title={title} body={body} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Gut health checklist                                               */
/* ------------------------------------------------------------------ */

function GutChecklist({ gut, onToggle }) {
  const { t } = useT();
  const items = [
    { id: 'probiotics', label: t('gut.probiotics.label'), hint: t('gut.probiotics.hint'), icon: Sparkles },
    { id: 'fiber',      label: t('gut.fiber.label'),      hint: t('gut.fiber.hint'),      icon: Wheat },
    { id: 'fermented',  label: t('gut.fermented.label'),  hint: t('gut.fermented.hint'),  icon: Salad },
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
            aria-pressed={on}
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
              <Icon aria-hidden="true" className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium ${on ? 'text-sage-700' : 'text-ink-600'}`}>{label}</div>
              <div className="text-xs text-ink-400 mt-0.5">{hint}</div>
            </div>
            <div
              aria-hidden="true"
              className={`ml-auto w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition ${
                on ? 'bg-sage-500 border-sage-500 text-cream-50' : 'bg-cream-50 border-cream-300'
              }`}
            >
              {on && <Check className="w-3.5 h-3.5" />}
            </div>
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
  const { t } = useT();
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Moon className="w-3.5 h-3.5 text-ink-400" />
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{t('tracker.sleep')}</div>
      </div>
      <div className="flex gap-2">
        {SLEEP_SLOTS.map((h) => {
          const active = hours === h;
          return (
            <button
              key={h}
              type="button"
              aria-label={t('tracker.sleep.aria', { n: h })}
              aria-pressed={active}
              onClick={() => onChange(active ? 0 : h)}
              className={`flex-1 min-h-[44px] py-3 rounded-xl border text-sm transition active:scale-95 ${
                active
                  ? 'bg-sage-100 border-sage-300 text-sage-700 font-semibold shadow-soft'
                  : 'bg-cream-50 border-cream-200 text-ink-500 hover:border-sage-200'
              }`}
            >
              {h}h
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-ink-400 mt-2">
        {t('tracker.sleep.hint')}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Movement tracker                                                   */
/* ------------------------------------------------------------------ */

const MOVEMENT_SLOTS = [15, 30, 45, 60, 90];

function MovementTracker({ minutes, onChange, phase }) {
  const { t } = useT();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-ink-400" />
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{t('tracker.move')}</div>
        </div>
        {minutes > 0 && (
          <div className="font-display text-ink-700 text-[20px] leading-none">
            {minutes}<span className="text-ink-400 text-sm"> {t('common.minutes')}</span>
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
              aria-label={t('tracker.move.aria', { n: m })}
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
            aria-label={t('tracker.move.clearAria')}
            onClick={() => onChange(0)}
            className="min-h-[44px] px-4 py-3 rounded-xl border border-cream-200 bg-cream-50 text-ink-400 text-sm transition hover:border-sage-200 active:scale-95"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
      {phase && (
        <div className="text-[11px] text-ink-400 mt-2">{t(`tracker.move.hint.${phase}`)}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Journal note                                                       */
/* ------------------------------------------------------------------ */

function JournalNote({ note, onChange, hideHeader = false }) {
  const { t } = useT();
  return (
    <div>
      {!hideHeader && (
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2.5">{t('journal.title')}</div>
      )}
      <textarea
        value={note}
        onChange={(e) => onChange(e.target.value.slice(0, 280))}
        placeholder={t('journal.placeholder')}
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
  const { t } = useT();
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
        aria-label={t('temp.input.aria')}
        className="w-[5.5rem] text-center bg-cream-50 border border-cream-200 rounded-xl px-2 py-2 text-ink-700 text-base
                   focus:outline-none focus:border-sage-300 focus:ring-2 focus:ring-sage-200/60 transition"
      />
      <span className="text-sm text-ink-400">°C</span>
      {value > 0 && (
        <button
          type="button"
          onClick={() => { setDraft(''); onChange(0); }}
          aria-label={t('temp.clear.aria')}
          className="ml-auto text-xs text-ink-400 hover:text-ink-600 underline decoration-dotted underline-offset-2 px-2 py-2 min-h-[44px]"
        >
          {t('temp.clear.aria')}
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
  const { t } = useT();
  const W = 320;
  const H = 88;
  const padX = 8;
  const padY = 10;
  const valid = series.filter((s) => s.temperature > 0);
  if (valid.length === 0) {
    return (
      <div className="text-[11px] text-ink-400 italic text-center py-6">
        {t('temp.empty')}
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
        aria-label={t('temp.trend.aria', { n: series.length })}
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
        <span>{t('temp.range', { valid: valid.length, total: series.length })}</span>
        <span>{hi.toFixed(1)}°C</span>
      </div>
    </div>
  );
}

function BasalTemperatureCard({ todayTemp, todayISO, onChange, ovulationDetection }) {
  const { t, formatDate } = useT();
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
    <CollapsibleCard
      id="temperature"
      title={t('temp.title')}
      icon={Thermometer}
      defaultCollapsed={true}
      headerExtra={todayTemp > 0 && (
        <span className="font-display text-ink-700 text-[15px] leading-none">
          {todayTemp.toFixed(1)}<span className="text-ink-400 text-xs ml-1">°C</span>
        </span>
      )}
      className="mb-5"
      style={{ animationDelay: '100ms' }}
    >
      <TemperatureInput value={todayTemp} onChange={onChange} />
      <p className="text-[11px] text-ink-400 mt-2 leading-relaxed">
        {t('temp.hint')}
      </p>
      <div className="mt-4">
        <TemperatureMiniChart series={series} />
      </div>
      {ovulationDetection?.ovulationISO && (
        <div className="mt-3 px-3 py-2.5 rounded-xl bg-sage-50 border border-sage-200 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-sage-600 shrink-0" />
          <div className="text-[12px] text-sage-700 leading-snug">
            {t('temp.detected')} <strong>{formatShortDate(ovulationDetection.ovulationISO, formatDate)}</strong>
            <span className="text-sage-600/80"> {t('temp.detected.suffix')}</span>
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}

function formatShortDate(iso, formatDate) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return formatDate(d, { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ */
/*  Ovulation tracker — felt vs read-from-temp                         */
/* ------------------------------------------------------------------ */

function OvulationTracker({ ovulation, onUpdate, autoDetectedISO }) {
  const { t, formatDate } = useT();
  const opts = [
    {
      id:     'felt',
      label:  t('ovulation.felt.label'),
      hint:   t('ovulation.felt.hint'),
      active: !!ovulation.felt,
    },
    {
      id:     'fromTemp',
      label:  t('ovulation.fromTemp.label'),
      hint:   t('ovulation.fromTemp.hint'),
      active: !!ovulation.fromTemp,
    },
  ];
  const anyMarked = opts.some((o) => o.active);

  return (
    <CollapsibleCard
      id="ovulation"
      title={t('ovulation.title')}
      icon={Heart}
      defaultCollapsed={true}
      headerExtra={anyMarked && (
        <span className="text-[11px] text-sage-700 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full">
          {t('ovulation.marked')}
        </span>
      )}
      className="mb-5"
      style={{ animationDelay: '120ms' }}
    >
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
          🌿 {t('ovulation.autoNote', { date: formatShortDate(autoDetectedISO, formatDate) })}
        </p>
      )}
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Bleeding details — sub-options under menstruation                  */
/* ------------------------------------------------------------------ */

function BleedingDetailsCard({ bleeding, onUpdate }) {
  const { t, bleedingGroups } = useT();
  const groups = bleedingGroups();

  const setField = (key, value) => {
    const current = bleeding[key];
    onUpdate({ bleeding: { [key]: current === value ? '' : value } });
  };

  return (
    <CollapsibleCard
      id="bleeding"
      title={t('bleeding.title')}
      icon={Droplet}
      defaultCollapsed={false}
      className="mb-5"
      style={{ animationDelay: '60ms' }}
    >
      <p className="text-[12px] text-ink-500 mb-5 leading-relaxed">
        {t('bleeding.intro')}
      </p>
      <div className="space-y-5">
        {groups.map((group) => {
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
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Sport intensity tracker + per-phase suggestions                    */
/* ------------------------------------------------------------------ */

function SportTrackerCard({ phase, intensity, onChange }) {
  const { t, phaseMeta, phaseSports, sportIntensities } = useT();
  const advice = phaseSports(phase);
  const intensityOpts = sportIntensities();

  return (
    <CollapsibleCard
      id="sport"
      title={t('sport.title')}
      icon={Dumbbell}
      defaultCollapsed={false}
      headerExtra={intensity && (
        <span className="text-[11px] text-sage-700 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full">
          {t('sport.logged')}
        </span>
      )}
      className="mb-5"
      style={{ animationDelay: '160ms' }}
    >
      {advice && (
        <div className="mb-5 px-4 py-3.5 rounded-xl bg-sage-50/70 border border-sage-200/70">
          <div className="text-[11px] uppercase tracking-[0.14em] text-sage-700 mb-1">
            {t('sport.adviceFor', { phase: phaseMeta(phase).label.toLowerCase() })}
          </div>
          <div className="font-display text-base text-ink-700 mb-1">{advice.headline}</div>
          <p className="text-[12px] text-ink-500 leading-relaxed mb-3">{advice.why}</p>
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-1.5">
            {t('sport.ideas')}
          </div>
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
        {t('sport.feltHow')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {intensityOpts.map((opt) => {
          const active = intensity === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? '' : opt.id)}
              className={`relative text-left px-3.5 py-3 rounded-xl border transition active:scale-[0.99] min-h-[44px] ${
                active
                  ? 'bg-sage-100 border-sage-400 text-sage-700 shadow-soft'
                  : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                    active ? 'bg-sage-500 border-sage-500 text-cream-50' : 'border-cream-300 bg-cream-50'
                  }`}
                >
                  {active && <Check className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-[10px] text-ink-400 mt-0.5 leading-snug">{opt.hint}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Self-care cards — extended for the menstrual phase                 */
/* ------------------------------------------------------------------ */

function MenstrualSelfCareCards() {
  const { t, selfcare } = useT();
  const [openId, setOpenId] = useState(null);
  const cards = selfcare();

  return (
    <CollapsibleCard
      id="selfcare"
      title={t('selfcare.title')}
      icon={Heart}
      defaultCollapsed={false}
      className="mb-5"
      style={{ animationDelay: '180ms' }}
    >
      <p className="text-[12px] text-ink-500 mb-4 leading-relaxed">
        {t('selfcare.intro')}
      </p>
      <div className="space-y-2">
        {cards.map((card) => {
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
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Phase hormone-info modal + (i) trigger                             */
/* ------------------------------------------------------------------ */

function PhaseInfoButton({ phase, onOpen }) {
  const { t, phaseMeta } = useT();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('phaseInfo.aria.button', { phase: phaseMeta(phase).label })}
      className="relative inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full text-sage-600
                 hover:text-sage-700 active:scale-95 transition"
    >
      <span aria-hidden="true" className="absolute inset-2 rounded-full bg-sage-50 border border-sage-200" />
      <Info aria-hidden="true" className="w-4 h-4 relative z-10" />
    </button>
  );
}

function PhaseInfoModal({ phase, onClose }) {
  const { t, phaseMeta, phaseHormones } = useT();
  // Focus the dialog itself (not the close button) so the title is in
  // view on mobile sheets — focusing a button at the bottom can pull
  // the viewport down and hide the heading. Body scrolls internally.
  const dialogRef = useRef(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!phase) return null;
  const meta = PHASE_META[phase];
  const phaseM = phaseMeta(phase);
  const info = phaseHormones(phase);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink-700/40 backdrop-blur-sm anim-fade-up"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="phase-info-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-md bg-cream-50 rounded-t-2xl sm:rounded-2xl shadow-glow flex flex-col max-h-[92dvh] sm:max-h-[85dvh] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 flex items-start gap-3 shrink-0 border-b border-cream-100">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: meta.bg }}
          >
            <Sparkles className="w-5 h-5" style={{ color: meta.hue }} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">
              {phaseM.label} · {phaseM.subtitle}
            </div>
            <h2 id="phase-info-title" className="font-display text-[22px] text-ink-700 leading-snug">
              {info.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('phaseInfo.aria.close')}
            className="w-9 h-9 rounded-full bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-400 hover:text-ink-700 transition shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
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

        <div className="px-6 pb-6 pt-4 shrink-0 border-t border-cream-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-sage-600 text-cream-50 py-3 text-sm font-medium hover:bg-sage-700 active:scale-[0.98] transition"
          >
            {t('common.understood')}
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
  const { t } = useT();
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
    catch { /* private mode — banner just won't persist its dismissal */ }
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
          <div className="text-sm font-medium text-ink-700">{t('pwa.title')}</div>
          <div className="text-xs text-ink-400 mt-0.5">{t('pwa.subtitle')}</div>
        </div>
        <button
          type="button"
          onClick={handleInstall}
          className="px-4 py-2 rounded-xl bg-sage-600 text-cream-50 text-xs font-medium hover:bg-sage-700 transition shrink-0 min-h-[44px]"
        >
          {t('pwa.install')}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 text-ink-400 hover:text-ink-600 transition shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={t('pwa.dismiss')}
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
  const { t } = useT();
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
          <div className="text-sm font-medium text-ink-700">{t('reminder.title')}</div>
          <div className="text-xs text-ink-400 mt-0.5">{t('reminder.subtitle')}</div>
        </div>
        <button type="button" onClick={() => setVisible(false)}
          aria-label={t('reminder.dismiss')}
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
  const { t, activityMeta } = useT();
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
    <main id="main" className="min-h-dvh flex items-center justify-center px-5 py-10">
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
              {t('onb.intro.title')}
            </h1>
            <p className="text-sm text-ink-500 text-center leading-relaxed mb-8">
              {t('onb.intro.subtitle')}
            </p>
            <div className="mb-6">
              <label className="block text-sm text-ink-600 mb-2.5" htmlFor="onboard-name">
                {t('onb.intro.nameLabel')}
              </label>
              <input
                id="onboard-name"
                className={inputCx}
                value={form.name}
                onChange={setFE('name')}
                placeholder={t('onb.intro.namePh')}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && goTo(1)}
              />
            </div>
            <button
              type="button"
              onClick={() => goTo(1)}
              className="w-full rounded-xl bg-sage-600 text-cream-50 py-3.5 font-medium
                         hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              {form.name.trim()
                ? t('onb.intro.cta.named', { name: form.name.trim().split(' ')[0] })
                : t('onb.intro.cta.empty')}
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-[11px] text-ink-400 text-center leading-relaxed mt-5">
              {t('onb.intro.privacy')}
              <br />
              {t('onb.intro.privacyMore')}
            </p>
          </Card>
        )}

        {/* Step 1 — Cyclus instellen */}
        {step === 1 && (
          <Card key={animKey} className={cardCx}>
            <h2 className="font-display text-[28px] text-ink-700 leading-tight mb-2">
              {form.name.trim()
                ? t('onb.cycle.title.named', { name: form.name.trim().split(' ')[0] })
                : t('onb.cycle.title.empty')}
            </h2>
            <p className="text-sm text-ink-500 mb-7 leading-relaxed">
              {t('onb.cycle.subtitle')}
            </p>

            <div className="space-y-6">
              <Field>
                <Label htmlFor="onboard-last-period">{t('onb.cycle.lastPeriod')}</Label>
                <input
                  id="onboard-last-period"
                  className={inputCx}
                  type="date"
                  value={form.lastPeriodStart}
                  onChange={setFE('lastPeriodStart')}
                />
              </Field>

              <Field>
                <Label>{t('onb.cycle.length')}</Label>
                <div className="flex items-center gap-4 mt-1">
                  <button
                    type="button"
                    aria-label={t('onb.cycle.length.dec')}
                    onClick={() => setF('cycleLength', Math.max(21, form.cycleLength - 1))}
                    className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                               text-ink-600 hover:bg-sage-100 hover:border-sage-200
                               transition text-xl flex items-center justify-center"
                  >−</button>
                  <div className="flex-1 text-center" aria-live="polite">
                    <span className="font-display text-[36px] text-ink-700 leading-none">
                      {form.cycleLength}
                    </span>
                    <span className="text-sm text-ink-400 ml-1.5">{t('common.daysShort')}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={t('onb.cycle.length.inc')}
                    onClick={() => setF('cycleLength', Math.min(45, form.cycleLength + 1))}
                    className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                               text-ink-600 hover:bg-sage-100 hover:border-sage-200
                               transition text-xl flex items-center justify-center"
                  >+</button>
                </div>
                <div className="text-[11px] text-ink-400 text-center mt-2">
                  {t('onb.cycle.lengthHint')}
                </div>
              </Field>

              <Field>
                <Label>{t('onb.cycle.duration')}</Label>
                <div className="flex items-center gap-4 mt-1">
                  <button
                    type="button"
                    aria-label={t('onb.cycle.dur.dec')}
                    onClick={() => setF('mensDuration', Math.max(2, form.mensDuration - 1))}
                    className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                               text-ink-600 hover:bg-sage-100 hover:border-sage-200
                               transition text-xl flex items-center justify-center"
                  >−</button>
                  <div className="flex-1 text-center" aria-live="polite">
                    <span className="font-display text-[36px] text-ink-700 leading-none">
                      {form.mensDuration}
                    </span>
                    <span className="text-sm text-ink-400 ml-1.5">{t('common.daysShort')}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={t('onb.cycle.dur.inc')}
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
                <ChevronLeft className="w-4 h-4" /> {t('common.back')}
              </button>
              <button
                type="button"
                onClick={() => goTo(2)}
                className="flex-1 rounded-xl bg-sage-600 text-cream-50 py-3 font-medium
                           hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm"
              >
                {t('onb.cycle.next')} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        {/* Step 2 — Lichaam & activiteit */}
        {step === 2 && (
          <Card key={animKey} className={cardCx}>
            <h2 className="font-display text-[28px] text-ink-700 leading-tight mb-2">
              {t('onb.body.title')}
            </h2>
            <p className="text-sm text-ink-500 mb-7 leading-relaxed">
              {t('onb.body.subtitle')}
            </p>

            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <Field>
                  <Label htmlFor="onboard-age">{t('onb.body.age')}</Label>
                  <input
                    id="onboard-age"
                    className={inputCx}
                    type="number" min="16" max="80"
                    value={form.age}
                    onChange={setFE('age')}
                    placeholder="28"
                  />
                </Field>
                <Field>
                  <Label htmlFor="onboard-weight">{t('onb.body.weight')}</Label>
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
                  <Label htmlFor="onboard-height">{t('onb.body.height')}</Label>
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
                <Label>{t('onb.body.activity')}</Label>
                <div className="grid grid-cols-1 gap-2 mt-1">
                  {ACTIVITY_LEVELS.map((lvl) => {
                    const active = form.activityLevel === lvl.id;
                    const meta = activityMeta(lvl.id);
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
                        <div className="text-sm font-medium">{meta.label}</div>
                        <div className="text-xs text-ink-400 mt-0.5">{meta.hint}</div>
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
                <ChevronLeft className="w-4 h-4" /> {t('common.back')}
              </button>
              <button
                type="button"
                onClick={() => goTo(3)}
                className="flex-1 rounded-xl bg-sage-600 text-cream-50 py-3 font-medium
                           hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm"
              >
                {t('onb.cycle.next')} <ArrowRight className="w-4 h-4" />
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
              {form.name.trim()
                ? t('onb.welcome.title.named', { name: form.name.trim().split(' ')[0] })
                : t('onb.welcome.title.empty')}
            </h2>
            <p className="text-sm text-ink-500 text-center leading-relaxed mb-6">
              {t('onb.welcome.intro')}
            </p>
            <div className="space-y-2 mb-7">
              {[
                { emoji: '🌸', labelKey: 'onb.welcome.nav.home',       descKey: 'onb.welcome.nav.home' },
                { emoji: '🥗', labelKey: 'onb.welcome.nav.voeding',    descKey: 'onb.welcome.nav.voeding' },
                { emoji: '📓', labelKey: 'onb.welcome.nav.logboek',    descKey: 'onb.welcome.nav.logboek' },
                { emoji: '📊', labelKey: 'onb.welcome.nav.stats',      descKey: 'onb.welcome.nav.stats' },
                { emoji: '⚙️', labelKey: 'onb.welcome.nav.settings',   descKey: 'onb.welcome.nav.settings' },
              ].map(({ emoji, labelKey }) => (
                <div key={labelKey} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-cream-100/70">
                  <span className="text-xl">{emoji}</span>
                  <div>
                    <div className="text-sm font-medium text-ink-700">{t(labelKey)}</div>
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
                <ChevronLeft className="w-4 h-4" /> {t('common.back')}
              </button>
              <button
                type="button"
                onClick={complete}
                className="flex-1 rounded-xl bg-sage-600 text-cream-50 py-3 font-medium
                           hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm"
              >
                {t('onb.welcome.start')} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings screen                                                    */
/* ------------------------------------------------------------------ */

function SettingsScreen({ profile, onSave, onReset, onBack, theme = 'auto', onThemeChange, onOpenLegal }) {
  const { t, locale, setLocale, activityMeta } = useT();
  const [form, setForm] = useState({
    name:            profile.name            || '',
    age:             profile.age             || '',
    weightKg:        profile.weightKg        || '',
    heightCm:        profile.heightCm        || '',
    activityLevel:   profile.activityLevel   || 'moderate',
    cycleLength:     profile.cycleLength     || 28,
    contraception:   profile.contraception   || '',
    pregnancyIntent: profile.pregnancyIntent || '',
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
  const [hiddenCards, setHiddenCards]   = useState(() => profile.hiddenCards || []);
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
      showToast(t('settings.notif.unsupported'));
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setNotifEnabled(true);
      showToast(t('settings.notif.granted'));
    } else {
      showToast(t('settings.notif.denied'));
    }
  };

  const handleSave = () => {
    const age      = Number(form.age)      || profile.age;
    const weightKg = Number(form.weightKg) || profile.weightKg;
    const heightCm = Number(form.heightCm) || profile.heightCm;

    // Minimumleeftijd: 16 jaar — onder UAVG art. 5 (NL implementatie van
    // AVG art. 8) is voor verwerking van persoonsgegevens van kinderen
    // < 16 jaar in een informatiemaatschappij-dienst ouderlijke
    // toestemming vereist. Health data is bijzondere categorie (art. 9);
    // daar geldt het minimum extra streng. Was 12 — corrigeert audit F-04.
    if (age      && (age      < 16  || age      > 80 )) { showToast(t('settings.validate.age'));    return; }
    if (weightKg && (weightKg < 30  || weightKg > 250)) { showToast(t('settings.validate.weight')); return; }
    if (heightCm && (heightCm < 120 || heightCm > 220)) { showToast(t('settings.validate.height')); return; }

    const cleanGoals = {};
    Object.entries(goals).forEach(([k, v]) => { if (Number(v) > 0) cleanGoals[k] = Number(v); });
    // Trim + cap the name so a runaway paste can't bloat the profile blob.
    // React already escapes everything we render, so no HTML stripping needed.
    const cleanName = String(form.name || '').trim().slice(0, 60);
    onSave({
      ...profile,
      name:            cleanName,
      age,
      weightKg,
      heightCm,
      activityLevel:   form.activityLevel,
      cycleLength:     Number(form.cycleLength),
      goals:           cleanGoals,
      notifEnabled,
      notifTime,
      hiddenCards,
      // Lege string = "niet ingesteld" → opslag als undefined zodat
      // bestaande null-checks elders blijven werken zonder migratie.
      contraception:   form.contraception   || undefined,
      pregnancyIntent: form.pregnancyIntent || undefined,
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
          aria-label={t('common.back')}
          className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                     flex items-center justify-center text-ink-500 hover:text-ink-700 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-[28px] text-ink-700 leading-tight">{t('settings.title')}</h1>
      </header>

      {/* Profile fields */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-5">{t('settings.profile')}</div>
        <div className="space-y-5">
          <Field>
            <Label htmlFor="settings-name">{t('settings.name')}</Label>
            <input
              id="settings-name"
              className={inputCx}
              value={form.name}
              onChange={(e) => setF('name', e.target.value)}
              placeholder={t('settings.namePh')}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field>
              <Label htmlFor="settings-age">{t('settings.age')}</Label>
              <input
                id="settings-age"
                className={inputCx}
                type="number" min="16" max="80"
                value={form.age}
                onChange={(e) => setF('age', e.target.value)}
                placeholder="28"
              />
            </Field>
            <Field>
              <Label htmlFor="settings-weight">{t('settings.weight')}</Label>
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
              <Label htmlFor="settings-height">{t('settings.height')}</Label>
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
            <Label>{t('settings.cycleLength')}</Label>
            <div className="flex items-center gap-4 mt-1">
              <button
                type="button"
                aria-label={t('onb.cycle.length.dec')}
                onClick={() => setF('cycleLength', Math.max(21, form.cycleLength - 1))}
                className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                           text-ink-600 hover:bg-sage-100 hover:border-sage-200
                           transition text-xl flex items-center justify-center"
              >−</button>
              <div className="flex-1 text-center" aria-live="polite">
                <span className="font-display text-[36px] text-ink-700 leading-none">
                  {form.cycleLength}
                </span>
                <span className="text-sm text-ink-400 ml-1.5">{t('common.daysShort')}</span>
              </div>
              <button
                type="button"
                aria-label={t('onb.cycle.length.inc')}
                onClick={() => setF('cycleLength', Math.min(45, form.cycleLength + 1))}
                className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                           text-ink-600 hover:bg-sage-100 hover:border-sage-200
                           transition text-xl flex items-center justify-center"
              >+</button>
            </div>
          </Field>

          <Field>
            <Label>{t('settings.activity')}</Label>
            <div className="grid grid-cols-1 gap-2 mt-1">
              {ACTIVITY_LEVELS.map((lvl) => {
                const active = form.activityLevel === lvl.id;
                const meta = activityMeta(lvl.id);
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
                    <div className="text-sm font-medium">{meta.label}</div>
                    <div className="text-xs text-ink-400 mt-0.5">{meta.hint}</div>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Card>

      {/* Cyclus-context — anticonceptie + zwangerschap-intentie */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-2">Cyclus-context</div>
        <p className="text-[12px] text-ink-500 mb-5 leading-relaxed">
          Optioneel — helpt Aura om relevantere voorspellingen en herinneringen te tonen. Niets wordt gedeeld; alle data blijft op je apparaat.
        </p>

        <Field>
          <Label>Anticonceptie</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={() => setF('contraception', '')}
              aria-pressed={!form.contraception}
              className={`text-left px-3.5 py-2.5 rounded-xl border text-sm transition active:scale-[0.99] min-h-[44px] ${
                !form.contraception
                  ? 'bg-cream-100 border-cream-300 text-ink-700'
                  : 'bg-cream-50 border-cream-200 text-ink-500 hover:border-sage-200'
              }`}
            >
              Liever niet zeggen
            </button>
            {CONTRACEPTION_OPTIONS.map((opt) => {
              const active = form.contraception === opt.id;
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setF('contraception', opt.id)}
                  aria-pressed={active}
                  className={`text-left px-3.5 py-2.5 rounded-xl border text-sm transition active:scale-[0.99] min-h-[44px] ${
                    active
                      ? 'bg-sage-100 border-sage-300 text-sage-700 font-medium'
                      : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field>
          <Label>Zwangerschap</Label>
          <div className="grid grid-cols-1 gap-2 mt-1">
            {PREGNANCY_INTENTS.map((opt) => {
              const active = form.pregnancyIntent === opt.id;
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setF('pregnancyIntent', active ? '' : opt.id)}
                  aria-pressed={active}
                  className={`text-left px-4 py-3 rounded-xl border transition active:scale-[0.99] ${
                    active
                      ? 'bg-sage-100 border-sage-300 text-sage-700'
                      : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-ink-400 mt-0.5">{opt.hint}</div>
                </button>
              );
            })}
          </div>
        </Field>

        {form.contraception && suppressesCycle(form.contraception) && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-cream-100/70 border border-cream-200 text-[12px] text-ink-500 leading-relaxed">
            <strong className="text-ink-600">Let op:</strong> hormonale anticonceptie onderdrukt de natuurlijke ovulatie. Het vruchtbare venster en de fase-uitleg zijn dan indicatief — geen biologische voorspelling.
          </div>
        )}
      </Card>

      {/* Dagelijkse doelen */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">{t('settings.goals')}</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'calories',  labelKey: 'settings.goal.calories', unit: 'kcal', placeholder: '1800' },
            { key: 'protein',   labelKey: 'settings.goal.protein',  unit: 'g',    placeholder: '100' },
            { key: 'hydration', labelKey: 'settings.goal.water',    unit: 'ml',   placeholder: '2000' },
            { key: 'movement',  labelKey: 'settings.goal.move',     unit: 'min',  placeholder: '30' },
            { key: 'sleep',     labelKey: 'settings.goal.sleep',    unit: 'uur',  placeholder: '8' },
          ].map(({ key, labelKey, unit, placeholder }) => (
            <Field key={key}>
              <Label>{t(labelKey)}</Label>
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
        <p className="text-[11px] text-ink-400 mt-3">{t('settings.goal.note')}</p>
      </Card>

      {/* Herinneringen */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">{t('settings.reminders')}</div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-medium text-ink-700">{t('settings.reminder.title')}</div>
            <div className="text-xs text-ink-400 mt-0.5">{t('settings.reminder.sub')}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notifEnabled}
            aria-label={t('settings.reminder.aria')}
            onClick={handleNotifToggle}
            className={`relative w-12 h-6 rounded-full transition ${notifEnabled ? 'bg-sage-500' : 'bg-cream-300'}`}
          >
            <div aria-hidden="true" className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${notifEnabled ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
        <p className="text-[11px] text-ink-400 leading-relaxed mb-2">
          {t('settings.notif.explainer')}
        </p>
        {notifEnabled && (
          <Field>
            <Label>{t('settings.reminder.time')}</Label>
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
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">{t('settings.display')}</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'auto',  labelKey: 'settings.theme.auto',  Icon: null },
            { id: 'light', labelKey: 'settings.theme.light', Icon: Sun  },
            { id: 'dark',  labelKey: 'settings.theme.dark',  Icon: Moon },
          ].map(({ id, labelKey, Icon }) => {
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
                <span className="text-[11px] font-medium leading-none">{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Taal / Language */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">{t('settings.language')}</div>
        <div className="grid grid-cols-2 gap-2">
          {['nl', 'en'].map((lang) => {
            const active = locale === lang;
            return (
              <button key={lang} type="button" onClick={() => setLocale(lang)}
                aria-pressed={active}
                className={`min-h-[44px] py-3 rounded-xl border text-sm transition active:scale-95 ${
                  active ? 'bg-sage-100 border-sage-300 text-sage-700' : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
                }`}>
                {t(`settings.language.${lang}`)}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Dashboard card visibility */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">{t('settings.cards.title')}</div>
        <div className="space-y-1">
          {[
            { id: 'goalRings',       label: 'Voortgangs-ringen' },
            { id: 'symptoms',        label: t('symptoms.title') },
            { id: 'todayNutrition',  label: t('nutrition.today') },
            { id: 'wellbeing',       label: t('wellbeing.title') },
            { id: 'gut',             label: t('gut.title') },
            { id: 'focus',           label: t('focus.title') },
            { id: 'workload',        label: t('workload.title') },
            { id: 'insight',         label: t('insight.title') },
            { id: 'journal',         label: t('journal.title') },
            { id: 'cycleHistory',    label: t('cycle.recent.title') },
            { id: 'cycleCalendar',   label: 'Cyclus-kalender' },
            { id: 'temperature',     label: t('temp.title') },
            { id: 'ovulation',       label: t('ovulation.title') },
            { id: 'fertilityWindow', label: 'Vruchtbaar venster' },
            { id: 'lateCycleCheck',  label: 'Cyclus-verlaat check-in' },
          ].map(({ id, label }) => {
            const hidden = hiddenCards.includes(id);
            return (
              <button
                key={id}
                type="button"
                role="switch"
                aria-checked={!hidden}
                onClick={() => setHiddenCards((prev) =>
                  hidden ? prev.filter((c) => c !== id) : [...prev, id]
                )}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-cream-100 transition active:scale-[0.99]"
              >
                <span className={`text-sm ${hidden ? 'text-ink-400' : 'text-ink-700'}`}>{label}</span>
                <div className={`w-10 h-6 rounded-full border transition-colors ${hidden ? 'bg-cream-200 border-cream-300' : 'bg-sage-400 border-sage-500'}`}>
                  <div className={`m-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${hidden ? 'translate-x-0' : 'translate-x-4'}`} />
                </div>
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
                        : 'bg-sage-600 text-cream-50 hover:bg-sage-700'
                    }`}
      >
        {saved ? <><Check className="w-4 h-4" /> {t('settings.save')} ✓</> : t('settings.save')}
      </button>

      {/* Export */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('settings.export')}</div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => exportCSV(profile)}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-cream-200 bg-cream-50
                       text-ink-600 text-sm hover:border-sage-200 hover:bg-sage-50 transition"
          >
            <Download className="w-4 h-4" />
            {t('settings.export.csv')}
          </button>
          <button
            type="button"
            onClick={() => exportAppleHealth(profile, () => showToast(t('settings.export.empty')))}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-cream-200 bg-cream-50
                       text-ink-600 text-sm hover:border-sage-200 hover:bg-sage-50 transition"
          >
            <Download className="w-4 h-4" />
            {t('settings.export.health')}
          </button>
          <button
            type="button"
            onClick={() => exportFullJson(profile)}
            aria-label={t('settings.export.json.aria')}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-cream-200 bg-cream-50
                       text-ink-600 text-sm hover:border-sage-200 hover:bg-sage-50 transition"
          >
            <Download className="w-4 h-4" />
            {t('settings.export.json')}
          </button>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="p-6 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('settings.danger')}</div>
        <p className="text-sm text-ink-500 mb-4 leading-relaxed">
          {t('settings.danger.note')}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-xl border border-terracotta-200 bg-terracotta-100/50
                     text-terracotta-600 py-3 text-sm font-medium
                     hover:bg-terracotta-100 active:scale-[0.98] transition"
        >
          {t('settings.danger.button')}
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
        {t('settings.legal')}
      </button>

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">{t('settings.version')}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Legal: privacy + medical disclaimer + imprint                      */
/* ------------------------------------------------------------------ */

function LegalView({ onBack }) {
  const { t } = useT();
  return (
    <div className="min-h-dvh px-5 py-8 pb-28 max-w-md mx-auto">
      <header className="flex items-center gap-3 mb-8 anim-fade-up">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('common.back')}
          className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200
                     flex items-center justify-center text-ink-500 hover:text-ink-700 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-[28px] text-ink-700 leading-tight">{t('legal.title')}</h1>
      </header>

      {/* Verwerkingsverantwoordelijke */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.controller.title')}</div>
        <p className="text-sm text-ink-600 leading-relaxed mb-3">{t('legal.controller.body')}</p>
        <p className="text-sm text-ink-600 leading-relaxed">{t('legal.controller.complaint')}</p>
      </Card>

      {/* Rechtsgrondslag */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.basis.title')}</div>
        <p className="text-sm text-ink-600 leading-relaxed">{t('legal.basis.body')}</p>
      </Card>

      {/* Medische disclaimer */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.med.title')}</div>
        <p className="text-sm text-ink-600 leading-relaxed mb-3">{t('legal.med.p1')}</p>
        <p className="text-sm text-ink-600 leading-relaxed mb-3">{t('legal.med.p2')}</p>
        <p className="text-sm text-ink-600 leading-relaxed">{t('legal.med.p3')}</p>
      </Card>

      {/* Wat slaan we op + waarom */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.store.title')}</div>
        <p className="text-sm text-ink-600 leading-relaxed mb-3">{t('legal.store.intro')}</p>
        <ul className="text-sm text-ink-600 leading-relaxed list-disc pl-5 space-y-1 mb-3">
          <li>{t('legal.store.li1')}</li>
          <li>{t('legal.store.li2')}</li>
          <li>{t('legal.store.li3')}</li>
          <li>{t('legal.store.li4')}</li>
        </ul>
        <p className="text-sm text-ink-600 leading-relaxed">{t('legal.store.foot')}</p>
      </Card>

      {/* Bewaartermijn */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.retention.title')}</div>
        <p className="text-sm text-ink-600 leading-relaxed">{t('legal.retention.body')}</p>
      </Card>

      {/* Wat doen we niet */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.dont.title')}</div>
        <ul className="text-sm text-ink-600 leading-relaxed space-y-2">
          <li>{t('legal.dont.li1')}</li>
          <li>{t('legal.dont.li2')}</li>
          <li>{t('legal.dont.li3')}</li>
          <li>{t('legal.dont.li4')}</li>
          <li>{t('legal.dont.li5')}</li>
          <li>{t('legal.dont.li6')}</li>
        </ul>
      </Card>

      {/* Hosting & infrastructuur */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.hosting.title')}</div>
        <p className="text-sm text-ink-600 leading-relaxed">{t('legal.hosting.body')}</p>
      </Card>

      {/* Externe diensten */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.ext.title')}</div>
        <p className="text-sm text-ink-600 leading-relaxed">{t('legal.ext.body')}</p>
      </Card>

      {/* Cookies & opslag */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.cookies.title')}</div>
        <p className="text-sm text-ink-600 leading-relaxed">{t('legal.cookies.body')}</p>
      </Card>

      {/* Wat gebeurt er bij export */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.export.title')}</div>
        <p className="text-sm text-ink-600 leading-relaxed">{t('legal.export.body')}</p>
      </Card>

      {/* Jouw rechten */}
      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('legal.rights.title')}</div>
        <p className="text-sm text-ink-600 leading-relaxed mb-3">{t('legal.rights.intro')}</p>
        <ul className="text-sm text-ink-600 leading-relaxed list-disc pl-5 space-y-1">
          <li>{t('legal.rights.li1')}</li>
          <li>{t('legal.rights.li2')}</li>
          <li>{t('legal.rights.li3')}</li>
          <li>{t('legal.rights.li4')}</li>
        </ul>
      </Card>

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">
        {t('legal.foot')}
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
  const { t } = useT();
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
          aria-label={t('cycleRing.ovulation.aria')}
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
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">{t('days.cycleDay')}</div>
        <div className="font-display text-[54px] leading-none text-ink-700">
          {state.cycleDay ?? '—'}
        </div>
        <div className="text-xs text-ink-400 mt-1">{t('cycleRing.outOf', { n: state.cycleLength })}</div>
      </div>
    </div>
  );
}

function PhaseTimeline({ state }) {
  const { phaseMeta } = useT();
  return (
    <div className="flex gap-1.5">
      {state.phaseMap.map((slot) => {
        const active = slot.phase === state.phase;
        const meta = PHASE_META[slot.phase];
        const phaseM = phaseMeta(slot.phase);
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
              {phaseM.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ profile, onUpdateProfile, onOpenSettings, onOpenVoeding }) {
  const { t, formatDate, phaseMeta: getPhaseMeta, nutrientFocus, tips: getTips } = useT();
  const state   = useMemo(() => getCycleState(profile), [profile]);
  const targets = useMemo(() => getDailyTargets(profile, state.phase), [profile, state.phase]);
  const hidden  = useMemo(() => new Set(profile.hiddenCards || []), [profile.hiddenCards]);
  const insightText = useMemo(() => {
    const pool = getTips(state.phase);
    const iso = toISODate(new Date());
    let h = 0;
    for (let i = 0; i < iso.length; i++) h = (h * 31 + iso.charCodeAt(i)) | 0;
    const idx = Math.abs(h) % pool.length;
    return pool[idx](profile.name ? profile.name.split(' ')[0] : '');
  }, [state.phase, profile.name, getTips]);
  const PhaseIcon = PHASE_ICONS[state.phase];

  const [log, commitLog, restoreLog] = useDailyLog();

  // Hormone-info modal state. The (i)-icoontje opent altijd een uitleg
  // voor de huidige fase; we houden de phase-key in state zodat een
  // toekomstige aanroep "open uitleg voor andere fase" makkelijk past.
  const [phaseInfo, setPhaseInfo] = useState(null);

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
            <div className="text-sm text-ink-500 mt-0.5">{t('dash.greeting', { name: displayName })}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <div
              className="text-[11px] text-sage-700 bg-sage-50 border border-sage-200 px-2.5 py-1.5 rounded-full whitespace-nowrap anim-streak-pulse"
              aria-label={t('dash.streak.aria', { n: streak })}
            >
              🌿 {streak} {t('common.daysShort')}
            </div>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t('dash.openSettings')}
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

      {/* Cycle ring — the hero card */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '40ms' }}>
        <div className="flex flex-col items-center">
          <CycleRing state={state} ovulationDay={ovulationCycleDay} />
          <div className="flex items-center gap-2 mt-5 flex-wrap justify-center">
            <PhaseIcon className="w-4 h-4 shrink-0" style={{ color: state.phaseMeta.hue }} />
            <div className="font-display text-xl text-ink-700">{getPhaseMeta(state.phase).label}</div>
            <span className="text-ink-400">·</span>
            <div className="text-sm text-ink-500">{getPhaseMeta(state.phase).subtitle}</div>
            <PhaseInfoButton phase={state.phase} onOpen={() => setPhaseInfo(state.phase)} />
          </div>
          <p className="text-center text-sm text-ink-500 mt-3 leading-relaxed px-4">
            {getPhaseMeta(state.phase).blurb}
          </p>
          {state.hasData && (
            <div className="flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-cream-100 border border-cream-200">
              <span className="text-[11px] text-ink-400">{t('cycle.next.label')}</span>
              <span className="text-[11px] font-medium text-ink-600">
                {formatNextPeriod(state.daysUntilNext, t, formatDate)}
              </span>
            </div>
          )}
          <PeriodLogButton profile={profile} onUpdateProfile={onUpdateProfile} state={state} />
        </div>
        <div className="mt-6">
          <PhaseTimeline state={state} />
        </div>
      </Card>

      {/* Late-cycle prompt — verschijnt automatisch als de cyclus over tijd is */}
      {!hidden.has('lateCycleCheck') && (
        <LateCycleCheckCard profile={profile} state={state} log={log} onUpdate={updateLog} />
      )}

      {/* Fertility-window awareness — alleen wanneer pregnancyIntent is gezet */}
      {!hidden.has('fertilityWindow') && (
        <FertilityWindowCard profile={profile} state={state} />
      )}

      {/* Bleeding details — only rendered while a period is currently logged */}
      {periodLoggedToday && (
        <BleedingDetailsCard
          bleeding={log.bleeding}
          onUpdate={updateLog}
        />
      )}

      {/* Goal progress rings */}
      {!hidden.has('goalRings') && <GoalRings log={log} goals={profile.goals} targets={targets} />}

      {/* Symptom tracker */}
      {!hidden.has('symptoms') && <SymptomTracker log={log} onUpdate={updateLog} />}

      {/* Basal temperature with 14-day mini chart + ovulation hint */}
      {!hidden.has('temperature') && (
        <BasalTemperatureCard
          todayTemp={log.temperature}
          todayISO={todayISO}
          onChange={setTemperature}
          ovulationDetection={ovulationDetection}
        />
      )}

      {/* Ovulation tracker (felt / read-from-temp) */}
      {!hidden.has('ovulation') && (
        <OvulationTracker
          ovulation={log.ovulation}
          onUpdate={updateLog}
          autoDetectedISO={ovulationDetection?.ovulationISO}
        />
      )}

      {/* Sport intensity + per-phase advice */}
      <SportTrackerCard
        phase={state.phase}
        intensity={log.sportIntensity}
        onChange={setSportIntensity}
      />

      {/* Self-care rituals — only meaningful during the menstrual phase */}
      {state.phase === PHASES.MENSTRUAL && <MenstrualSelfCareCards />}

      {/* Recent cycles (only renders once there's ≥1 completed cycle) */}
      {!hidden.has('cycleHistory') && <CycleHistoryStrip profile={profile} />}

      {/* Cycle calendar — 6×7 grid with logged + predicted markers */}
      {!hidden.has('cycleCalendar') && <CycleCalendarCard profile={profile} onUpdateProfile={onUpdateProfile} />}

      {/* Today's nourishment */}
      {!hidden.has('todayNutrition') && <CollapsibleCard
        id="todayNutrition"
        title={t('nutrition.today')}
        defaultCollapsed={false}
        headerExtra={targets.calorieDelta > 0 && (
          <span className="text-[11px] text-sage-600 bg-sage-100 px-2.5 py-1 rounded-full">
            {t('nutrition.deltaFor', { n: targets.calorieDelta, phase: getPhaseMeta(state.phase).label.toLowerCase() })}
          </span>
        )}
        infoButton={<SectionInfoButton title={t('nutrition.today')} body={t('nutrition.info')} />}
        className="mb-5"
        style={{ animationDelay: '160ms' }}
      >
        <div className="space-y-6">
          <TrackerRow
            label={t('mini.kcal')}
            value={log.calories}
            target={targets.calories}
            unit="kcal"
            increments={[100, 250, 500]}
            onAdd={addCalories}
            onSet={setCalories}
          />
          <TrackerRow
            label={t('mini.eiwit')}
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
      </CollapsibleCard>}

      {/* Wellbeing — sleep + movement */}
      {!hidden.has('wellbeing') && <CollapsibleCard
        id="wellbeing"
        title={t('wellbeing.title')}
        infoButton={<SectionInfoButton title={t('wellbeing.title')} body={t('wellbeing.info')} />}
        className="mb-5"
        style={{ animationDelay: '200ms' }}
      >
        <div className="space-y-6">
          <SleepTracker hours={log.sleep} onChange={setSleep} />
          <div className="h-px bg-cream-200/70" />
          <MovementTracker minutes={log.movement} onChange={setMovement} phase={state.phase} />
        </div>
      </CollapsibleCard>}

      {/* Tip van de dag */}
      <TipVanDeDag phase={state.phase} log={log} goals={profile.goals} targets={targets} name={profile.name} />

      {/* Weekly nourishment history */}
      <WeeklyHistoryStrip profile={profile} todayLog={log} />

      {/* Gut health checklist */}
      {!hidden.has('gut') && <CollapsibleCard
        id="gut"
        title={t('gut.title')}
        headerExtra={
          <span className="text-[11px] text-ink-400">
            {t('gut.count', { n: Object.values(log.gut).filter(Boolean).length })}
          </span>
        }
        infoButton={<SectionInfoButton title={t('gut.title')} body={t('gut.info')} />}
        className="mb-5"
        style={{ animationDelay: '240ms' }}
      >
        <GutChecklist gut={log.gut} onToggle={toggleGut} />
      </CollapsibleCard>}

      {/* Nutrient focus */}
      {!hidden.has('focus') && <CollapsibleCard
        id="focus"
        title={t('focus.title')}
        className="mb-5"
        style={{ animationDelay: '280ms' }}
      >
        <div className="font-display text-xl text-ink-700 mb-1">{targets.focus.headline}</div>
        <p className="text-sm text-ink-500 leading-relaxed mb-4">{targets.focus.why}</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {targets.focus.foods.map((f) => (
            <span
              key={f}
              className="text-xs px-3 py-1.5 rounded-full bg-cream-100 border border-cream-200 text-ink-600"
            >
              {f}
            </span>
          ))}
        </div>
        {onOpenVoeding && (
          <button
            type="button"
            onClick={onOpenVoeding}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] py-3 rounded-xl bg-sage-50 border border-sage-200 text-sage-700 text-sm font-medium hover:bg-sage-100 active:scale-[0.98] transition"
          >
            <Salad aria-hidden="true" className="w-4 h-4" />
            {t('focus.openVoeding')}
            <ArrowRight aria-hidden="true" className="w-4 h-4" />
          </button>
        )}
      </CollapsibleCard>}

      {/* Workload / week planning */}
      {!hidden.has('workload') && <WorkloadCard phase={state.phase} />}

      {/* Journal note */}
      {!hidden.has('journal') && <CollapsibleCard
        id="journal"
        title={t('journal.title')}
        defaultCollapsed={false}
        bodyClassName="px-6 pb-6 pt-1"
        className="mb-5"
        style={{ animationDelay: '340ms' }}
      >
        <JournalNote note={log.note} onChange={setNote} hideHeader />
      </CollapsibleCard>}

      {/* Daily insight */}
      {!hidden.has('insight') && <CollapsibleCard
        id="insight"
        title={t('insight.title')}
        icon={Sparkles}
        defaultCollapsed={false}
        className="mb-5"
        style={{ animationDelay: '380ms' }}
      >
        <p className="font-display text-[19px] leading-snug text-ink-700">
          {insightText}
        </p>
      </CollapsibleCard>}

      <div className="text-center text-[11px] text-ink-400 mt-8 mb-2">
        {t('settings.version')}
      </div>

      <UndoToast visible={!!toast} dismissing={toastDismissing} onUndo={handleUndo} />

      {phaseInfo && (
        <PhaseInfoModal phase={phaseInfo} onClose={() => setPhaseInfo(null)} />
      )}
    </div>
  );
}

function UndoToast({ visible, dismissing, onUndo }) {
  const { t } = useT();
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
          aria-label={t('undo.aria')}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                     bg-ink-700/95 text-cream-50 text-sm font-medium shadow-lg backdrop-blur-md
                     hover:bg-ink-700 active:scale-[0.99] transition min-h-[44px]"
        >
          <Undo2 aria-hidden="true" className="w-4 h-4" />
          {t('undo.label')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bottom navigation                                                  */
/* ------------------------------------------------------------------ */

function BottomNav({ active, onSelect }) {
  const { t } = useT();
  const tabs = [
    { id: 'home',      labelKey: 'nav.home',     icon: Flower2   },
    { id: 'voeding',   labelKey: 'nav.voeding',  icon: Salad     },
    { id: 'logboek',   labelKey: 'nav.logboek',  icon: BookOpen  },
    { id: 'stats',     labelKey: 'nav.stats',    icon: BarChart2 },
    { id: 'settings',  labelKey: 'nav.settings', icon: Settings  },
  ];
  return (
    <nav
      aria-label={t('nav.aria')}
      className="fixed bottom-0 left-0 right-0 z-50 bg-cream-50/95 backdrop-blur-md border-t border-cream-200 flex pb-safe"
    >
      {tabs.map(({ id, labelKey, icon: Icon }) => {
        const on = active === id;
        const label = t(labelKey);
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

// Symptom icons are language-neutral emoji
const SYMPTOM_ICONS = {
  energy:   ['😴','🥱','😐','🙂','⚡'],
  mood:     ['😢','😔','😐','🙂','😄'],
  cramps:   ['🔥','😣','😐','🙂','✨'],
  bloating: ['🎈','😮','😐','🙂','✨'],
};

function formatLogDate(date, isToday, t, dayName, monthShort) {
  if (isToday) return t('common.today');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return t('common.yesterday');
  return `${dayName(date.getDay())} ${date.getDate()} ${monthShort(date.getMonth())}`;
}

function LogboekEntry({ date, isToday, log, state, targets, hasData, animDelay, onGoToToday }) {
  const { t, dayName, monthShort, bleedingLabel, sportIntensities, phaseMeta: getPhaseMeta } = useT();
  const dateLabel = formatLogDate(date, isToday, t, dayName, monthShort);
  const syms = log.symptoms || {};
  const symptomsLogged = Object.entries(syms).filter(([, v]) => v > 0);
  const waterTarget = Math.max(6, Math.round(targets.hydrationL * 4));
  const ovulationMarked = !!(log.ovulation?.felt || log.ovulation?.fromTemp);
  const bleeding = log.bleeding || {};
  const bleedingSummary = [bleeding.heaviness, bleeding.color, bleeding.clots]
    .filter((v) => v && v.length > 0)
    .map((id) => bleedingLabel(id))
    .slice(0, 3)
    .join(' · ');
  const sportLabel = sportIntensities().find(s => s.id === log.sportIntensity)?.label || '';

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
            <div className="text-[11px] text-ink-500">{getPhaseMeta(state.phase).label}</div>
            {isToday && (
              <div className="text-[10px] bg-sage-100 text-sage-700 px-1.5 py-0.5 rounded-full">{t('common.today')}</div>
            )}
          </div>

          {hasData ? (
            <div className="space-y-1.5">
              {log.calories > 0 && (
                <div className="flex items-center gap-2">
                  <div className="text-[11px] text-ink-400 w-14 shrink-0">{t('log.row.cal')}</div>
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
                  <div className="text-[11px] text-ink-400 w-14 shrink-0">{t('log.row.prot')}</div>
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
                  <div className="text-[11px] text-ink-400 w-14 shrink-0">{t('log.row.water')}</div>
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
                      <Heart className="w-3 h-3" />{t('log.row.ovulation')}
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
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-cream-200/60 flex-wrap">
                  {symptomsLogged.map(([id, val]) => (
                    <span key={id} className="text-[10px] text-ink-500 bg-cream-100 border border-cream-200 px-1.5 py-0.5 rounded-full">
                      {id[0].toUpperCase()}{val}
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
              <div className="text-[11px] text-ink-400/70 italic">{t('log.empty.curr')}</div>
              {onGoToToday && (
                <button
                  type="button"
                  onClick={onGoToToday}
                  className="text-[11px] text-sage-600 underline decoration-dotted underline-offset-2 hover:text-sage-700 active:scale-95 transition px-2 py-2 min-h-[44px] inline-flex items-center"
                >
                  {t('log.empty.cta')}
                </button>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-ink-400/60 italic">{t('log.row.empty')}</div>
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
  const { t, formatDate } = useT();
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
    formatDate(activeMonth, {
      month: 'long',
      year: activeMonth.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    })
  );
  const prevMonthLabel = capitalize(formatDate(prevMonthDate, { month: 'long' }));
  const nextMonthLabel = capitalize(formatDate(nextMonthDate, { month: 'long' }));

  return (
    <div className="min-h-dvh px-5 pt-8 pb-28 max-w-md mx-auto">
      <header className="flex items-center justify-between mb-7 anim-fade-up">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">{t('log.subtitle')}</div>
          <h1 className="font-display text-[30px] leading-tight text-ink-700">{t('log.title')}</h1>
        </div>
        <button
          type="button"
          onClick={() => exportCSV(profile)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cream-100 border border-cream-200
                     text-ink-500 text-xs hover:bg-cream-200 hover:text-ink-700 active:scale-95 transition min-h-[44px]"
          aria-label={t('log.export.aria')}
        >
          <Download aria-hidden="true" className="w-4 h-4" />
          {t('log.export')}
        </button>
      </header>

      {/* Month navigator */}
      <div className="flex items-center justify-between gap-2 mb-5 anim-fade-up">
        <button
          type="button"
          onClick={goPrevMonth}
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-cream-100 border border-cream-200
                     text-ink-500 text-xs hover:bg-cream-200 hover:text-ink-700 active:scale-95 transition min-h-[44px]"
          aria-label={t('log.month.prev', { month: prevMonthLabel })}
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
          aria-label={isCurrentMonth ? t('log.month.disabled') : t('log.month.next', { month: nextMonthLabel })}
        >
          {nextMonthLabel}
          <ChevronRight aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>

      {days.every(d => !d.hasData) ? (
        <div className="text-center py-16 text-ink-400 anim-fade-up">
          <p className="text-4xl mb-3">🌱</p>
          <p className="text-sm mb-1">
            {isCurrentMonth ? t('log.empty.curr') : t('log.empty.past', { month: monthLabel })}
          </p>
          {isCurrentMonth && (
            <p className="text-xs text-ink-400/70">{t('log.empty.hint')}</p>
          )}
          {isCurrentMonth && onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="mt-5 px-5 py-2.5 rounded-full bg-sage-600 text-cream-50 text-sm font-medium hover:bg-sage-700 transition"
            >
              {t('log.empty.cta')}
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
        {t('log.export.foot')}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Insights / Statistics tab                                          */
/* ------------------------------------------------------------------ */

function InsightsView({ profile, onOpenCharts }) {
  const { t, phaseMeta: getPhaseMeta, symptomMeta } = useT();
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
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">{t('stats.subtitle')}</div>
        <h1 className="font-display text-[30px] leading-tight text-ink-700">{t('stats.title')}</h1>
      </header>

      {/* Streak card */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '40ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">{t('stats.streak')}</div>
        <div className="flex items-end gap-8">
          <div>
            <div className="font-display text-[52px] text-ink-700 leading-none">
              {currentStreak}
            </div>
            <div className="text-xs text-ink-400 mt-1">{t('stats.streak.curr')}</div>
          </div>
          {streakRecord > 0 && (
            <div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-sage-500" />
                <div className="font-display text-[32px] text-sage-600 leading-none">
                  {streakRecord}
                </div>
              </div>
              <div className="text-xs text-ink-400 mt-1">{t('stats.streak.best')}</div>
            </div>
          )}
        </div>
        {currentStreak === 0 && (
          <p className="text-xs text-ink-400 mt-3 leading-relaxed">
            {t('stats.streak.empty')}
          </p>
        )}
      </Card>

      {/* Cycle stats */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '80ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">{t('stats.cycle.title')}</div>
        {cycleHistory.length >= 1 ? (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="font-display text-[38px] text-ink-700 leading-none">
                {avgCycle ?? '—'}
              </div>
              <div className="text-xs text-ink-400 mt-1">{t('stats.cycle.avg')}</div>
            </div>
            <div>
              <div className="font-display text-[38px] text-ink-700 leading-none">
                {cycleHistory.length}
              </div>
              <div className="text-xs text-ink-400 mt-1">{t('stats.cycle.count')}</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-400 leading-relaxed">
            {t('stats.cycle.empty')}
          </p>
        )}
      </Card>

      {/* Symptoms per phase */}
      <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-4">
          {t('stats.sym.title')}
        </div>
        {hasSymptomData ? (
          <div className="space-y-3.5">
            {Object.entries(PHASE_META).map(([phase, meta]) => {
              const top = topByPhase[phase];
              const phaseM = getPhaseMeta(phase);
              return (
                <div key={phase} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: meta.hue }}
                  />
                  <div className="text-xs text-ink-500 w-[76px] shrink-0">{phaseM.label}</div>
                  {top ? (
                    <div className="text-xs font-medium text-ink-700 bg-cream-100 px-2.5 py-1 rounded-full border border-cream-200">
                      {symptomMeta().find(s => s.id === top)?.label || top}
                    </div>
                  ) : (
                    <div className="text-xs text-ink-400/60 italic">{t('stats.sym.tooLittle')}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-ink-400 leading-relaxed">
            {t('stats.sym.empty')}
          </p>
        )}
      </Card>

      {/* Open all charts */}
      <button
        type="button"
        onClick={onOpenCharts}
        className="w-full flex items-center justify-between px-5 py-4 rounded-xl bg-cream-100 border border-cream-200 hover:border-sage-200 transition mb-5 anim-fade-up"
      >
        <div className="text-sm font-medium text-ink-700">{t('stats.allCharts')}</div>
        <ArrowRight className="w-4 h-4 text-ink-400" />
      </button>

      <div className="text-center text-[11px] text-ink-400 mt-4 mb-2">
        {t('stats.basis')}
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

  const r = 17;
  const c = 2 * Math.PI * r;
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  const displayRatio = mounted ? ratio : 0;
  const pctVal = Math.round(ratio * 100);
  const stroke = ratio >= 1 ? '#6B8559' : ratio >= 0.5 ? '#87A074' : ratio > 0 ? '#C78264' : '#D9CDB1';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-10 h-10 flex items-center justify-center">
        <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90 absolute inset-0">
          <circle cx="20" cy="20" r={r} className="goal-ring-track" stroke="#EDE6D3" strokeWidth="3.5" fill="none" />
          <circle
            cx="20" cy="20" r={r}
            stroke={stroke} strokeWidth="3.5" fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - displayRatio)}
            style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
        {ratio >= 1
          ? <span className="text-[12px] font-semibold relative z-10 text-sage-600">✓</span>
          : <span className={`text-[10px] font-semibold relative z-10 ${pctVal > 0 ? 'text-ink-700' : 'text-ink-400'}`}>{pctVal}%</span>
        }
      </div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">{label}</div>
    </div>
  );
}

function DaySummaryStrip({ log, goals, targets, waterGlassTarget }) {
  const { t } = useT();
  const g = goals || {};
  const items = [
    { label: t('mini.kcal'),  value: log.calories,        target: g.calories  || targets.calories },
    { label: t('mini.eiwit'), value: log.protein,         target: g.protein   || targets.protein  },
    { label: t('mini.water'), value: log.hydration * 250, target: g.hydration || (waterGlassTarget * 250) },
    { label: t('mini.move'),  value: log.movement,        target: g.movement  || 30 },
  ];

  if (!items.some((i) => i.value > 0)) return null;

  const allHit = items.every((i) => i.target > 0 && i.value / i.target >= 0.8);

  return (
    <div
      className="flex items-center gap-3 mb-5 px-4 py-4 rounded-xl3 bg-cream-50/80 backdrop-blur-sm border border-cream-200/60 shadow-soft anim-fade-up"
      aria-label={t('dash.summary.aria')}
    >
      <div className="flex flex-1 items-start justify-between gap-2">
        {items.map((it) => (
          <MiniRing key={it.label} value={it.value} target={it.target} label={it.label} />
        ))}
      </div>
      {allHit && (
        <div className="text-[10px] font-medium text-sage-700 bg-sage-50 border border-sage-200 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
          🌿 {t('dash.summary.goodDay')}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cycle calendar — 6×7 grid with logged + predicted markers          */
/* ------------------------------------------------------------------ */

const CAL_DAY_HEADERS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

const CAL_COLORS = {
  period:    '#e8748a',
  fertile:   '#6dbf82',
  ovulation: '#3d9e57',
};

function buildCalendarGrid(profile, today) {
  const start = atMidnight(today);
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow - 7);

  const cycleLength = profile?.cycleLength || 28;
  const periodLen   = profile?.mensDuration || 5;
  const history     = Array.isArray(profile?.periodHistory) ? profile.periodHistory : [];
  const lastStart   = profile?.lastPeriodStart || null;

  const loggedPeriodSet = new Set();
  for (const iso of history) {
    const d = new Date(`${iso}T00:00:00`);
    for (let i = 0; i < periodLen; i++) {
      const day = new Date(d);
      day.setDate(d.getDate() + i);
      loggedPeriodSet.add(toISODate(day));
    }
  }

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

  const fertileSet = new Set();
  const ovulationSet = new Set();
  if (lastStart) {
    const baseISO = toISODate(lastStart);
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

    out.push({ iso, day: d.getDate(), isToday, isFuture, tag, predicted });
  }
  return out;
}

function CycleCalendarCard({ profile, onUpdateProfile }) {
  const { formatDate } = useT();
  const today = useMemo(() => new Date(), []);
  const todayISO = useMemo(() => toISODate(today), [today]);
  const grid  = useMemo(() => buildCalendarGrid(profile, today), [profile, today]);
  const [selected, setSelected] = useState(null);
  const [editError, setEditError] = useState('');

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

  // Editable: today of een verleden dag — nooit een toekomstige dag.
  // Voorspelde-verleden cellen zijn óók bewerkbaar zodat een gebruiker
  // een mis-voorspelde periode kan corrigeren ("de engine dacht dat ik
  // gisteren begon, maar dat was vandaag pas"). Toekomst-voorspellingen
  // zijn read-only — een toekomstige periode pre-loggen heeft geen zin.
  const isEditable = (cell) => cell && cell.iso <= todayISO;
  const isLoggedStart = (cell) => Array.isArray(profile?.periodHistory)
    && profile.periodHistory.includes(cell?.iso);

  const handleToggle = (cell) => {
    if (!cell || !onUpdateProfile) return;
    setEditError('');
    const date = new Date(`${cell.iso}T00:00:00`);
    if (isLoggedStart(cell)) {
      onUpdateProfile(unlogPeriodStart(profile, date));
      return;
    }
    const next = logPeriodStart(profile, date);
    if (next === profile) {
      setEditError('Te dicht bij een bestaande start (binnen 10 dagen).');
      return;
    }
    onUpdateProfile(next);
  };

  return (
    <Card className="p-6 mb-5 anim-fade-up" style={{ animationDelay: '110ms' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Cyclus-kalender</div>
        {nextStartISO && (
          <div className="text-[11px] text-terracotta-600 bg-terracotta-100 px-2 py-0.5 rounded-full">
            volgende: {formatShortDate(nextStartISO, formatDate)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {CAL_DAY_HEADERS.map((d) => (
          <div key={d} className="text-[10px] uppercase tracking-wider text-ink-400 text-center">
            {d}
          </div>
        ))}
      </div>

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

      {tooltipCell && (
        <div className="mt-3 px-3 py-2.5 rounded-xl bg-cream-100/80 border border-cream-200 text-[12px] text-ink-600 leading-snug anim-fade-up">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <div className="font-medium text-ink-700">{formatShortDate(tooltipCell.iso, formatDate)}</div>
              <div className="text-ink-500">{tagLabel(tooltipCell) || 'Geen markering — gewone cyclusdag.'}</div>
            </div>
            {isEditable(tooltipCell) && onUpdateProfile && (
              <button
                type="button"
                onClick={() => handleToggle(tooltipCell)}
                className={`shrink-0 px-3 py-2 min-h-[44px] rounded-lg text-[11px] font-medium transition active:scale-95 ${
                  isLoggedStart(tooltipCell)
                    ? 'bg-cream-50 border border-terracotta-200 text-terracotta-600 hover:bg-terracotta-50'
                    : 'bg-terracotta-100 border border-terracotta-300 text-terracotta-700 hover:bg-terracotta-200'
                }`}
                aria-label={
                  isLoggedStart(tooltipCell)
                    ? `Wis menstruatie-start op ${tooltipCell.iso}`
                    : `Markeer ${tooltipCell.iso} als menstruatie-start`
                }
              >
                {isLoggedStart(tooltipCell) ? 'Wis start' : 'Markeer start'}
              </button>
            )}
          </div>
          {editError && (
            <div className="text-[11px] text-terracotta-600 mt-1">{editError}</div>
          )}
        </div>
      )}

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
        Lichtere kleuren zijn voorspellingen — tik op een dag om te markeren of te wissen.
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

function GoalRings({ log, goals, targets }) {
  const { t } = useT();
  const g = goals || {};
  const proteinTarget  = g.protein   || targets.protein;
  const hydrationTarget = g.hydration || (targets.hydrationL * 4 * 250);
  const movementTarget = g.movement  || 30;

  return (
    <CollapsibleCard
      id="goals"
      title={t('goals.title')}
      defaultCollapsed={false}
      className="mb-5"
    >
      <div className="grid grid-cols-4 gap-2">
        <GoalRing value={log.calories}          target={g.calories  || targets.calories} label={t('mini.kcal')}  unit="" />
        <GoalRing value={log.protein}           target={proteinTarget}                   label={t('mini.eiwit')} unit="g" />
        <GoalRing value={log.hydration * 250}   target={hydrationTarget}                label={t('mini.water')} unit="ml" />
        <GoalRing value={log.movement}          target={movementTarget}                  label={t('mini.move')}  unit="m" />
      </div>
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Fertility-window awareness                                         */
/* ------------------------------------------------------------------ */

/**
 * Toont relevant inhoud rond het vruchtbaar venster — afhankelijk van
 * `profile.pregnancyIntent`. Bij hormonale anticonceptie verzwakken we
 * de boodschap omdat het venster dan niet biologisch betekenisvol is.
 */
function FertilityWindowCard({ profile, state }) {
  const intent = profile?.pregnancyIntent;
  if (!intent || intent === 'none') return null;
  if (!state?.hasData) return null;

  // Pass profile zodat getFertilityStatus de overdue-status kan
  // detecteren — zonder dat gaf de functie misleidende "venster
  // over X dagen" claims terug op basis van een gewrapte cycleDay
  // wanneer de gebruikster eigenlijk te laat was.
  const fertility = getFertilityStatus(state, profile);
  if (!fertility) return null;

  const suppressed = suppressesCycle(profile?.contraception);

  let headline = '';
  let body = '';
  let accent = 'sage';
  let icon = '🌱';

  if (fertility.status === 'overdue') {
    // Bij over tijd verbergen we deze kaart — LateCycleCheckCard
    // neemt de communicatie hierover over en is preciezer
    // (vragen + voorwaardelijke test-suggestie).
    return null;
  }

  if (intent === 'trying') {
    accent = 'sage';
    if (fertility.status === 'ovulation') {
      headline = 'Vandaag is je geschatte ovulatiedag';
      body = 'De kans op bevruchting is theoretisch het hoogst. Luister vooral naar je lichaam — een lh-test of cervix-slijmcheck geeft concretere bevestiging.';
      icon = '🌸';
    } else if (fertility.status === 'fertile') {
      const toOvu = Math.max(0, fertility.ovulationDay - state.cycleDay);
      headline = 'Je zit in je vruchtbare venster';
      body = `Geschatte ovulatie over ${toOvu} dag${toOvu === 1 ? '' : 'en'}. Frequentie van seks elke 1–2 dagen verhoogt de kans.`;
      icon = '🌷';
    } else if (fertility.status === 'before') {
      headline = `Vruchtbaar venster over ${fertility.daysUntil} dag${fertility.daysUntil === 1 ? '' : 'en'}`;
      body = 'Goed moment om je tracking up to date te houden — basaaltemperatuur en cervix-slijm worden de komende dagen nuttiger.';
      icon = '🌱';
    } else {
      headline = 'Buiten het vruchtbare venster';
      body = `${fertility.daysSince} dag${fertility.daysSince === 1 ? '' : 'en'} sinds het venster sloot. Een gemiste menstruatie binnen ~14 dagen kan op een zwangerschap wijzen.`;
      icon = '🌾';
    }
  } else if (intent === 'avoiding') {
    if (fertility.status === 'ovulation' || fertility.status === 'fertile') {
      accent = 'terracotta';
      headline = fertility.status === 'ovulation'
        ? 'Vandaag is je geschatte ovulatiedag'
        : 'Je zit in je vruchtbare venster';
      body = 'De kans op zwangerschap is het hoogst tijdens deze dagen. Overweeg bescherming — de kalendermethode is statistisch ~75–80% effectief; gebruik betrouwbare anticonceptie als zwangerschap een gezondheidsrisico zou vormen.';
      icon = '⚠️';
    } else if (fertility.status === 'before') {
      headline = `Vruchtbaar venster over ${fertility.daysUntil} dag${fertility.daysUntil === 1 ? '' : 'en'}`;
      body = 'Houd er rekening mee bij planning — zaadcellen kunnen tot 5 dagen overleven, dus voorzichtigheid begint vóór het venster.';
      icon = '🗓️';
    } else {
      headline = 'Buiten het vruchtbare venster';
      body = `${fertility.daysSince} dag${fertility.daysSince === 1 ? '' : 'en'} sinds het venster sloot. Statistisch laag-risico, maar geen enkele cyclus is exact voorspelbaar.`;
      icon = '🌿';
    }
  }

  return (
    <CollapsibleCard
      id="fertilityWindow"
      title="Vruchtbaar venster"
      headerExtra={<span aria-hidden="true" className="text-base leading-none">{icon}</span>}
      className="mb-5"
    >
      {suppressed && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-cream-100/70 border border-cream-200 text-[11px] text-ink-500 leading-relaxed">
          Je gebruikt hormonale anticonceptie — onderstaande info is indicatief, niet biologisch.
        </div>
      )}
      <div className={`px-4 py-3.5 rounded-xl border ${
        accent === 'terracotta'
          ? 'bg-terracotta-50 border-terracotta-200'
          : 'bg-sage-50 border-sage-200'
      }`}>
        <div className={`font-display text-base mb-1 ${
          accent === 'terracotta' ? 'text-terracotta-700' : 'text-sage-700'
        }`}>
          {headline}
        </div>
        <p className="text-[13px] text-ink-600 leading-relaxed">{body}</p>
      </div>
      <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
        Voorspellingen zijn gebaseerd op een gemiddelde 28-daagse referentie, geschaald naar jouw cycluslengte. Niet bedoeld als anticonceptie- of vruchtbaarheidsadvies.
      </p>
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Late-cycle check-in                                                */
/* ------------------------------------------------------------------ */

const LATE_GRACE_DAYS = 2;
const LATE_QUESTIONS = [
  { id: 'stress',  label: 'Heb je deze cyclus extreme stress ervaren?' },
  { id: 'travel',  label: 'Heb je gereisd of van tijdzone gewisseld?' },
  { id: 'illness', label: 'Ben je ziek geweest of intensief getraind?' },
];

function LateCycleCheckCard({ profile, state, log, onUpdate }) {
  const lc = log.lateCheck || {};
  if (lc.dismissed) return null;
  // `state.cycleDay` wrapt via modulo binnen 1..cycleLength, dus die kan
  // niet betrouwbaar "te laat" detecteren. `getOverdueDays` rekent rauw
  // vanaf de laatst-gelogde startdatum (zie cycle.js).
  const overdueDays = getOverdueDays(profile);
  if (overdueDays == null || overdueDays <= LATE_GRACE_DAYS) return null;

  const setVal  = (key, val) => onUpdate({ lateCheck: { [key]: val } });
  const dismiss = () => onUpdate({ lateCheck: { dismissed: true } });

  const intent = profile?.pregnancyIntent;
  const onSuppressing = suppressesCycle(profile?.contraception);
  const showTestSuggestion =
    intent === 'trying' ||
    (intent === 'avoiding' && !onSuppressing) ||
    (intent !== 'avoiding' && profile?.contraception === 'none');

  // De "heb je je anticonceptie gevolgd?"-vraag is alleen zinvol voor
  // methoden die de cyclus daadwerkelijk onderdrukken — voor een
  // barrièremiddel of koperspiraal hangt het niet van "gevolgd?"
  // af of de cyclus loopt zoals verwacht.
  const showContraceptionQuestion = onSuppressing;

  return (
    <CollapsibleCard
      id="lateCycleCheck"
      title="Cyclus loopt achter"
      defaultCollapsed={false}
      headerExtra={(
        <span className="text-[11px] text-terracotta-700 bg-terracotta-100 px-2 py-0.5 rounded-full">
          {overdueDays} dag{overdueDays === 1 ? '' : 'en'} over tijd
        </span>
      )}
      className="mb-5"
    >
      <p className="text-[13px] text-ink-600 leading-relaxed mb-4">
        Geen reden tot zorg — cycli verschuiven van nature door stress, slaap, reizen en seizoensritme. Een paar vragen helpen Aura om je patroon scherper te leren.
      </p>

      <div className="space-y-3">
        {LATE_QUESTIONS.map(({ id, label }) => (
          <YesNoRow key={id} label={label} value={lc[id]} onChange={(v) => setVal(id, v)} />
        ))}
        {showContraceptionQuestion && (
          <YesNoRow
            label="Heb je je anticonceptie zoals gewoonlijk gevolgd?"
            value={lc.contraceptionMissed == null ? null : !lc.contraceptionMissed}
            // YesNoRow geeft null bij twee-keer-tap voor "wis antwoord";
            // anders true/false. We slaan de geïnverteerde waarde op
            // (missed = !followed) maar moeten null doorlaten — anders
            // staat de Ja/Nee permanent (`!null === true`).
            onChange={(v) => setVal('contraceptionMissed', v === null ? null : !v)}
          />
        )}
      </div>

      {showTestSuggestion && (
        <div className="mt-4 px-4 py-3 rounded-xl bg-terracotta-50 border border-terracotta-200">
          <div className="text-[12px] font-medium text-terracotta-700 mb-1">
            Wil je een zwangerschapstest overwegen?
          </div>
          <p className="text-[12px] text-ink-600 leading-relaxed mb-3">
            Een vroege test is meestal betrouwbaar vanaf ~14 dagen na de eisprong, oftewel rond de dag dat je menstruatie verwacht werd.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVal('consideringTest', true)}
              aria-pressed={lc.consideringTest === true}
              className={`flex-1 min-h-[44px] px-3 py-2 rounded-lg border text-sm transition active:scale-[0.99] ${
                lc.consideringTest === true
                  ? 'bg-terracotta-100 border-terracotta-400 text-terracotta-800 font-medium'
                  : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-terracotta-200'
              }`}
            >
              Ja, ik denk erover
            </button>
            <button
              type="button"
              onClick={() => setVal('consideringTest', false)}
              aria-pressed={lc.consideringTest === false}
              className={`flex-1 min-h-[44px] px-3 py-2 rounded-lg border text-sm transition active:scale-[0.99] ${
                lc.consideringTest === false
                  ? 'bg-cream-100 border-cream-300 text-ink-700 font-medium'
                  : 'bg-cream-50 border-cream-200 text-ink-600 hover:border-sage-200'
              }`}
            >
              Nee, nog niet
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={dismiss}
        className="mt-4 w-full text-[12px] text-ink-400 hover:text-ink-600 underline decoration-dotted underline-offset-4 transition py-2 min-h-[44px]"
        aria-label="Verberg deze check-in voor vandaag"
      >
        Verberg voor vandaag
      </button>
    </CollapsibleCard>
  );
}

function YesNoRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-cream-50 border border-cream-200">
      <div className="text-[13px] text-ink-600 leading-snug flex-1">{label}</div>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onChange(value === true ? null : true)}
          aria-pressed={value === true}
          className={`min-h-[44px] min-w-[44px] px-3 rounded-lg border text-xs font-medium transition active:scale-95 ${
            value === true
              ? 'bg-sage-100 border-sage-300 text-sage-700'
              : 'bg-cream-50 border-cream-200 text-ink-500 hover:border-sage-200'
          }`}
        >
          Ja
        </button>
        <button
          type="button"
          onClick={() => onChange(value === false ? null : false)}
          aria-pressed={value === false}
          className={`min-h-[44px] min-w-[44px] px-3 rounded-lg border text-xs font-medium transition active:scale-95 ${
            value === false
              ? 'bg-cream-100 border-cream-300 text-ink-700'
              : 'bg-cream-50 border-cream-200 text-ink-500 hover:border-sage-200'
          }`}
        >
          Nee
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Smart tip of the day (feature 6)                                  */
/* ------------------------------------------------------------------ */


function TipVanDeDag({ phase, log, goals, targets, name }) {
  const { t, tips: getTips } = useT();
  const todayISO = useMemo(() => isoDate(), []);
  const dismissKey = `aura.tip.dismissed.${todayISO}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === '1'; }
    catch { return false; }
  });

  const phaseTips = getTips(phase);
  const dayOfWeek = new Date().getDay();
  const tipFn = phaseTips[dayOfWeek % phaseTips.length];

  const displayName = name ? name.split(' ')[0] : '';
  let tip = tipFn(displayName);

  const yLog = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return loadLog(d);
  }, []); // loaded once — yesterday's log doesn't change during a session
  const proteinTarget   = goals?.protein   || targets.protein;
  const hydrationTarget = goals?.hydration || (targets.hydrationL * 4 * 250);
  const sleepTarget     = goals?.sleep     || 8;
  const movementTarget  = goals?.movement  || 30;

  // Contextual override: pick the most actionable tip from yesterday's data.
  if (yLog.sleep > 0 && yLog.sleep < sleepTarget - 1.5) {
    tip = t('tip.sleepLow', { name: displayName, h: yLog.sleep });
  } else if (yLog.symptoms?.mood > 0 && yLog.symptoms.mood <= 2) {
    tip = t('tip.moodLow', { name: displayName });
  } else if (yLog.symptoms?.cramps > 0 && yLog.symptoms.cramps <= 2) {
    tip = t('tip.cramps', { name: displayName });
  } else if (yLog.movement > 0 && yLog.movement < movementTarget * 0.5) {
    tip = t('tip.movementLow', { name: displayName, min: movementTarget });
  } else if (yLog.protein > 0 && yLog.protein < proteinTarget * 0.7) {
    tip = t('tip.proteinLow', { name: displayName, target: proteinTarget });
  } else if (yLog.hydration > 0 && yLog.hydration * 250 < hydrationTarget * 0.7) {
    const litres = (hydrationTarget / 1000).toFixed(1);
    tip = t('tip.hydrationLow', { actual: (yLog.hydration * 0.25).toFixed(1), target: litres });
  }

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(dismissKey, '1'); } catch { /* no-op */ }
  };

  if (dismissed) return null;

  return (
    <div
      className="relative p-5 mb-5 rounded-xl3 border shadow-soft anim-fade-up overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #FFF6E5 0%, #F8E9D2 100%)',
        borderColor: '#E2C9A2',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-cream-50 border border-terracotta-200 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-terracotta-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-terracotta-600 font-semibold mb-1">
            {t('tip.title')}
          </div>
          <p className="text-[15px] text-ink-700 leading-relaxed font-medium">{tip}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('tip.dismiss.aria')}
          className="w-9 h-9 rounded-full bg-cream-50/70 border border-cream-200 flex items-center justify-center text-ink-400 hover:text-ink-600 active:scale-95 transition shrink-0"
        >
          <X aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Workload card — work/sport/agenda advice per phase                */
/* ------------------------------------------------------------------ */

function WorkloadCard({ phase }) {
  const { t, phaseWork } = useT();
  const work = phaseWork(phase);
  if (!work) return null;

  return (
    <CollapsibleCard id="workload" title={t('workload.title')} icon={Calendar} className="mb-5">
      <div className="space-y-4">
        <div className="font-display text-lg text-ink-700">{work.headline}</div>

        <div className="space-y-3">
          {[
            { labelKey: 'workload.work',   icon: Briefcase, body: work.workTip  },
            { labelKey: 'workload.sport',  icon: Dumbbell,  body: work.sportTip },
          ].map(({ labelKey, icon: Icon, body }) => (
            <div key={labelKey} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-sage-100 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-sage-600" />
              </div>
              <div>
                <div className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-0.5">{t(labelKey)}</div>
                <p className="text-sm text-ink-600 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">{t('workload.agenda')}</div>
          <ul className="space-y-1.5">
            {work.agendaTips.map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-sm text-ink-600">
                <Check className="w-3.5 h-3.5 text-sage-500 mt-0.5 shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Phase recipes (feature 5)                                         */
/* ------------------------------------------------------------------ */

function PhaseRecipes({ phase }) {
  const { t, phaseMeta, phaseRecipes } = useT();
  const [expanded, setExpanded] = useState(null);
  const recipes = phaseRecipes(phase);

  return (
    <CollapsibleCard
      id="phaseRecipes"
      title={t('recipes.titleFor', { phase: phaseMeta(phase).label })}
      defaultCollapsed={false}
      className="mb-5"
    >
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
                  <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2">{t('recipes.ingredients')}</div>
                  <ul className="space-y-1 mb-4">
                    {recipe.ingredients.map((ing) => (
                      <li key={ing} className="flex items-center gap-2 text-xs text-ink-600">
                        <span className="w-1 h-1 rounded-full bg-sage-400 shrink-0" />
                        {ing}
                      </li>
                    ))}
                  </ul>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-2">{t('recipes.steps')}</div>
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
    </CollapsibleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Extended charts (feature 4)                                        */
/* ------------------------------------------------------------------ */

function ExtendedCharts({ profile }) {
  const { t } = useT();
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
            className={`min-h-[44px] px-5 py-2.5 rounded-full text-sm transition active:scale-95 ${days === n ? 'bg-sage-600 text-cream-50' : 'bg-cream-100 border border-cream-200 text-ink-600 hover:border-sage-200'}`}>
            {t('charts.daysFmt', { n })}
          </button>
        ))}
      </div>

      {showCorrelation && (
        <div className="px-4 py-3 rounded-xl bg-sage-50 border border-sage-200 text-sm text-sage-700">
          🧠 {t('charts.lutealMore')}
        </div>
      )}

      {/* Calorie line chart */}
      <Card className="p-5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-3">{t('charts.kcal')}</div>
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
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-3">{t('charts.protein')}</div>
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
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-3">{t('charts.sleep')}</div>
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
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mb-3">{t('charts.mood')}</div>
        <div className="flex items-end gap-2 h-16">
          {[1,2,3,4,5].map(n => {
            const h = moodCounts[n] > 0 ? Math.max(8, (moodCounts[n] / maxMood) * 56) : 4;
            return (
              <div key={n} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[10px] text-ink-400">{moodCounts[n]}</div>
                <div className="w-full rounded-t-lg bg-sage-200" style={{ height: h }} />
                <div className="text-[10px] text-ink-400 font-medium">{n}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Voeding tab                                                        */
/* ------------------------------------------------------------------ */

function FoodLogCard({ log, onUpdate, targets }) {
  const { t } = useT();
  const [name, setName]     = useState('');
  const [kcal, setKcal]     = useState('');
  const [protein, setProt]  = useState('');
  const [adding, setAdding] = useState(false);

  const meals = log.meals || [];
  const totalKcal    = meals.reduce((s, m) => s + (m.kcal    || 0), 0);
  const totalProtein = meals.reduce((s, m) => s + (m.protein || 0), 0);

  const handleAdd = () => {
    const k = Math.max(0, Number(kcal) || 0);
    const p = Math.max(0, Number(protein) || 0);
    if (!name.trim() && k === 0 && p === 0) return;
    const meal = { id: Date.now(), name: name.trim() || t('food.log.item'), kcal: k, protein: p };
    onUpdate({ meals: [...meals, meal], calories: log.calories + k, protein: log.protein + p });
    setName(''); setKcal(''); setProt('');
    setAdding(false);
  };

  const handleRemove = (meal) => {
    onUpdate({
      meals:    meals.filter((m) => m.id !== meal.id),
      calories: Math.max(0, log.calories - (meal.kcal    || 0)),
      protein:  Math.max(0, log.protein  - (meal.protein || 0)),
    });
  };

  const pctKcal = targets.calories > 0 ? Math.min(100, Math.round(totalKcal    / targets.calories  * 100)) : 0;
  const pctProt = targets.protein  > 0 ? Math.min(100, Math.round(totalProtein / targets.protein   * 100)) : 0;

  return (
    <CollapsibleCard id="foodlog" title={t('food.log.title')} defaultCollapsed={false} className="mb-5">
      {/* Daily totals progress */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: t('mini.kcal'), val: totalKcal,    target: targets.calories, unit: 'kcal', pct: pctKcal },
          { label: t('mini.eiwit'), val: totalProtein, target: targets.protein,  unit: 'g',    pct: pctProt },
        ].map(({ label, val, target, unit, pct }) => (
          <div key={label} className="bg-cream-50 border border-cream-200 rounded-xl px-3 py-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">{label}</div>
            <div className="font-display text-[22px] leading-none text-ink-700">
              {val}<span className="text-sm text-ink-400 ml-1">{unit}</span>
            </div>
            <div className="mt-2 h-1.5 bg-cream-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-sage-300 transition-all" style={{ width: `${pct}%` }} />
            </div>
            {target > 0 && (
              <div className="text-[10px] text-ink-400 mt-1">{pct}% {t('food.log.ofTarget', { n: target, unit })}</div>
            )}
          </div>
        ))}
      </div>

      {/* Meal list */}
      {meals.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {meals.map((meal) => (
            <div key={meal.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-cream-50 border border-cream-200">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-700 truncate">{meal.name}</div>
                <div className="text-[10px] text-ink-400 mt-0.5">
                  {meal.kcal > 0 && <span>{meal.kcal} kcal</span>}
                  {meal.kcal > 0 && meal.protein > 0 && <span className="mx-1">·</span>}
                  {meal.protein > 0 && <span>{meal.protein}g eiwit</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(meal)}
                aria-label={t('food.log.remove')}
                className="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:text-terracotta-500 hover:bg-terracotta-50 transition active:scale-90"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add meal form */}
      {adding ? (
        <div className="space-y-2 p-3 bg-cream-50 border border-cream-200 rounded-xl">
          <input
            type="text"
            value={name}
            // Cap op 80 chars zodat een runaway paste niet de log-blob
            // opblaast (oude bug: meal-name had geen length-cap — paste
            // van 10 MB string werd serialised in localStorage en quota
            // exhaustion ontstond stil). Profile.name en log.note hebben
            // een cap; meal-name had die niet — audit F-08 fix.
            onChange={(e) => setName(e.target.value.slice(0, 80))}
            placeholder={t('food.log.namePh')}
            className="w-full px-3 py-2.5 rounded-lg border border-cream-200 bg-white text-sm text-ink-700 placeholder-ink-400/60 focus:outline-none focus:border-sage-300"
            maxLength={80}
          />
          <div className="flex gap-2">
            <input
              type="number" min="0" max="9999"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              placeholder="kcal"
              className="flex-1 px-3 py-2.5 rounded-lg border border-cream-200 bg-white text-sm text-ink-700 placeholder-ink-400/60 focus:outline-none focus:border-sage-300"
            />
            <input
              type="number" min="0" max="999"
              value={protein}
              onChange={(e) => setProt(e.target.value)}
              placeholder="eiwit g"
              className="flex-1 px-3 py-2.5 rounded-lg border border-cream-200 bg-white text-sm text-ink-700 placeholder-ink-400/60 focus:outline-none focus:border-sage-300"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAdding(false); setName(''); setKcal(''); setProt(''); }}
              className="flex-1 min-h-[40px] rounded-lg border border-cream-200 text-ink-500 text-sm hover:bg-cream-100 active:scale-95 transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleAdd}
              className="flex-1 min-h-[40px] rounded-lg bg-sage-600 text-cream-50 text-sm font-medium hover:bg-sage-700 active:scale-95 transition"
            >
              {t('food.log.add')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-dashed border-cream-300 text-sm text-ink-500 hover:border-sage-300 hover:text-sage-700 hover:bg-sage-50 active:scale-[0.98] transition"
        >
          <Plus className="w-4 h-4" />
          {t('food.log.addMeal')}
        </button>
      )}
    </CollapsibleCard>
  );
}

function VoedingView({ profile }) {
  const { t, phaseBreakfasts, phaseMeta } = useT();
  const state   = useMemo(() => getCycleState(profile), [profile]);
  const targets = useMemo(() => getDailyTargets(profile, state.phase), [profile, state.phase]);
  const allBreakfasts = phaseBreakfasts(state.phase) || [];
  const [bfOffset, setBfOffset] = useState(0);
  const [log, updateLog] = useDailyLog();

  const PAGE = 3;
  const visible = allBreakfasts.slice(bfOffset, bfOffset + PAGE);
  const canRefresh = allBreakfasts.length > PAGE;

  const handleRefresh = () => {
    setBfOffset((prev) => (prev + PAGE) % allBreakfasts.length);
  };

  const perMealProtein = targets.protein > 0 ? Math.round(targets.protein / 4) : 0;
  const phaseLabel = phaseMeta(state.phase)?.label?.toLowerCase() ?? '';

  return (
    <div className="min-h-dvh px-5 pt-8 pb-28 max-w-md mx-auto">
      <header className="mb-7 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">{t('food.subtitle')}</div>
        <h1 className="font-display text-[30px] leading-tight text-ink-700">{t('food.title')}</h1>
      </header>

      {/* Personalized daily targets */}
      {targets.calories > 0 && (
        <Card className="p-5 mb-5 anim-fade-up">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-3">{t('nutrition.targets.title')}</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { value: targets.calories, unit: t('nutrition.targets.kcal'),       color: 'bg-sage-100 text-sage-700' },
              { value: `${targets.protein}g`, unit: t('nutrition.targets.protein'),    color: 'bg-terracotta-100 text-terracotta-600' },
              { value: `${targets.hydrationL}L`, unit: t('nutrition.targets.water'), color: 'bg-cream-200 text-ink-600' },
            ].map(({ value, unit, color }) => (
              <div key={unit} className={`rounded-xl px-3 py-2.5 text-center ${color}`}>
                <div className="font-display text-lg leading-none">{value}</div>
                <div className="text-[10px] mt-1 opacity-75">{unit}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-400 leading-snug">
            {t('nutrition.targets.based', { kg: profile.weightKg ?? '–', cm: profile.heightCm ?? '–', phase: phaseLabel })}
            {targets.calorieDelta > 0 && ` (+${targets.calorieDelta} kcal)`}
          </p>
          {perMealProtein > 0 && (
            <p className="text-[11px] text-ink-400 mt-1">{t('nutrition.targets.perMeal', { g: perMealProtein })}</p>
          )}
        </Card>
      )}

      {/* Food log calculator */}
      <FoodLogCard log={log} onUpdate={updateLog} targets={targets} />

      <Card className="p-6 mb-5 anim-fade-up">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400 mb-2">{t('food.focus')}</div>
        <div className="font-display text-xl text-ink-700 mb-1">{targets.focus.headline}</div>
        <p className="text-sm text-ink-500 leading-relaxed mb-4">{targets.focus.why}</p>
        <div className="flex flex-wrap gap-2">
          {targets.focus.foods.map((f) => (
            <span key={f} className="text-xs px-3 py-1.5 rounded-full bg-cream-100 border border-cream-200 text-ink-600">{f}</span>
          ))}
        </div>
      </Card>
      <CollapsibleCard
        id="breakfast"
        title={t('breakfast.title')}
        defaultCollapsed={false}
        className="mb-5"
      >
        <div className="space-y-2">
          {visible.map((b) => (
            <div
              key={b.name}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-cream-50 border border-cream-200"
            >
              <div className="w-8 h-8 rounded-full bg-cream-200 flex items-center justify-center shrink-0">
                <Salad className="w-4 h-4 text-ink-500" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-700">{b.name}</div>
                <div className="text-[11px] text-ink-400 mt-0.5">{b.hint}</div>
              </div>
            </div>
          ))}
        </div>
        {canRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-3 flex items-center gap-1.5 text-xs text-sage-600 hover:text-sage-700 active:scale-95 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('breakfast.refresh')}
          </button>
        )}
      </CollapsibleCard>
      <PhaseRecipes phase={state.phase} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  All charts view (stub — filled in by feature 4)                   */
/* ------------------------------------------------------------------ */

function AllChartsView({ profile, onBack }) {
  const { t } = useT();
  return (
    <div className="min-h-dvh px-5 pt-8 pb-28 max-w-md mx-auto">
      <header className="flex items-center gap-3 mb-7 anim-fade-up">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('charts.back.aria')}
          className="w-11 h-11 rounded-full bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-500 hover:text-ink-700 transition"
        >
          <ChevronLeft aria-hidden="true" className="w-4 h-4" />
        </button>
        <h1 className="font-display text-[28px] leading-tight text-ink-700">{t('charts.title')}</h1>
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

  const locale = detectLocale();
  const tc = (key) => tStatic(locale, key);

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
        {tc('crash.title')}
      </h1>
      <p className="text-sm text-ink-500 text-center leading-relaxed mb-6">
        {tc('crash.body')}
      </p>

      <button
        type="button"
        onClick={handleReload}
        className="w-full rounded-xl bg-sage-600 text-cream-50 py-3.5 font-medium
                   hover:bg-sage-600 active:scale-[0.98] transition flex items-center justify-center gap-2 mb-3"
      >
        {tc('crash.title')}
      </button>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="w-full rounded-xl border border-cream-200 bg-cream-50 text-ink-600 py-3 text-sm
                   hover:border-sage-200 hover:bg-sage-50 transition mb-2"
      >
        {showDetails ? tc('crash.hide') : tc('crash.show')}
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
            {copied ? tc('crash.copied') : tc('crash.copy')}
          </button>
          <p className="text-[10px] text-ink-400 text-center mt-3 leading-relaxed">
            {tc('crash.privacyNote')}
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
/*  Consent gate — AVG art. 9 expliciete toestemming                   */
/* ------------------------------------------------------------------ */

// Versie van de consent-tekst. Bump als de scope van de verwerking
// materieel verandert (b.v. nieuwe data-categorie, nieuwe verwerker).
// Bestaande gebruikers met een lagere versie krijgen automatisch
// opnieuw de consent-gate voorgelegd.
const CONSENT_VERSION = '1.4-2026-05';

function ConsentGate({ onAccept, onOpenLegal }) {
  const { t } = useT();
  const [checked, setChecked] = useState(false);

  return (
    <main id="main" className="min-h-dvh flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-xl3 bg-cream-50/95 backdrop-blur-sm shadow-glow border border-cream-200/60 p-7 anim-fade-up">
          <div className="flex items-center gap-2 mb-3">
            <Flower2 className="w-5 h-5 text-sage-600" aria-hidden="true" />
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">
              AVG · art. 9
            </div>
          </div>
          <h1 className="font-display text-[26px] text-ink-700 leading-tight mb-3">
            {t('consent.title')}
          </h1>
          <p className="text-sm text-ink-600 leading-relaxed mb-5">
            {t('consent.intro')}
          </p>

          <ul className="text-sm text-ink-600 leading-relaxed space-y-2 mb-5">
            <li>{t('consent.li1')}</li>
            <li>{t('consent.li2')}</li>
            <li>{t('consent.li3')}</li>
          </ul>

          <button
            type="button"
            onClick={onOpenLegal}
            className="text-xs text-sage-700 hover:text-sage-800 underline decoration-dotted underline-offset-4 transition mb-5 inline-flex items-center gap-1 min-h-[44px]"
          >
            {t('consent.legal.link')}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>

          <label className="flex items-start gap-3 cursor-pointer mb-6 min-h-[44px]">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 w-5 h-5 accent-sage-600 cursor-pointer shrink-0"
              aria-describedby="consent-checkbox-label"
            />
            <span id="consent-checkbox-label" className="text-sm text-ink-700 leading-relaxed">
              {t('consent.checkbox')}
            </span>
          </label>

          <button
            type="button"
            onClick={() => checked && onAccept()}
            disabled={!checked}
            aria-disabled={!checked}
            className={`w-full rounded-xl py-3.5 font-medium text-sm transition flex items-center justify-center gap-2 ${
              checked
                ? 'bg-sage-600 text-cream-50 hover:bg-sage-700 active:scale-[0.98]'
                : 'bg-cream-200 text-ink-400 cursor-not-allowed'
            }`}
          >
            {checked ? t('consent.continue') : t('consent.continue.disabled')}
            {checked && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Root                                                               */
/* ------------------------------------------------------------------ */

function App() {
  const { t } = useT();
  const [profile, setProfile] = useState(() => loadProfile());
  // Tijdens de consent-gate kan de gebruikster op "Lees privacy-tekst"
  // klikken. We tonen dan tijdelijk de LegalView (met back-knop), zonder
  // dat ze toegang krijgt tot de rest van de app vóór toestemming.
  const [consentViewLegal, setConsentViewLegal] = useState(false);
  const [tab, setTab] = useState('home');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // Tweede-stap-confirmatie: gebruiker moet expliciet "WIS"/"ERASE"
  // typen voordat de actie uitvoert. Voorkomt accidentele dataverlies
  // door één klik op de gevarenzone-knop.
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('aura.theme') || 'auto'; }
    catch { return 'auto'; }
  });

  const handleThemeChange = useCallback((newTheme) => {
    setTheme(newTheme);
    try { localStorage.setItem('aura.theme', newTheme); }
    catch { /* private mode / quota — theme still applies in-memory */ }
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = newTheme === 'dark' || (newTheme === 'auto' && sysDark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, []);

  // Surface storage-write failures aan de gebruiker. Voor de audit zat
  // `setStorageErrorHandler` exported maar nergens gewired — een quota-
  // exceeded of private-mode block werd stilletjes geslikt en data ging
  // verloren zonder dat iemand het wist. Eén alert is voldoende per
  // sessie; daarna log-only zodat de UI niet vol popups raakt.
  const [storageWarned, setStorageWarned] = useState(false);
  useEffect(() => {
    setStorageErrorHandler((err) => {
      console.error('[Aura] storage error:', err);
      if (!storageWarned) {
        setStorageWarned(true);
        // Lichte browser-alert — Aura heeft geen toast-systeem op
        // app-niveau (alleen per-view). Dit is een launch-grade
        // fallback; v1.4 kan een nettere banner toevoegen.
        try {
          window.alert(
            'Aura kon je laatste wijziging niet opslaan. ' +
            'Controleer of je browser-opslag vol is, of dat je in ' +
            'privé-modus zit (Safari Private Browsing). Je gegevens ' +
            'in deze sessie blijven werken tot je de tab sluit.'
          );
        } catch { /* sommige WebViews staan geen alert toe */ }
      }
    });
    return () => setStorageErrorHandler(null);
  }, [storageWarned]);

  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key) return; // localStorage.clear() in another tab
      if (e.key === 'aura.profile') setProfile(loadProfile());
      if (e.key === 'aura.theme') {
        const nextTheme = localStorage.getItem('aura.theme') || 'auto';
        const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const dark = nextTheme === 'dark' || (nextTheme === 'auto' && sysDark);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      }
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

  // AVG art. 9: gezondheidsgegevens vereisen expliciete toestemming.
  // Bestaande gebruikers van vóór v1.4 hebben geen consent-veld; toon
  // hen eenmalig de consent-gate. Pas na bevestiging slaan we
  // `profile.consent = { givenAt, version }` op zodat we kunnen
  // bewijzen dat (en wanneer) consent is verkregen. Bij text-changes
  // die de scope materieel raken: bump CONSENT_VERSION → re-consent.
  if (!profile.consent || profile.consent.version !== CONSENT_VERSION) {
    if (consentViewLegal) {
      return <LegalView onBack={() => setConsentViewLegal(false)} />;
    }
    return (
      <ConsentGate
        onAccept={() => {
          const next = {
            ...profile,
            consent: {
              givenAt: new Date().toISOString(),
              version: CONSENT_VERSION,
            },
          };
          saveProfile(next);
          setProfile(next);
        }}
        onOpenLegal={() => setConsentViewLegal(true)}
      />
    );
  }

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
          className="fixed inset-0 z-[60] flex items-center justify-center px-5 bg-ink-700/40 backdrop-blur-sm"
          onClick={() => { setShowResetConfirm(false); setResetConfirmText(''); }}
        >
          <div
            className="w-full max-w-sm bg-cream-50 rounded-2xl shadow-glow p-6 anim-fade-up"
            role="alertdialog"
            aria-labelledby="reset-dialog-title"
            aria-describedby="reset-dialog-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="reset-dialog-title" className="font-display text-[22px] text-ink-700 mb-2">{t('reset.title')}</h2>
            <p id="reset-dialog-desc" className="text-sm text-ink-500 leading-relaxed mb-4">
              {t('reset.body')}
            </p>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder={t('reset.input.placeholder')}
              aria-label={t('reset.input.aria')}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full mb-5 px-3 py-2.5 rounded-lg border border-cream-300 bg-white text-sm text-ink-700 placeholder-ink-400/60 focus:outline-none focus:border-terracotta-300 focus:ring-2 focus:ring-terracotta-200/60"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowResetConfirm(false); setResetConfirmText(''); }}
                className="flex-1 min-h-[44px] py-3 rounded-xl border border-cream-200 bg-cream-100 text-ink-600 text-sm font-medium hover:bg-cream-200 active:scale-[0.98] transition"
              >
                {t('reset.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Accept WIS (NL) of ERASE (EN); case-insensitive trim
                  const v = resetConfirmText.trim().toUpperCase();
                  if (v === 'WIS' || v === 'ERASE') {
                    confirmReset();
                    setResetConfirmText('');
                  }
                }}
                disabled={!['WIS', 'ERASE'].includes(resetConfirmText.trim().toUpperCase())}
                aria-disabled={!['WIS', 'ERASE'].includes(resetConfirmText.trim().toUpperCase())}
                className={`flex-1 min-h-[44px] py-3 rounded-xl text-sm font-medium transition active:scale-[0.98] ${
                  ['WIS', 'ERASE'].includes(resetConfirmText.trim().toUpperCase())
                    ? 'bg-terracotta-500 text-cream-50 hover:bg-terracotta-600'
                    : 'bg-cream-200 text-ink-400 cursor-not-allowed'
                }`}
              >
                {t('reset.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      <main key={tab} id="main" className="anim-tab-in">
        {tab === 'home' && (
          <Dashboard
            profile={profile}
            onUpdateProfile={updateProfile}
            onOpenSettings={() => setTab('settings')}
            onOpenVoeding={() => setTab('voeding')}
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
      </main>
      <BottomNav active={tab} onSelect={setTab} />
      <PWAInstallBanner />
      <ReminderBanner profile={profile} />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </ErrorBoundary>
);
