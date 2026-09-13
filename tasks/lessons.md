# Lessons

## Content Pipeline (2026-06-13)

- **Spec zegt `.ts`, repo is JS.** Niet blind de spec volgen: de repo is pure JS/ESM,
  Node 20 kan `.ts`-scripts niet zonder loader draaien, en de edge functions zijn al
  Deno-TS. Keuze met user bevestigd (match repo) → minder toolchain-risico. Les: bij
  taal/tooling-mismatch tussen opdracht en codebase eerst de codebase laten winnen en
  de keuze expliciet voorleggen.

- **Guardrails op de *vorm*, niet het *onderwerp*.** Eerste instinct was woorden als
  "calorie"/"gewicht" blokkeren — dat sloopt juist de ondersteunende copy
  ("je verbrandt nu meer calorieën — extra eten is oké"). Oplossing: match getal+eenheid,
  vergelijking, diagnose-werkwoord. Bewust false-negatives boven false-positives.

- **Runtime-invariant ook op source-niveau testen.** "Runtime roept nooit Opus aan" is
  niet alleen gedrag (assert `req.model === haiku`) maar ook een grep-test op
  `personalize.js` (geen `claude-opus` / `MODELS.generate`). Dubbel slot tegen regressie.

- **Seed-content = offline-fallback = testfixture.** Door de gegenereerde content te
  committen werkt de PWA offline én draaien tests zonder API-key/kosten. De gen-scripts
  overschrijven later. Eén artefact, drie doelen.

- **Subagent (Sonnet) voor bulk-copy, ik (Opus) voor logica.** Conform model-strategie:
  112 template-strings = copy → Sonnet; guardrail-/schema-/personalize-logica = Opus.
  Subagent-output daarna programmatisch door schema+guardrails getoetst (1 fout gevangen:
  niet-ASCII id `oké`).

- **`STORAGE_PREFIX` bevriezen.** `BRAND_NAME` is display-only; `paced.*` localStorage-keys
  zitten in bestaande user-data → hernoemen = data-verlies. Gescheiden gehouden in config.

- **`npx vitest run` globt `.claude/worktrees/`.** Andere sessies' worktrees worden
  meegepakt en kunnen rood zijn zonder dat het jouw code is. Filter op pad bij triage.
## Pre-launch QA (2026-07-03)

- **Lighthouse lokaal ≠ productie.** De audit-servers serveerden ongecomprimeerd
  terwijl Cloudflare altijd brotli/gzip levert — de perf-score mat een scenario
  dat live niet bestaat (64 vs 89). Les: maak de meet-harness representatief
  vóór je de app "traag" verklaart. Observed FCP (74ms) eerst checken had de
  richting meteen verraden.
- **Simulated vs observed metrics lezen.** Lantern-FCP 5.7s bij observed 74ms =
  het probleem zit in de dependency-graph (bundle-gewicht), niet in de echte
  render. De statische SEO-hero deed zijn werk al.
- **Feature-gewicht hoort bij de feature.** 175KB supabase-js in de hoofdbundle
  voor een feature achter een login → dynamic import + esbuild splitting. Denk
  bij elke dep: wie betaalt dit bij first paint?
- **Console-logbuffer accumuleert over de sessie.** Na een fix de conditie zelf
  verifiëren (localStorage-key checken), niet alleen de log lezen — anders lijkt
  een gefixte bug nog open.
- **Generieke test-clicks vervuilen je eigen bevindingen.** Twee blinde
  `button`-clicks raakten de "−" van cycluslengte → vals alarm "default 27".
  Gerichte selectors of per-stap snapshots voorkomen zelf-geïnduceerde bugs.
- **Privacy-review loont op de datalaag, niet de UI.** share_level werd alleen
  in de UI gehandhaafd; de partner had RLS-SELECT op de hele rij. Bij een
  privacy-first product is dataminimalisatie bij de bron de enige echte grens.
- **SW-shell-cache + statische pagina's bijten elkaar.** Een navigate-handler
  die élke navigatie als "de shell" cachet, vergiftigt de PWA zodra je statische
  artikel-URL's toevoegt. Cache-keys expliciet aan paden binden.

## Gebruikersfeedback ronde 1 (2026-09-13)

- **Inline `style` ontsnapt aan een class-based dark mode.** De hele
  donkere modus hangt aan `[data-theme="dark"] .bg-…`-overrides. "Tip van
  de dag" zette zijn achtergrond inline, dus die bleef crème terwijl
  `.text-ink-700` wit werd → onleesbaar. Regel: een achtergrond die met
  het thema mee moet, is een class. Nooit inline.
- **Placeholders die nergens gevuld worden, zie je alleen in de UI.**
  `{namePart}` (5 tip-teksten) en `{shown}` (temperatuurgrafiek) stonden
  letterlijk op het scherm: de copy verwachtte een andere sleutel dan de
  aanroep meegaf. Tests dekken dit niet. Scan na elke copy-wijziging de
  gerenderde `innerText` op `/\{[a-zA-Z]+\}/` — kost één regel JS.
- **Kleuren met dezelfde brand-familie zijn niet automatisch
  onderscheidbaar.** `PHASE_META.hue` is 2× terracotta + 2× sage: prima
  als accent naast elkaar, onleesbaar als 42 vlakjes in een raster. Een
  kalender vraagt hoek-afstand op de kleurencirkel, niet merk-eenheid.
- **Een vraag en zijn antwoordopties horen samen gereviewd te worden.**
  "Hoe voelde jouw beweging?" met Rust/Licht/Matig/Intensief eronder:
  beide kanten waren los prima, samen onzin. Idem "Zwangerschap" als
  kopje boven drie stellingen.
- **Opt-in is de default voor alles wat dagelijkse discipline vraagt.**
  Basaaltemperatuur en eisprong stonden aan voor iedereen; wie niet meet,
  ziet elke dag een lege kaart die zegt dat ze iets niet doen.
- **`scrollIntoView({behavior:'smooth'})` doet niets in een niet-renderend
  paneel.** Geen animatieframes = geen scroll. Bij verificatie in een
  verborgen browserpaneel: eerst `behavior:'auto'` proberen voordat je
  concludeert dat de feature stuk is.
- **Screenshots van een verborgen paneel zijn leeg, niet fout.** DOM-
  inspectie (`getComputedStyle`, `innerText`, `aria-label`) is dan het
  betrouwbare alternatief — en voor contrast zelfs beter dan kijken.
