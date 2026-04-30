/**
 * Aura — telemetry stub
 * ---------------------
 * Disabled by default. Aura promises in §5 van docs/legal/privacyverklaring.md
 * dat er geen error-tracking is — als je dit aanzet, **werk de
 * privacyverklaring bij vóór livegang** en verwerk een nieuwe
 * acceptance-bump (LEGAL_VERSION) zodat bestaande gebruikers opnieuw
 * geïnformeerd toestemming geven.
 *
 * Activeren:
 *
 *   1. npm install @sentry/browser
 *   2. Vervang `captureException` hieronder met:
 *
 *        import { init, captureException as sentryCapture } from '@sentry/browser';
 *
 *        if (import.meta.env.VITE_SENTRY_DSN) {
 *          init({
 *            dsn: import.meta.env.VITE_SENTRY_DSN,
 *            environment: import.meta.env.MODE,
 *            release: import.meta.env.VITE_APP_VERSION || 'dev',
 *            tracesSampleRate: 0,
 *            sendDefaultPii: false,
 *            autoSessionTracking: false,
 *            beforeSend: scrubEvent,
 *            beforeBreadcrumb: () => null,
 *          });
 *        }
 *
 *        export function captureException(error, info) {
 *          if (!import.meta.env.VITE_SENTRY_DSN) return;
 *          sentryCapture(error, info ? { extra: { componentStack: info } } : undefined);
 *        }
 *
 *   3. Zet `VITE_SENTRY_DSN=https://…@sentry.io/…` in je host-env
 *   4. Bump LEGAL_VERSION in src/app.jsx en update privacyverklaring §5 + §6
 */

function isUserDataKey(key) {
  return /profile|log|cycle|symptom|nutrition|passphrase|password|name|note/i.test(key);
}

/**
 * Aggressive PII-scrubber bedoeld om te runnen in Sentry's beforeSend.
 * Verwijdert alles dat op gezondheidsdata of identifiers lijkt zodat
 * een stray exception nooit gevoelige data kan lekken.
 *
 * Geëxporteerd zodat de echte Sentry-init dezelfde scrubber kan
 * hergebruiken zodra je activeert.
 */
export function scrubEvent(event) {
  if (!event) return event;
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      message: '[scrubbed]',
      data: {},
    }));
  }
  if (event.extra) {
    for (const k of Object.keys(event.extra)) {
      if (isUserDataKey(k)) event.extra[k] = '[redacted]';
    }
  }
  if (event.tags) {
    for (const k of Object.keys(event.tags)) {
      if (isUserDataKey(k)) delete event.tags[k];
    }
  }
  delete event.user;
  if (event.request?.url) {
    try {
      const u = new URL(event.request.url);
      event.request.url = u.origin + u.pathname;
    } catch { /* leave as-is */ }
  }
  return event;
}

export function initTelemetry() {
  // No-op stub. See top-of-file instructions to enable.
}

export function captureException(_error, _info) {
  // No-op stub. See top-of-file instructions to enable.
}
