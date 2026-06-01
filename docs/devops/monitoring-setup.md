# Paced — Monitoring setup

Two complementary, privacy-first layers. Both are **off by default** and add
**zero** third-party code/CSP exposure until you turn them on.

## 1. Error tracking — Sentry (or self-hosted GlitchTip)

Wired in `src/lib/monitoring.js`, gated on `window.PACED_SENTRY_DSN`.

**Enable:**
1. Create a Sentry project (choose the **EU region** — Frankfurt — for health-data residency) or self-host **GlitchTip** in the EU.
2. Copy the DSN.
3. In `index.html`, set:
   ```js
   window.PACED_SENTRY_DSN = 'https://xxxx@oYYY.ingest.de.sentry.io/ZZZ';
   window.PACED_ENV        = 'production';
   ```
4. If your DSN host is **not** `*.ingest.*.sentry.io` (e.g. self-hosted GlitchTip),
   add its origin to `connect-src` in `_headers`.
5. Rebuild + deploy. Trigger a test error (DevTools: `throw new Error('test')`)
   and confirm it appears in Sentry.

**What's sent (errors only):** exception + stack, breadcrumbs (console
breadcrumbs are dropped), a query-stripped URL. **Never sent:** the user
object/IP, cookies/headers, emails (redacted), URL query strings (the partner
`?invite=CODE`), or any `localStorage` health data. Redaction lives in
`scrubEvent`/`scrubBreadcrumb` and is unit-tested in `tests/monitoring.test.js`.

No performance tracing, no session replay — errors only.

**Optional — stamp the release** for per-deploy error grouping: set
`window.PACED_RELEASE` (e.g. inject the git SHA at build time in `build.mjs`).

## 2. Web analytics — Cloudflare Web Analytics (zero code)

Cookieless, privacy-friendly, GDPR-clean, and **no code or CSP change needed**
for a Cloudflare Pages site.

**Enable:** Cloudflare dashboard → **Analytics & Logs → Web Analytics** →
add a site → select the Pages project / `paced.nl`. Cloudflare injects the
beacon automatically (or auto-enable it from the Pages project's settings).
You get Core Web Vitals (LCP/INP/CLS), page views, and referrers without
cookies or a consent banner.

> Prefer this over Google Analytics: no cookie-consent burden, no PII, no
> `script-src`/`connect-src` loosening, aligned with the app's privacy stance.

## 3. Backend & payments observability (Supabase + Stripe dashboards)

- **Supabase → Logs**: edge-function logs (`stripe-webhook`, checkout),
  Postgres, and Auth. Set log-drains/alerts if on Pro.
- **Stripe → Developers → Webhooks**: enable "email on failed delivery".
  A silently failing webhook = paid users not entitled — this is the
  highest-value alert (see the runbook §6 SLO table).
- **Uptime**: point an external monitor (UptimeRobot / Better Uptime) at
  `https://paced.nl/` and `https://paced.nl/.well-known/apple-app-site-association`.
