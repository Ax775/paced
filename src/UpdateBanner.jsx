import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Listens for a new service worker waiting in the background and prompts
 * the user to refresh. Only mounted when the app is installed and a SW is
 * registered (see main.jsx).
 */
export default function UpdateBanner({ registration }) {
  const [waiting, setWaiting] = useState(null);

  useEffect(() => {
    if (!registration) return;

    function trackWaiting(reg) {
      if (reg.waiting) setWaiting(reg.waiting);
    }
    function trackUpdate(reg) {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          setWaiting(installing);
        }
      });
    }

    trackWaiting(registration);
    registration.addEventListener('updatefound', () => trackUpdate(registration));

    // Poll for an update every 15 minutes while the tab is open.
    const intervalId = setInterval(() => {
      registration.update().catch(() => {});
    }, 15 * 60_000);

    // When the new SW takes control, reload once so the user sees the new code.
    let didReload = false;
    const onCtrlChange = () => {
      if (didReload) return;
      didReload = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onCtrlChange);

    return () => {
      clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener('controllerchange', onCtrlChange);
    };
  }, [registration]);

  if (!waiting) return null;

  function applyUpdate() {
    waiting.postMessage('SKIP_WAITING');
  }

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-sm w-[calc(100%-2rem)] rounded-xl bg-sage-50 border border-sage-200 shadow-soft p-4 text-sm text-ink-700 z-50 anim-slide-up"
    >
      <p className="font-medium mb-1">Nieuwe versie beschikbaar</p>
      <p className="text-ink-500 leading-relaxed mb-3">
        Aura is bijgewerkt. Vernieuw om de laatste verbeteringen te zien.
      </p>
      <button
        type="button"
        onClick={applyUpdate}
        className="inline-flex items-center gap-2 rounded-xl bg-sage-500 hover:bg-sage-600 text-cream-50 px-4 py-2 font-medium transition"
      >
        <RefreshCw size={16} aria-hidden="true" />
        Vernieuwen
      </button>
    </div>
  );
}
