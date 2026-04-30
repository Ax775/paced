import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import UnlockGate from './UnlockGate.jsx';
import UpdateBanner from './UpdateBanner.jsx';
import { ensureSchemaVersion } from './lib/schema.js';
import './fonts.css';
import './index.css';

ensureSchemaVersion();

// Test-only hook for the CI a11y suite. Activates only when the page is loaded
// with `?e2e=1`, so real users never expose internal storage modules.
if (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('e2e') === '1') {
  Promise.all([
    import('./lib/secureStorage.js'),
    import('./lib/storage.js'),
  ]).then(([secure, storage]) => {
    window.__auraTest = { secure, storage };
  });
}

function Root() {
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => setRegistration(reg))
      .catch(() => {});
  }, []);

  return (
    <ErrorBoundary>
      <UnlockGate>
        <App />
      </UnlockGate>
      <UpdateBanner registration={registration} />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
