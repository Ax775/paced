import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import UnlockGate from './UnlockGate.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <UnlockGate>
        <App />
      </UnlockGate>
    </ErrorBoundary>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
