/**
 * sentry-chunk.js — the heavy half of error monitoring, isolated.
 *
 * esbuild bundles THIS file separately into dist/sentry.js (see build.mjs),
 * so @sentry/browser (~110 KB gzip) never lands in the first-paint app.js.
 * monitoring.js loads this chunk at runtime, and only when a DSN is set.
 *
 * Keep this file's surface tiny: it just initialises Sentry with the
 * scrub hooks passed in from monitoring.js and returns a capture function.
 */
import * as Sentry from '@sentry/browser';

export function initSentry({ dsn, environment, release, beforeSend, beforeBreadcrumb }) {
  Sentry.init({
    dsn,
    environment: environment || 'production',
    release: release || undefined,
    // Errors only — no performance tracing, no session replay.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend,
    beforeBreadcrumb,
  });
  return {
    captureException: (error, context) =>
      Sentry.captureException(error, context ? { extra: context } : undefined),
  };
}
