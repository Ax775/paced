# Paced — Production Runbook

Canonical DevOps reference for **paced.nl**. Covers infrastructure, deploy
workflow, CI/CD, the (optional) container path, observability, reliability, and
a copy-pasteable deployment checklist. Companion reference files live alongside
this doc in `docs/devops/`.

---

## 1. Executive summary

Paced is a **client-only React 18 PWA**, localStorage-first, served as static
`dist/` from **Cloudflare Pages'** global anycast edge CDN. There is no origin
server. The only backend is **Supabase** (EU region — auth magic-link,
partner-linking, subscriptions, three Deno edge functions) plus **Stripe** for
the €3/mo subscription via full-page redirect. All personal health/log data
stays on-device in `localStorage` (`paced.*` keys) and never leaves the browser.

**Edge CDN, not Kubernetes — on purpose.** Cloudflare Pages already gives global
distribution, automatic TLS, infinite horizontal autoscaling, and atomic
zero-downtime deploys for free, with no servers to patch. Wrapping `dist/` in a
container on K8s would replace all of that with a single regional origin you must
scale, monitor, and patch — while *adding* latency. The Docker/K8s artifacts in
this folder are an **optional alternative path** (local prod-like preview, a
future on-prem/sovereignty mandate, CI build determinism) and must not replace
Cloudflare Pages for paced.nl.

**The honest gaps to close before EU launch** (see §6 and the checklist): no
error tracking, no uptime monitoring, a stale Service Worker cache version, and
no codified rollback. None are blockers for the static core, but the billing
path (Stripe webhook → `subscriptions`) is the one place a silent failure costs
real money and entitlements.

---

## 2. Infrastructure architecture

### Request flow (EU data residency)

```
                    ┌─────────────────────────────────────────────┐
   Browser (PWA)    │  Cloudflare Pages (edge CDN, anycast)        │
   localStorage  ──►│  Static dist/: index.html, app.js, sw.js     │
   paced.* keys     │  styles.css, fonts, manifest, _headers (CSP, │
   (all health data)│  HSTS, COOP/CORP). No origin server.         │
                    └───────────────┬─────────────────────────────┘
                                    │  fetch() — CSP connect-src allow-list
              ┌─────────────────────┼──────────────────────────────┐
              ▼                     ▼                              ▼
   Supabase (EU region)   Supabase Edge Functions        Stripe (full-page
   tyvideihbfjfmdzdkyks   create-checkout-session         redirect, not iframe)
   ┌──────────────────┐   create-billing-portal           €3/mo, iDEAL/card
   │ Auth (magic link)│   stripe-webhook ◄──────────────────  Stripe webhook
   │ REST/WSS + RLS   │        │ (service-role key)             (signed event)
   │ partner_links    │        ▼
   │ partner_snapshots│   writes subscriptions row (service-role only)
   │ subscriptions    │
   └──────────────────┘
```

Only auth, partner-linking, and subscription state touch Supabase. Keep the
Supabase project pinned to an **EU region (Frankfurt)** so PII (emails, partner
links) never leaves the EU — relevant for the planned BV/EU launch.

### Environments

| Env | Frontend | Backend |
|-----|----------|---------|
| **Production** | CF Pages `main` → `paced.nl` | Supabase `tyvideihbfjfmdzdkyks` (prod) |
| **Preview/Staging** | CF Pages preview (auto per PR/branch) → `*.pages.dev` | Separate Supabase project `paced-staging` |

CF Pages builds a preview for every non-`main` branch with no extra config.
Point previews at a **second Supabase project** (cleaner than Supabase branching:
secrets and Stripe keys differ). Inject the staging Supabase URL/anon-key via CF
Pages **Preview** environment variables and read them in `build.mjs` when
transforming `index.html`, rather than hardcoding. Use **Stripe test-mode** keys
in staging edge functions.

### Build

- Tool: custom `build.mjs` (esbuild + Tailwind CLI — no Vite/Webpack). Node
  `>=20`, npm `>=10`.
- Steps: bundle `src/app.jsx` → `dist/app.js` (ESM, minified, target
  es2020/safari14, sourcemap off unless `BUILD_SOURCEMAP=1`); Tailwind CLI →
  `dist/styles.css`; transform `index.html` (strip CDN/Babel/importmap, inject
  built assets); copy `manifest.webmanifest`, `sw.js`, `_headers`, `robots.txt`,
  `assets/`, `.well-known/`.
- Cloudflare Pages config (dashboard, no `wrangler.toml` in repo): build command
  `npm run build`, output dir `dist`, env `NODE_VERSION=20`.
- Current artifact sizes: `app.js` **656 KB** (README's "~248 KB" is **stale** —
  fix it), `styles.css` 30.5 KB, `index.html` 19.9 KB, `sw.js` 3.95 KB, fonts
  Fraunces 121 KB + Inter 48 KB.

### DNS / TLS / custom domain

- DNS on Cloudflare; register both `paced.nl` (apex) and `www.paced.nl` as CF
  Pages custom domains. Add a redirect rule `www.paced.nl/* → https://paced.nl/$1`
  (301) so the apex is canonical.
- TLS fully Cloudflare-managed (Universal SSL). HSTS `preload` is already set in
  `_headers`; once submitted to hstspreload.org it is effectively irreversible,
  so keep `includeSubDomains` accurate before launching any subdomain.

### Secrets — three tiers

1. **Client-shipped (public by design):** Supabase URL + **anon JWT** in
   `index.html` (`window.PACED_SUPABASE_URL` / `_ANON_KEY`). Safe because every
   table enforces **RLS** — the anon key grants only what policies allow (users
   read their own `subscriptions`/`partner_links` row; no client-writable
   entitlement). Treat as a public identifier, not a secret.
2. **CF Pages build env vars:** non-secret build inputs (`NODE_VERSION=20`,
   per-env Supabase URL/anon-key). Set separately for Production vs Preview.
3. **Supabase Function secrets** (`Deno.env`, never in repo or client):
   `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`,
   `STRIPE_WEBHOOK_SECRET`. `stripe-webhook` verifies the Stripe signature and is
   deployed `--no-verify-jwt`; the service-role key (full RLS bypass) lives only
   here.

Key files: `_headers`, `build.mjs`, `index.html`, `supabase/functions/`,
`supabase/migrations/`.

---

## 3. Deployment workflow

**Frontend (paced.nl):** push/merge to `main` → Cloudflare Pages Git integration
builds (`npm run build`) and atomically publishes the immutable `dist/`. Nothing
to run by hand. Per-branch PRs get a preview URL the CF Pages GitHub app posts as
a PR check — reviewers click it.

**Edge functions:** NOT deployed by Cloudflare. Deploy via the
`deploy-functions.yml` workflow (reference in this folder) on pushes to `main`
touching `supabase/functions/**`, or manually:

```
supabase functions deploy create-checkout-session --project-ref tyvideihbfjfmdzdkyks
supabase functions deploy create-billing-portal    --project-ref tyvideihbfjfmdzdkyks
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref tyvideihbfjfmdzdkyks
```

**Migrations:** apply `supabase/migrations/*.sql` (0001 partner_links, 0002
secure invite acceptance, 0003 subscriptions) via `supabase db push` before the
code that depends on them ships.

**Rollback:**
- *Static site* — CF Pages dashboard → Deployments → "Rollback to this
  deployment". Atomic, instant, no rebuild (the prior immutable artifact is
  reactivated). Or `wrangler pages deployment list` then redeploy a known-good
  build.
- *Edge functions* — re-deploy the prior commit (re-run `deploy-functions.yml`
  against the previous SHA).
- *Service Worker* — keep a **kill-switch SW** ready (see §7) for the rare case a
  bad SW traps clients.

---

## 4. CI/CD pipeline

**Principle:** GitHub Actions **gates quality**; Cloudflare Pages **publishes**.
Don't duplicate deploys in Actions.

**Today** (`.github/workflows/ci.yml`): one job `test-and-build` on PRs to `main`
and pushes to `main` — checkout, Node 20 (npm cache), pin npm, `npm ci`,
`npm test` (vitest), `npm run build`, then assert dist artifacts exist and
`dist/index.html` has no external CDN refs. Concurrency cancels in-flight runs.
It does **not** lint, run Lighthouse, or deploy.

**Proposed improvements** (`docs/devops/ci.improved.yml`, reference — do not
overwrite the live workflow):
- **Lockfile-drift guard** — explicit error before `npm ci` dumps a confusing diff.
- **SW cache-version check** — advisory warning if app code (`src/`, `sw.js`)
  changed but the `paced-shell-vN` cache name in `sw.js` did not bump.
- **Lighthouse job** — `npm run audit` (`scripts/audit-lighthouse.mjs`) as a
  separate gated job. Keep **advisory** until the budget is stable, then make it
  a required branch-protection check.

**Other reference workflows in this folder:**
- `deploy-functions.yml` — Supabase edge-function deploy (see §3). Needs the
  `SUPABASE_ACCESS_TOKEN` repo secret.
- A `release.yml` (tag + CHANGELOG via `changelogen`, triggered on `release:`
  commits to `main`) is a nice-to-have once a versioning cadence is wanted.

---

## 5. Containerization — OPTIONAL / ALTERNATIVE PATH

> **Read this first.** For a static PWA on Cloudflare Pages, Docker/K8s is the
> *wrong default*. The artifacts below exist only for: a reproducible local
> prod-like preview, a future on-prem/data-sovereignty mandate, or CI build
> determinism. None should replace Cloudflare Pages for paced.nl.

Files in `docs/devops/`:
- `Dockerfile.example` — multi-stage: `node:20-alpine` runs `npm run build`, then
  `nginx:alpine` serves `dist/` on :8080 with a healthcheck.
- `nginx.conf.example` — replicates `_headers` (CSP/HSTS/COOP/CORP), SPA fallback,
  gzip, and caching. Does **not** immutable-cache `app.js`/`styles.css` because
  `build.mjs` is not content-hashing yet.
- `docker-compose.example.yml` — `docker compose ... up --build` →
  http://localhost:8080; verify with `curl -I localhost:8080`.
- `k8s/` (deployment, service, ingress, hpa) — bare regional origin, sensible
  only behind your **own** CDN for TLS/edge-cache/DDoS. nginx static serving is
  near-free, so `replicas: 2` is for availability, not load; the HPA rarely fires.

---

## 6. Monitoring & observability

**Today: zero telemetry.** Only `console.error` in `src/app.jsx` (global
error/rejection handlers log to console, not transmitted). No uptime check, no
edge-function alerting. The i18n copy explicitly advertises "no analytics" —
the design below is privacy-first and preserves that.

**6.1 Frontend error tracking** — bundle `@sentry/browser` (no runtime CDN, keeps
CSP `default-src 'self'`); GlitchTip is a drop-in EU-self-hostable alternative on
the same SDK. Inject `window.PACED_SENTRY_DSN` like the Supabase keys and set
`release` from `GITHUB_SHA` in `build.mjs`. `tracesSampleRate: 0`,
`sendDefaultPii: false`, and a `beforeSend` that **scrubs all `paced.*` values and
drops console breadcrumbs** so health data never leaves the device. Route the
existing `error`/`unhandledrejection` handlers and `ErrorBoundary.componentDidCatch`
through `Sentry.captureException`, keeping `console.error` as fallback. The one
required `_headers` change: add the ingest host to `connect-src`
(`https://*.ingest.de.sentry.io`).

**6.2 Web Vitals / RUM** — Cloudflare Web Analytics via the Pages "Automatic
Setup" toggle. Cookieless, no consent banner, no CSP edit (CF injects the beacon
same-origin at the edge). Avoid the manual `static.cloudflareinsights.com` snippet
— it would force a CSP change. Gives p75 LCP/INP/CLS, TTFB, page-load counts.

**6.3 Uptime / synthetic** — external monitor (UptimeRobot/Better Uptime), 60s,
on three keyword checks: `https://paced.nl/` (200 + `id="root"`),
`/.well-known/apple-app-site-association` (200 + `applinks`), and
`https://tyvideihbfjfmdzdkyks.supabase.co/auth/v1/health`. Plus a scheduled
GitHub Actions synthetic (`synthetic.yml`, every 15 min) that also OPTIONS-probes
`create-checkout-session` (cold-start + Stripe reachability), failing the run on
error.

**6.4 Supabase** — keep `console.error` in all three functions and add structured
`console.error(JSON.stringify({evt:"webhook_fail", type, err}))` so Logflare is
queryable; set a Logflare alert on `metadata.level = "error"` for `stripe-webhook`.
Enable Stripe Dashboard "email on failed delivery" and watch delivery-success %.
DB Reports for CPU/connections/disk with built-in alerts (>80% disk, connection
saturation). Add a Logflare saved search for `permission denied for table
partner_snapshots|subscriptions` — a spike means a client probing rows it
shouldn't.

**6.5 Business / SLO** — the `subscriptions` table (migration 0003) is the source
of truth for trial→paid. Track daily `active`/`canceled` counts (Logflare/Metabase
/pg_cron); **alert if new-active = 0 for 48h** (signals broken checkout). A silent
webhook failure = paid users not entitled — the highest-value alarm; capture it in
the `stripe-webhook` catch block too.

**6.6 Alert routing** — one Slack `#paced-alerts` webhook: Sentry (frontend +
webhook errors), uptime monitor, and Actions synthetic → Slack; Stripe + Supabase
disk → email. SEV1 = site down or webhook failing (page); SEV2 = error-rate/LCP
regression (next business day).

### SLO / SLI table

| SLO | SLI (measurement) | Source | Target | Alert |
|---|---|---|---|---|
| Availability | `/` returns 200 + `#root` | UptimeRobot 60s | 99.9% / 30d | 2 consecutive fails |
| Edge latency | TTFB p75 | CF Web Analytics | < 200 ms | p75 > 400 ms / 1h |
| Frontend perf | LCP p75 | CF Web Analytics | < 2.5 s | p75 > 2.5 s / 24h |
| Frontend perf | INP p75 | CF Web Analytics | < 200 ms | p75 > 200 ms / 24h |
| Error rate | Sentry events / sessions | Sentry | < 1% sessions | > 2% / 1h |
| Webhook success | delivered / sent | Stripe + Sentry | ≥ 99.5% / 7d | any fail (SEV1) |
| Conversion health | new `active` subs/day | subscriptions tbl | > 0 / 48h | 0 for 48h |

Files to touch when implementing: `src/app.jsx`, `index.html`, `build.mjs`,
`_headers`, new `.github/workflows/synthetic.yml`, the three
`supabase/functions/*/index.ts`.

---

## 7. Reliability, downtime-risk & scaling

### Failure modes & mitigations

- **Supabase outage** — core tracking is unaffected: logs/profile live in
  `localStorage`, the app never blocks on a network call to render.
  `getSupabase()` (`src/supabasePartner.js`) returns `null` when unconfigured;
  every partner/subscription call guards (`if (!sb) return null`) and wraps RPCs
  in `catch { return null }`, so those features degrade to no-ops, not crashes.
  Trial state is local (`paced.trial`), so an outage cannot hard-lock the paywall.
  **The one path to confirm:** the paywall must treat a null subscription fetch as
  "fall back to local trial state," not "deny access."
- **Stripe outage** — checkout is a full-page redirect; if Stripe is down the
  redirect fails and the user stays on-app with local features intact. Ensure the
  "Upgrade" handler surfaces a retry toast, not a dead spinner.
- **Cloudflare edge** — no origin to fail; multi-PoP anycast. Nothing to do.
- **Runtime CDN** — none. React/Tailwind/Babel are bundled, so no third-party CDN
  can take the app down. (esm.sh appears only in edge functions — server-side at
  deploy/cold-start, not the user's critical path.)

### Zero-downtime deploys & the SW footgun

CF Pages deploys are atomic and immutable per commit; rollback reactivates a prior
artifact instantly (§3). **`sw.js` `CACHE = 'paced-shell-v1'` is stale vs the
README's `v7` — bump it on every meaningful deploy** or returning users serve an
evicted shell. The SW is network-first for navigation and for `.js/.jsx/.css`,
which is correct: a bad SW cannot brick returning users because fresh app code is
fetched first. `STATIC_ASSETS` precache covers only shell + icons (not `app.js`/
`styles.css`), so app code relies on network-first runtime caching — fine. Keep
`skipWaiting()` + `clients.claim()`. Keep a **kill-switch SW** ready: a minimal
`sw.js` calling `self.registration.unregister()` and clearing `caches.keys()`.

### Data durability (biggest risk)

User health data lives in **one browser's localStorage with no backup** — cleared
cache or a lost device = permanent loss. Mitigations: (a) make the existing
JSON/CSV export the explicit backup story (prompt periodic export, especially
before clearing data); (b) later, opt-in encrypted cloud backup keyed to Supabase
auth. For server tables (`partner_links`, `partner_snapshots`, `subscriptions`),
enable **Supabase PITR** (Pro tier, 7-day) — `subscriptions` is the only billing
source-of-truth and must be recoverable.

### Scaling

Static edge scales effectively infinitely; ceilings are Supabase and Stripe
(Stripe has none).
- **Supabase Free** ~60 concurrent connections, 500K edge-fn invocations/mo, 500 MB
  DB, pauses after 7 days idle. **Move to Pro ($25/mo) before launch** — no
  auto-pause, daily backups, PITR add-on.
- Use the **Supavisor pooler (transaction mode, port 6543)** for pooled access;
  burst matters most for short-lived webhooks/edge functions.
- Upgrade tier at ~80% of the 500K/mo invocation or 60-connection ceiling.

### Rate-limiting / abuse

Supabase Auth enforces magic-link send limits (~30/hr/project on Free SMTP) — set
**custom SMTP before launch** so legitimate sign-ins aren't throttled; rely on
built-in per-IP auth limits for abuse. Invite-code entropy was hardened (migration
0002). Add a DB-backed per-user rate-limit on `create-checkout-session` only if
abuse appears; otherwise Stripe's controls suffice.

---

## 8. Production deployment checklist

### Pre-deploy
- [ ] `npm ci && npm test` green; `npm run build` succeeds locally.
- [ ] `npm run audit` (Lighthouse) within budget.
- [ ] `dist/index.html` has no external CDN/Babel/importmap refs.
- [ ] **Bump `sw.js` `paced-shell-vN`** if `src/` or shell assets changed.
- [ ] Migrations applied (`supabase db push`) for any new schema (0001/0002/0003).
- [ ] Edge-function secrets present in Supabase dashboard (`STRIPE_SECRET_KEY`,
      `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`).
- [ ] Supabase project on **Pro tier**, **EU (Frankfurt)** region, **PITR**
      enabled, **custom SMTP** configured.
- [ ] Stripe in **live mode**; webhook endpoint points at the prod function;
      "email on failed delivery" enabled.
- [ ] CF Pages custom domains `paced.nl` + `www.paced.nl` set; 301 redirect
      `www → apex`; `NODE_VERSION=20` build env present (prod + preview scopes).
- [ ] README size table updated (app.js **656 KB**, not 248 KB).

### Deploy
- [ ] Merge to `main` → CF Pages auto-builds and publishes `dist/`.
- [ ] If `supabase/functions/**` changed → `deploy-functions.yml` ran (or deploy
      manually); `stripe-webhook` kept `--no-verify-jwt`.
- [ ] Confirm the new CF Pages deployment is "Active".

### Post-deploy (smoke)
- [ ] `curl -sI https://paced.nl/` → 200; CSP/HSTS/`X-Frame-Options` headers present.
- [ ] `https://paced.nl/` renders, `id="root"` present, app boots (no console errors).
- [ ] `https://paced.nl/.well-known/apple-app-site-association` → 200 + `applinks`.
- [ ] Supabase auth health 200; magic-link sign-in works.
- [ ] Run one **Stripe test checkout** end-to-end → `subscriptions` row written by
      webhook; entitlement reflects within the app.
- [ ] With Supabase unreachable (or signed out), paywall falls back to **local
      trial state**, not "deny access".
- [ ] Uptime monitor + Actions synthetic green; Sentry receiving events (env
      `production`, release = SHA); CF Web Analytics recording.

### Incident response
- [ ] **Static site broken / bad deploy** → CF Pages → Deployments → "Rollback to
      this deployment" (instant; SEV1 if site down).
- [ ] **SW trapping clients** → deploy the **kill-switch `sw.js`**, then redeploy
      good build.
- [ ] **Edge function regression** → re-run `deploy-functions.yml` at the prior SHA.
- [ ] **Stripe webhook failing** (SEV1) → check Stripe delivery log + Logflare
      `stripe-webhook` errors; replay failed events from Stripe Dashboard after fix;
      verify affected `subscriptions` rows reconciled.
- [ ] **Supabase down** → confirm core tracking still works (localStorage);
      communicate partner/subscription features degraded; no app-side action needed.
- [ ] **Quota ceiling** (≥80% invocations/connections/disk) → upgrade Supabase tier.
- [ ] Post-incident: note cause + fix; if a correction pattern emerged, capture it
      in `tasks/lessons.md`.

---

## Reference files (this folder)

| File | Purpose |
|---|---|
| `production-runbook.md` | This document (canonical). |
| `ci.improved.yml` | Proposed CI gate (reference; do not overwrite live `ci.yml`). |
| `deploy-functions.yml` | Supabase edge-function deploy workflow (reference). |
| `Dockerfile.example` | Optional multi-stage container build. |
| `nginx.conf.example` | Optional nginx config mirroring `_headers`. |
| `docker-compose.example.yml` | Optional local prod-like preview. |
| `k8s/{deployment,service,ingress,hpa}.yaml` | Optional self-host manifests. |
