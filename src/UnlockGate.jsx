import React, { useEffect, useRef, useState } from 'react';
import { Lock, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import {
  isInitialized, isUnlocked, setupNew, unlock, lock, migratePlaintext,
  onQuotaError,
} from './lib/secureStorage.js';
import {
  isCryptoAvailable, WrongPassphraseError, CryptoUnavailableError,
} from './lib/crypto.js';

const MIN_PASSPHRASE = 8;
const HIDDEN_LOCK_MS = 60_000;     // lock 60s after tab hides
const IDLE_LOCK_MS = 5 * 60_000;   // lock after 5 min idle

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

function UnlockScreen({ onUnlocked }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      </div>
    </GateShell>
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
  const idleTimer = useRef(null);
  const hiddenTimer = useRef(null);

  useEffect(() => {
    onQuotaError(() => setQuota(true));
  }, []);

  // Auto-lock when tab is hidden for HIDDEN_LOCK_MS, or after IDLE_LOCK_MS of no input.
  useEffect(() => {
    if (phase !== 'unlocked') return;

    const resetIdle = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        lock();
        setPhase('locked');
      }, IDLE_LOCK_MS);
    };

    const onVisibility = () => {
      clearTimeout(hiddenTimer.current);
      if (document.visibilityState === 'hidden') {
        hiddenTimer.current = setTimeout(() => {
          lock();
          setPhase('locked');
        }, HIDDEN_LOCK_MS);
      } else {
        resetIdle();
      }
    };

    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    resetIdle();

    return () => {
      clearTimeout(idleTimer.current);
      clearTimeout(hiddenTimer.current);
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase]);

  if (phase === 'no-crypto') return <CryptoUnavailableScreen />;
  if (phase === 'setup')     return <SetupScreen   onReady={() => setPhase('unlocked')} />;
  if (phase === 'locked')    return <UnlockScreen onUnlocked={() => setPhase('unlocked')} />;

  return (
    <>
      <main id="main">{children}</main>
      <QuotaToast visible={quota} onDismiss={() => setQuota(false)} />
    </>
  );
}
