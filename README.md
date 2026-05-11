# Aura

Persoonlijke gezondheids- en cyclus-tracker voor vrouwen — als PWA.
Cyclus-bewuste voeding, energie en welzijn, met een rustige UI die
volledig in **light** en **dark** mode werkt.

Alle data blijft op het apparaat van de gebruiker (`localStorage`). Geen
accounts, geen tracking, geen analytics, geen externe runtime
afhankelijkheden — productie verbindt met exact één host: die van Aura
zelf.

---

## Tech-stack

| Laag | Keuze |
|------|-------|
| UI | React 18 |
| Styling | Tailwind CSS 3 (Quiet Luxury palette + variabele fonts) |
| Icons | lucide-react |
| Bundler | esbuild |
| Tests | Vitest |
| Hosting | Cloudflare Pages (statische deploy uit `dist/`) |
| Service worker | handgeschreven, network-first voor app-code |

Geen Vite/Next/Webpack — `build.mjs` orkestreert esbuild + Tailwind CLI
in ~100 regels. De source-map voor JSX gaat door esbuild's transformer,
de utility-CSS via de Tailwind CLI tegen `tailwind.config.cjs`.

---

## Twee draaimodi

### 1. Dev — geen build nodig

Open `index.html` direct in een browser. Tailwind, React en de JSX
worden runtime via CDN's geladen (cdn.tailwindcss.com, esm.sh,
unpkg.com). Iedere edit aan `src/*` is na een refresh meteen zichtbaar.

```sh
# macOS, vanaf de repo root:
open index.html
```

Of een eenvoudige static server:

```sh
python3 -m http.server 8000
```

### 2. Productie — gebouwd, geen externe deps

```sh
npm install
npm run build
```

Dat produceert `dist/` met:

| Bestand | Grootte | Inhoud |
|---------|---------|--------|
| `app.js` | ~248 KB | React + ReactDOM + lucide-react + alle app-code, geminified |
| `styles.css` | ~22 KB | alleen de Tailwind utilities die in de bron gebruikt worden |
| `index.html` | ~11 KB | gestript van CDN-scripts |
| `assets/fonts/*.woff2` | ~166 KB | Inter + Fraunces, variabel, Latin subset |
| `manifest.webmanifest`, `sw.js`, `_headers` | — | statisch gekopieerd |

**Geen runtime CDN's meer** — Tailwind, React en Babel zitten allemaal
in `app.js` of `styles.css`.

---

## Tests

```sh
npm test          # eenmalige run
npm run test:watch # watch-mode tijdens dev
```

62 tests in `tests/cycle.test.js` en `tests/nutrition.test.js` die de
zuivere functies in `src/lib/` afdekken — fase-wiskunde, datum-helpers,
periode-log lifecycle, BMR/TDEE, fase-deltas, hydratie-floor.

---

## Lighthouse audit (lokaal)

```sh
npm run audit         # build + Lighthouse-audit op de productiebundel
npm run audit:quick   # zelfde audit zonder rebuild (na een eerdere build)
```

Het script `scripts/audit-lighthouse.mjs` start een tijdelijke static
server op `dist/`, draait Lighthouse 13 in headless Chrome (mobile
form-factor, 4× CPU + 1.5 Mbps throttle) en print een compacte
scores-tabel + alle audits onder 0.9. De volledige JSON-rapport-locatie
verschijnt aan het eind. Geen extra runtime dependency — `lighthouse`
draait via `npx`, Node's `http` doet de server.

Vereist: Google Chrome geïnstalleerd (Lighthouse autodetecteert).

---

## Pre-merge / pre-deploy preflight

```sh
npm run preflight             # tests + build + Lighthouse drempels
npm run preflight -- --no-audit  # snelle variant, alleen tests + build
```

Faalt op: een vitest-fout, build-fout, ontbrekend dist-artefact,
Lighthouse mobile-score onder de drempels (a11y ≥ 95, best-practices
≥ 95, seo ≥ 90, performance ≥ 70). Bedoeld om te draaien vóór een
PR-merge en vóór een productie-deploy zodat je niet met een halve
release in productie staat.

---

## Deploy naar Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages**
2. **Connect to Git** → kies dit repo, branch **`main`**
3. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** *(leeglaten)*
   - **Environment variables:**
     - `NODE_VERSION = 20` (of hoger; default kan te oud zijn)
     - *(optioneel)* `BUILD_SOURCEMAP = 1` als je remote-debug op staging wilt
4. **Custom domain** toevoegen → Cloudflare regelt HTTPS automatisch
5. De `_headers` file in `dist/` zorgt voor security- en cache-headers
   (CSP, HSTS, Strict-Transport-Security, Cache-Control). Niets extra
   te configureren.

### Eerste deploy — extra checks

| Check | Hoe |
|------|-----|
| HTTPS werkt | Open `https://<jouw-domain>/` — geen mixed-content warnings |
| CSP blokkeert geen eigen assets | DevTools → Console → geen "blocked by CSP" warnings |
| Service worker registreert | DevTools → Application → Service Workers → `aura-shell-v<N>` is "activated" |
| Manifest valideert | DevTools → Application → Manifest → "Installable" badge zichtbaar |
| iOS install werkt | Safari op iPhone → Share → "Zet op beginscherm" → open vanaf icoon → standalone-modus + geen blanke flits dankzij `apple-touch-startup-image` PNGs |

### Anti-rollback van caches

`sw.js` cached `index.html` en zichzelf met `no-cache`, en gebruikt
network-first voor `/app.js` en `/styles.css`. Een nieuwe deploy
bereikt de gebruiker bij de eerstvolgende page-load — geen forced
hard-refresh nodig.

**Bij elke release** bump het `CACHE`-versie-getal in `sw.js` (huidig:
`aura-shell-v7`). Anders krijgen returning users een mix van oude en
nieuwe chunks.

---

## Repository layout

```
.
├── index.html              # bron — werkt zonder build
├── src/
│   ├── app.jsx             # React app (~3 000 regels, single file)
│   └── lib/
│       ├── cycle.js        # cyclus-engine (pure functies)
│       ├── nutrition.js    # BMR/TDEE/macro-doelen
│       ├── insights.js     # tip-content per fase
│       └── storage.js      # localStorage wrappers
├── tests/                  # Vitest specs voor lib/
├── assets/
│   ├── icon.svg
│   └── fonts/              # self-hosted Inter + Fraunces (variable woff2)
├── tailwind.config.cjs     # palette + content paths
├── tailwind.css            # @tailwind directives
├── build.mjs               # productie-build (esbuild + Tailwind CLI)
├── sw.js                   # service worker
├── manifest.webmanifest
└── _headers                # Cloudflare Pages security + cache headers
```

---

## Privacy / juridisch

- **Geen data verlaat het apparaat** — alle profiel- en log-data leeft
  in `localStorage`. Verwijderen kan via Instellingen → Profiel
  resetten of door site-data te wissen in de browser.
- **Geen medisch hulpmiddel** — Aura is een hulpmiddel voor zelfreflectie
  en bewustwording, geen vervanging voor medisch advies.
- Volledige tekst is in-app te lezen onder Instellingen → "Privacy &
  disclaimer".

---

## Backup, herstel & migratie

Omdat alle data lokaal in `localStorage` staat, is het belangrijk dat
gebruikers af en toe een export maken — vooral vóór ze van browser /
toestel wisselen of de site-data wissen.

### Voor de gebruiker

| Actie | Hoe |
|------|-----|
| **Backup naar CSV** | Instellingen → Gegevens → "Exporteer CSV". Eén bestand met al je dagelijkse logs en profielvelden, te openen in Excel of Numbers. |
| **Backup naar Apple Health** | Instellingen → Gegevens → "Naar Apple Health" (XML-export). Importeren via de iOS Health-app. Alleen logs met daadwerkelijke metingen worden meegestuurd. |
| **Verhuizing naar nieuw apparaat** | Op het nieuwe apparaat eerst de app installeren, daarna handmatig de belangrijke datums (laatste menstruatie, cycluslengte) opnieuw invoeren. *CSV-import is bewust niet ondersteund — dat zou een sync-mechanisme worden, en dat past niet bij de "alles lokaal" belofte.* |
| **Volledig wissen** | Instellingen → Profiel resetten. Wist alles: profiel, logs, voorkeuren, kaart-volgorde, dismiss-flags. |

### Wat sluit dit af voor de launch

CSV en Apple Health-export werken al en zijn getest. **Wel zelf
verifiëren vóór live**:

- Genereer minstens één dag aan data (voeding, slaap, etc.).
- Klik beide exports en controleer of het bestand niet leeg is en
  niet duidelijk-foute waarden bevat.
- Voor Apple Health: importeer in de Health-app op een echt iOS-toestel
  en verifieer dat tenminste één bewegings- of voedings-record landt.

---

## License

Code: zie `LICENSE` (toe te voegen). Lettertypes (Inter, Fraunces) staan
onder SIL Open Font License — zie `OFL.txt` in de respectievelijke
fontsource packages.
