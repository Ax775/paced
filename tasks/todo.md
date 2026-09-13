# Pre-launch QA — volledige app-doorlichting

> Doel: geen licht tussen de kieren vóór livegang. Functioneel, UI/UX, code,
> privacy, performance, SEO-laag. Elke bevinding → fixen → herverifiëren.

## Fase 1 — Statisch (tests, build, tooling)
- [ ] `vitest` volledige suite (excl. `.claude/worktrees` ruis) — alles groen?
- [ ] `node build.mjs` — schoon? CSP-hashes? artikel-laag?
- [ ] `scripts/preflight.mjs` draaien (bestaande launch-check)
- [ ] Lighthouse-audit (`scripts/audit-lighthouse.mjs`) indien haalbaar

## Fase 2 — Runtime (gebouwde app in echte browser, dist op :4173)
- [ ] Onboarding: naam → vervolgstappen → dashboard (happy path)
- [ ] Onboarding: rare invoer (lege naam, extreem lange naam, XSS-string)
- [ ] Dashboard: alle kaarten renderen; dagelijks inzicht uit content-pipeline
- [ ] Loggen: period start, stemming, water, journal-note → persist na reload
- [ ] Journal: 280-char limiet, speciale tekens
- [ ] Kalender/history views
- [ ] Instellingen: locale-switch NL↔EN, dark mode, data-export (CSV/JSON), wipe
- [ ] Premium/trial-gating zichtbaar correct
- [ ] Mobiel viewport (375px): layout, touch targets, safe-area
- [ ] Dark mode visueel
- [ ] SW/offline: laadt de app zonder netwerk na eerste bezoek?
- [ ] Artikel-pagina's: rendering, links, hub; 404-gedrag
- [ ] Console: nul errors op alle geteste flows

## Fase 3 — Code-review (subagents, parallel)
- [ ] Security/privacy-review van code die deze sessie is toegevoegd
      (content-pipeline, personalize, SEO/SSG, app.jsx-wiring)
- [ ] Correctness-review cycle/insights-integratie + storage-randgevallen
- [ ] Verifieer elke bevinding vóór fixen (geen false positives shippen)

## Fase 4 — Fixes + herverificatie
- [ ] Alle CONFIRMED bevindingen fixen (root cause, minimale impact)
- [ ] Regressie: tests + build + preview-hercheck
- [ ] Rapport in dit bestand; lessen → lessons.md

## Niet-doelen
- Nieuwe features. Journal-AI (staat bewust uit). Content-redactie (YMYL-feitencheck is menselijk werk).

## Rapport (afgerond)
**Eindstand: alle gates groen.** Tests 266/266 · build schoon · preflight: perf 89,
a11y 100, BP 100, SEO 100 · runtime-walkthrough zonder console-errors.

### Gevonden & gefixt (18 bevindingen; 2 vals alarm)
Infra/tooling:
- vitest globde `.claude/worktrees` mee → `vitest.config.js` (fixt `npm test` + preflight-gate).
- Lighthouse perf 64: (a) **679KB monolitische bundle** → supabase-js lazy chunk
  (dynamic import + esbuild splitting; app.js −28% → 476KB); (b) audit-servers
  serveerden ongecomprimeerd (productie = altijd brotli) → gzip in beide
  audit-servers. Waargenomen FCP was al 74ms (statische hero); score nu 89.
- SW: chunk- en sentry.js-matcher toegevoegd (anders stale cache-first).

Runtime:
- "Schema versie mismatch" 24× console-spam → alleen warnen bij bestaand
  profiel, max 1× per sessie (storage.js).

Correctness (review-agent, alle geverifieerd):
- cycleDay niet doorgegeven aan insight → 2/18 templates dood (app.jsx).
- getTips-fallback zonder guard → latente white-screen bij onbekende fase.
- Inzicht rolde niet over om middernacht (PWA open) → dag-tick + deps.
- Corrupt profiel (non-string name) kon Dashboard crashen → typeof-guard.
- personalizeFreeText deed AI-call zonder template-kader → early return.

Security/privacy (review-agent, alle geverifieerd):
- **P1 privacy**: pushSnapshot uploadde cycle_day+note óók bij share_level
  'phase' (partner kon via REST alles lezen) → dataminimalisatie aan de bron.
- P1: JSON-LD `</script>`-breakout in artikel-SSG → `<`-escape.
- P1: SW shell-poisoning: artikelbezoek overschreef de PWA-shell-cache →
  alleen root-navigaties verversen de shell.
- Edge function (personalize): CORS gelockt op paced.nl, body-cap 4KB,
  category-allowlist + expliciete DEPLOY-GATE-comment (rate-limit vereist).
- signOut reset `_loading` niet → oude client bleef uitgedeeld.
- Auth-listener-leak bij unmount vóór lazy-chunk resolve → cancelled-vlag.
- Slug-validatie + script/iframe-weigering in artikel-SSG.
- Entropie-comment invite-codes gecorrigeerd (48 bits, niet ~62).
- Geverifieerd OK: CSP-hashing vs chunks, checkout-clamp (0–60), XSS via
  naam-invoer (React escapet), guardrails-runtime.

Runtime-walkthrough afgevinkt: onboarding (happy + XSS-input), AVG-consent-gate,
dashboard + pipeline-inzicht, journal 280-limiet + emoji + persistentie na
reload, alle 5 tabs, settings (locale NL↔EN, dark/light, 3 exports, reset),
mobiel 375px (geen overflow), SW-registratie + cache, artikelen NL/EN + 404 +
sitemap. Vals alarm: "default 27" (eigen testklik op −) en de 24 warnings ná
de fix (historische log-buffer).

Bewust gelaten (geen launch-blocker): GEWICHT KG-label-wrap op mobiel
(kosmetisch); server-side rate-limit personalize-proxy (pas nodig bij deploy,
staat in DEPLOY-GATE + taak-chip); brute-force-throttling invite-RPC (serverwerk).

## App Store-link door de funnel (2026-09-13)
App is live: https://apps.apple.com/app/id6804403415 (locale-neutraal, Apple
routeert naar de juiste store). Doel: site, artikelen en launch-copy verwijzen
ernaar zodat de funnel sluit.

- [x] `src/config/brand.js`: APP_STORE_URL als single source of truth
- [x] `index.html`: statische hero — secundaire CTA naast "Begin gratis"
- [x] `scripts/build-articles.mjs`: artikel-CTA (32 artikelen) + supportpagina
- [x] `docs/launch-copy.md`: PH / Reddit EN+NL / social / pitch-mail — alle
      "iOS-app komt eraan"-verwijzingen vervangen door de live link
- [x] Verificatie: build groen, 266 tests, link in hero/support/NL+EN-artikel,
      geen overflow op 375px, CTA visueel gecheckt

Niet-doelen: geen download-banner in de PWA zelf (opdringerig, en de PWA is
juist het punt). Geen smart-app-banner meta — die kaapt de webervaring.
