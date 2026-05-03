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

## Deploy naar Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages**
2. **Connect to Git** → kies dit repo
3. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** *(leeglaten)*
   - **Node version:** 20 of hoger (zet `NODE_VERSION = 20` in
     environment variables als de default te oud is)
4. **Custom domain** toevoegen — Cloudflare regelt HTTPS automatisch
5. De `_headers` file in `dist/` zorgt voor de juiste security- en
   cache-headers (CSP, HSTS, Cache-Control). Niets extra te configureren.

### Anti-rollback van caches

`sw.js` cached `index.html` en zichzelf met `no-cache`, en gebruikt
network-first voor `/app.js` en `/styles.css`. Een nieuwe deploy
bereikt de gebruiker bij de eerstvolgende page-load — geen forced
hard-refresh nodig.

Bump het `CACHE`-versie-getal in `sw.js` (huidig: `aura-shell-v4`) bij
een release zodat oude SW-caches geëvinceerd worden.

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

## License

Code: zie `LICENSE` (toe te voegen). Lettertypes (Inter, Fraunces) staan
onder SIL Open Font License — zie `OFL.txt` in de respectievelijke
fontsource packages.

