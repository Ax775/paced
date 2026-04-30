# Aura

Persoonlijke gezondheids- en cyclus-tracker voor vrouwen, lokaal-eerst en
versleuteld. PWA gebouwd met Vite + React + Tailwind.

> Cyclus, voeding, beweging, slaap en welzijn — uitsluitend op je eigen
> apparaat, achter een wachtwoord dat alleen jij kent.

## Privacy & beveiliging

Alle gezondheidsdata wordt opgeslagen in `localStorage` van je browser,
versleuteld met **AES-GCM 256-bit** waarbij de sleutel wordt afgeleid uit
jouw passphrase via **PBKDF2-SHA256** (600.000 iteraties). De sleutel
verlaat het apparaat niet. Wij hebben technisch geen toegang tot je
gegevens en kunnen je passphrase niet herstellen.

Zie [`docs/legal/privacyverklaring.md`](docs/legal/privacyverklaring.md)
voor de volledige gegevensbeschermingsdocumentatie.

## Snelstart

```bash
npm install
npm run dev      # vite dev server op :5175
npm run build    # productie-bundle naar dist/
npm run preview  # serveert de productie-bundle op :4173
npm test         # vitest run — 67 unit tests
```

## Repository-structuur

```
docs/legal/         Juridische conceptdocumenten (markdown — bron-of-truth)
e2e/                Playwright + axe-core a11y-tests
public/             Statische assets (manifest, icons, fonts, sw.js, gerenderde legal/*.html)
scripts/            Build-helpers (legal-renderer)
src/
  app.jsx           Hoofd-app — onboarding, dashboard, tracker, settings
  main.jsx          Entry: ErrorBoundary > UnlockGate > App
  ErrorBoundary.jsx Globale crash-fallback
  UnlockGate.jsx    Setup / unlock / auto-lock / change-passphrase
  UpdateBanner.jsx  Service-worker update-prompt
  index.css         Tailwind + animations + reduced-motion
  fonts.css         Self-hosted Inter + Fraunces (geen Google Fonts CDN)
  lib/
    crypto.js       Web Crypto wrapper (AES-GCM, PBKDF2)
    secureStorage.js In-memory cache + persisted ciphertext
    storage.js      App-niveau persistentie (profile, daily logs)
    cycle.js        Pure cyclus-engine
    nutrition.js    Doelen-berekening
    insights.js     Dagelijkse tip
    schema.js       Versie-marker voor toekomstige migraties
  test/             Vitest setup
.github/workflows/  GitHub Actions CI — vitest + build + axe
```

## Deployen

Pak één van de starter-configs:

| Host | Bestand | Notitie |
|---|---|---|
| Cloudflare Pages | `public/_headers` | Build command `npm run build`, output `dist` |
| Netlify | `netlify.toml` | Auto-detect |
| Vercel | `vercel.json` | Auto-detect |
| Self-host (nginx) | `nginx.conf.example` | Adapteer naar je server-block |

Alle vier sturen dezelfde security-headers (HSTS, COOP, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy, X-Frame-Options) en immutable cache
voor `/assets/*`. **Vereist HTTPS** — de Web Crypto API werkt niet over
plain HTTP.

## Voor livegang nog te regelen

- [ ] `[INVUL: …]` placeholders invullen in `docs/legal/*.md`
- [ ] Juridische review van de privacyverklaring + medische disclaimer
- [ ] Verwerkersovereenkomst met de hostingpartij
- [ ] Echte device-tests (iPhone Safari, Android Chrome, screenreader)
- [ ] Trademark-check "Aura" (EUIPO + Benelux-Bureau)
- [ ] Eventueel: Sentry-DSN of vergelijkbare error-tracking activeren

## Licentie

Zie [LICENSE](./LICENSE).

## Bijdragen

Issues en PR's welkom. Hou bij wijzigingen in encryptie of dataschema
de migratie-pad up-to-date in `src/lib/schema.js` en bump de
`SCHEMA_VERSION` zodat bestaande installaties niet stilletjes corrupt
raken.
