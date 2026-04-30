import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Lock, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import {
  isInitialized, isUnlocked, setupNew, unlock, lock, migratePlaintext,
  destroyAll, onQuotaError,
} from './lib/secureStorage.js';
import {
  isCryptoAvailable, WrongPassphraseError, CryptoUnavailableError,
} from './lib/crypto.js';

const MIN_PASSPHRASE = 8;
const PREF_KEY = 'aura.prefs.autoLockMinutes';
const DEFAULT_AUTO_LOCK_MIN = 30; // 0 = never

export const AUTO_LOCK_OPTIONS = [
  { value: 0,  label: 'Uit'        },
  { value: 5,  label: '5 minuten'  },
  { value: 15, label: '15 minuten' },
  { value: 30, label: '30 minuten' },
  { value: 60, label: '1 uur'      },
];

export function getAutoLockMinutes() {
  const stored = localStorage.getItem(PREF_KEY);
  if (stored === null) return DEFAULT_AUTO_LOCK_MIN;
  const raw = Number(stored);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_AUTO_LOCK_MIN;
  return raw;
}

function saveAutoLockMinutes(min) {
  try { localStorage.setItem(PREF_KEY, String(min)); } catch { /* no-op */ }
}

const UnlockContext = createContext({
  lockNow: () => {},
  setAutoLockMinutes: () => {},
  autoLockMinutes: DEFAULT_AUTO_LOCK_MIN,
});

export function useUnlock() {
  return useContext(UnlockContext);
}

const inputCx =
  'w-full rounded-xl border border-cream-200 bg-cream-50 px-4 py-3 text-ink-700 ' +
  'placeholder:text-ink-400/70 focus:outline-none focus:border-sage-300 focus:ring-2 ' +
  'focus:ring-sage-200/60 transition';

function PassphraseField({ id, value, onChange, onSubmit, autoFocus, label, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] uppercase tracking-[0.14em] text-ink-400 font-medium mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
          autoFocus={autoFocus}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          className={`${inputCx} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Verberg wachtwoord' : 'Toon wachtwoord'}
          aria-pressed={visible}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 p-1 rounded"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

function GateShell({ children }) {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl3 bg-cream-50/90 backdrop-blur-sm shadow-soft border border-cream-200/60 p-8">
        {children}
      </div>
    </main>
  );
}

function CryptoUnavailableScreen() {
  return (
    <GateShell>
      <ShieldAlert size={32} className="text-terracotta-500 mb-3" aria-hidden="true" />
      <h1 className="font-display text-2xl text-ink-700 mb-2">Beveiliging niet beschikbaar</h1>
      <p className="text-ink-500 text-sm leading-relaxed">
        Aura heeft de Web Crypto API nodig om je gegevens veilig te bewaren. Open de app via een
        beveiligde verbinding (HTTPS) of <code>localhost</code> in een moderne browser.
      </p>
    </GateShell>
  );
}

function SetupScreen({ onReady }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tooShort = pw.length > 0 && pw.length < MIN_PASSPHRASE;
  const mismatch = confirm.length > 0 && pw !== confirm;
  const canSubmit = pw.length >= MIN_PASSPHRASE && pw === confirm && acknowledged && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await setupNew(pw);
      try { await migratePlaintext(); } catch { /* migration is best-effort */ }
      onReady();
    } catch (e) {
      setError('Kon beveiliging niet instellen. Probeer opnieuw.');
      setBusy(false);
    }
  }

  return (
    <GateShell>
      <div className="flex items-center gap-2 mb-3">
        <Lock size={20} className="text-sage-500" aria-hidden="true" />
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-400 font-medium">
          Eerste keer instellen
        </span>
      </div>
      <h1 className="font-display text-2xl text-ink-700 mb-2">Bescherm je gegevens</h1>
      <p className="text-ink-500 text-sm leading-relaxed mb-6">
        Aura bewaart je cyclus en gezondheidsdata uitsluitend op dit apparaat, versleuteld met een
        wachtwoord dat alleen jij kent.
      </p>

      <div className="space-y-4">
        <PassphraseField
          id="aura-pw-new"
          label="Kies een wachtwoord"
          placeholder={`Minimaal ${MIN_PASSPHRASE} tekens`}
          value={pw}
          onChange={setPw}
          onSubmit={submit}
          autoFocus
        />
        {tooShort && (
          <p className="text-xs text-terracotta-500">Minimaal {MIN_PASSPHRASE} tekens.</p>
        )}

        <PassphraseField
          id="aura-pw-confirm"
          label="Bevestig wachtwoord"
          placeholder="Typ hetzelfde wachtwoord"
          value={confirm}
          onChange={setConfirm}
          onSubmit={submit}
        />
        {mismatch && (
          <p className="text-xs text-terracotta-500">De wachtwoorden komen niet overeen.</p>
        )}

        <div className="rounded-xl bg-terracotta-100/60 border border-terracotta-200 p-4 text-sm text-ink-600 leading-relaxed">
          <p className="font-medium text-ink-700 mb-1">Belangrijk om te weten</p>
          <p>
            Er is geen herstelmogelijkheid. Als je dit wachtwoord vergeet, blijven je gegevens
            versleuteld en zijn ze niet meer leesbaar.
          </p>
        </div>

        <label className="flex items-start gap-3 text-sm text-ink-600 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 accent-sage-500"
          />
          <span>Ik begrijp dat ik mijn gegevens niet kan terughalen zonder dit wachtwoord.</span>
        </label>

        {error && <p className="text-sm text-terracotta-500">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-sage-500 hover:bg-sage-600 disabled:bg-sage-200 disabled:cursor-not-allowed text-cream-50 px-5 py-3 font-medium transition"
        >
          {busy ? 'Bezig…' : 'Aura beveiligen'}
        </button>
      </div>
    </GateShell>
  );
}

function ForgotConfirm({ onCancel, onConfirm }) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-title"
      className="fixed inset-0 z-50 bg-ink-700/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-xl3 bg-cream-50 shadow-soft border border-cream-200 p-6 anim-slide-up">
        <h2 id="forgot-title" className="font-display text-xl text-ink-700 mb-2">
          Alles wissen en opnieuw beginnen?
        </h2>
        <p className="text-sm text-ink-500 leading-relaxed mb-4">
          Als je je wachtwoord kwijt bent, is je data niet meer leesbaar. Je kunt Aura wel
          opnieuw instellen — alle bestaande gegevens worden dan permanent verwijderd.
        </p>

        <div className="rounded-xl bg-terracotta-100/60 border border-terracotta-200 p-4 text-sm text-ink-600 leading-relaxed mb-4">
          <p className="font-medium text-ink-700 mb-1">Wat verloren gaat</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Je profiel en doelen</li>
            <li>Alle dagelijkse logs en cyclus-geschiedenis</li>
            <li>Je huidige wachtwoord</li>
          </ul>
        </div>

        <label className="flex items-start gap-3 text-sm text-ink-600 cursor-pointer mb-5">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 accent-terracotta-500"
          />
          <span>Ik begrijp dat dit niet ongedaan kan worden gemaakt.</span>
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-cream-200 bg-cream-50 text-ink-600 py-3 text-sm font-medium hover:bg-cream-100 transition"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!acknowledged}
            className="flex-1 rounded-xl bg-terracotta-500 hover:bg-terracotta-600 disabled:bg-terracotta-200 disabled:cursor-not-allowed text-cream-50 py-3 text-sm font-medium transition"
          >
            Wis alles
          </button>
        </div>
      </div>
    </div>
  );
}

function UnlockScreen({ onUnlocked, onReset }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  async function submit() {
    if (!pw || busy) return;
    setBusy(true);
    setError('');
    try {
      await unlock(pw);
      try { await migratePlaintext(); } catch { /* migration is best-effort */ }
      onUnlocked();
    } catch (e) {
      if (e instanceof WrongPassphraseError) setError('Onjuist wachtwoord.');
      else setError('Kon Aura niet ontgrendelen. Probeer opnieuw.');
      setBusy(false);
      setPw('');
    }
  }

  return (
    <>
      <GateShell>
        <div className="flex items-center gap-2 mb-3">
          <Lock size={20} className="text-sage-500" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-400 font-medium">
            Vergrendeld
          </span>
        </div>
        <h1 className="font-display text-2xl text-ink-700 mb-2">Welkom terug</h1>
        <p className="text-ink-500 text-sm leading-relaxed mb-6">
          Voer je wachtwoord in om Aura te openen.
        </p>

        <div className="space-y-4">
          <PassphraseField
            id="aura-pw-unlock"
            label="Wachtwoord"
            placeholder="Je wachtwoord"
            value={pw}
            onChange={setPw}
            onSubmit={submit}
            autoFocus
          />
          {error && <p className="text-sm text-terracotta-500" role="alert">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={!pw || busy}
            className="w-full rounded-xl bg-sage-500 hover:bg-sage-600 disabled:bg-sage-200 disabled:cursor-not-allowed text-cream-50 px-5 py-3 font-medium transition"
          >
            {busy ? 'Ontgrendelen…' : 'Ontgrendelen'}
          </button>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="w-full text-center text-sm text-ink-400 hover:text-ink-600 transition pt-1"
          >
            Wachtwoord vergeten?
          </button>
        </div>
      </GateShell>

      {confirming && (
        <ForgotConfirm
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onReset(); }}
        />
      )}
    </>
  );
}

function QuotaToast({ visible, onDismiss }) {
  if (!visible) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-sm w-[calc(100%-2rem)] rounded-xl bg-terracotta-100 border border-terracotta-300 shadow-soft p-4 text-sm text-ink-700 z-50 anim-slide-up"
    >
      <p className="font-medium mb-1">Geheugen op dit apparaat is vol</p>
      <p className="text-ink-500 leading-relaxed mb-3">
        Sommige van je laatste wijzigingen konden niet worden opgeslagen. Maak ruimte vrij in je
        browser, of exporteer je gegevens via Instellingen.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-sage-600 font-medium hover:underline"
      >
        Sluiten
      </button>
    </div>
  );
}

export default function UnlockGate({ children }) {
  const [phase, setPhase] = useState(() => {
    if (!isCryptoAvailable()) return 'no-crypto';
    return isInitialized() ? 'locked' : 'setup';
  });
  const [quota, setQuota] = useState(false);
  const [autoLockMin, setAutoLockMin] = useState(getAutoLockMinutes);
  const idleTimer = useRef(null);

  useEffect(() => {
    onQuotaError(() => setQuota(true));
  }, []);

  // Idle auto-lock — controlled by user preference.
  useEffect(() => {
    if (phase !== 'unlocked' || autoLockMin <= 0) return;

    const ms = autoLockMin * 60_000;
    const resetIdle = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        lock();
        setPhase('locked');
      }, ms);
    };

    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
    resetIdle();

    return () => {
      clearTimeout(idleTimer.current);
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
    };
  }, [phase, autoLockMin]);

  const ctx = {
    lockNow: () => { lock(); setPhase('locked'); },
    setAutoLockMinutes: (min) => {
      saveAutoLockMinutes(min);
      setAutoLockMin(min);
    },
    autoLockMinutes: autoLockMin,
  };

  if (phase === 'no-crypto') return <CryptoUnavailableScreen />;
  if (phase === 'setup')     return <SetupScreen   onReady={() => setPhase('unlocked')} />;
  if (phase === 'locked') {
    return (
      <UnlockScreen
        onUnlocked={() => setPhase('unlocked')}
        onReset={() => { destroyAll(); setPhase('setup'); }}
      />
    );
  }

  return (
    <UnlockContext.Provider value={ctx}>
      <main id="main">{children}</main>
      <QuotaToast visible={quota} onDismiss={() => setQuota(false)} />
    </UnlockContext.Provider>
  );
}
