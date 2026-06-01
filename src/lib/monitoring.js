/**
 * monitoring.js — Optional, privacy-first error tracking for Paced.
 *
 * Paced handles menstrual-health data, so error monitoring must never leak
 * personal data. This module:
 *   - Is a complete NO-OP unless `window.PACED_SENTRY_DSN` is set, so the
 *     app ships dark by default and you opt in by configuring a DSN (use an
 *     EU-region Sentry/GlitchTip project for data residency).
 *   - Loads @sentry/browser lazily (only when a DSN exists) so an
 *     unconfigured build never initialises it.
 *   - Sends errors ONLY — no performance tracing, no session replay, no PII.
 *   - Scrubs every outgoing event: drops the user object, strips URL query
 *     strings (the partner ?invite=CODE), redacts email addresses, and drops
 *     console breadcrumbs (which may echo logged values).
 *
 * `scrubEvent` and `scrubBreadcrumb` are exported pure functions so the
 * redaction logic is unit-tested independently of the SDK/network.
 */

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const REDACTED = '[redacted]';

/** Strip the query string from a URL string (keeps path), tolerant of junk. */
function stripQuery(url) {
  if (typeof url !== 'string') return url;
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  let cut = url.length;
  if (q !== -1) cut = Math.min(cut, q);
  if (h !== -1) cut = Math.min(cut, h);
  return url.slice(0, cut);
}

function redactEmails(str) {
  return typeof str === 'string' ? str.replace(EMAIL_RE, REDACTED) : str;
}

/**
 * Sentry beforeSend hook. Returns a scrubbed event, or null to drop it.
 * Pure: takes an event object, returns a new-ish event (mutated copy is fine
 * for Sentry's contract).
 */
export function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event;

  // Never send identity.
  delete event.user;

  // Request URL: keep the path, drop the query (?invite=…, tokens, etc.).
  if (event.request && typeof event.request === 'object') {
    delete event.request.cookies;
    delete event.request.headers;
    if (event.request.url) event.request.url = stripQuery(event.request.url);
    if (event.request.query_string) delete event.request.query_string;
  }

  // Redact emails in the top-level message.
  if (typeof event.message === 'string') event.message = redactEmails(event.message);

  // Redact emails in exception messages.
  const values = event.exception?.values;
  if (Array.isArray(values)) {
    for (const v of values) {
      if (v && typeof v.value === 'string') v.value = redactEmails(v.value);
    }
  }

  // Breadcrumbs are scrubbed by scrubBreadcrumb at capture time, but a
  // belt-and-braces pass here drops any console breadcrumbs that slipped in.
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs
      .filter((b) => b?.category !== 'console')
      .map(scrubBreadcrumb)
      .filter(Boolean);
  }

  return event;
}

/**
 * Sentry beforeBreadcrumb hook. Returns a scrubbed breadcrumb, or null to
 * drop it. Drops console breadcrumbs (they may echo logged values) and
 * strips query strings + emails from navigation/fetch/xhr breadcrumbs.
 */
export function scrubBreadcrumb(breadcrumb) {
  if (!breadcrumb || typeof breadcrumb !== 'object') return breadcrumb;
  if (breadcrumb.category === 'console') return null; // drop entirely

  if (typeof breadcrumb.message === 'string') {
    breadcrumb.message = redactEmails(breadcrumb.message);
  }
  const data = breadcrumb.data;
  if (data && typeof data === 'object') {
    if (typeof data.url === 'string') data.url = stripQuery(data.url);
    if (typeof data.to === 'string') data.to = stripQuery(data.to);
    if (typeof data.from === 'string') data.from = stripQuery(data.from);
  }
  return breadcrumb;
}

let _api = null;

/**
 * Initialise error monitoring if a DSN is configured. Safe to call once on
 * boot; a no-op (and never throws) when unconfigured or if the chunk fails
 * to load — monitoring must never break the app.
 *
 * The Sentry SDK lives in a SEPARATE build artifact (dist/sentry.js, see
 * build.mjs). We load it via a non-literal dynamic import so esbuild leaves
 * it as a runtime fetch and keeps it out of the first-paint app.js bundle.
 */
export async function initMonitoring() {
  if (_api) return;
  const dsn = typeof window !== 'undefined' ? window.PACED_SENTRY_DSN : '';
  if (!dsn) return;
  try {
    const chunkUrl = '/sentry.js';                 // built sibling, served at root
    const mod = await import(/* @vite-ignore */ chunkUrl);
    _api = mod.initSentry({
      dsn,
      environment: window.PACED_ENV || 'production',
      release: window.PACED_RELEASE || undefined,
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
  } catch {
    /* monitoring is best-effort; swallow */
  }
}

/** Manually report a caught error (e.g. from the React ErrorBoundary). */
export function captureError(error, context) {
  if (!_api) return;
  try {
    _api.captureException(error, context);
  } catch {
    /* never throw from the reporter */
  }
}
