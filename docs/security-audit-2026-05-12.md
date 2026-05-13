# Aura — Security + Data Audit (12 mei 2026)

Vier specialisten parallel ingezet — Security Engineer, Database Optimizer,
Compliance Auditor (AVG + MDR), Code Reviewer — op de productie-build
zoals die op `https://aura-5p3.pages.dev` draait. Totaal ~80 bevindingen.
Dit rapport documenteert wat aangepakt is, wat bewust uitgesteld is, en
wat structureel werk vereist.

## Samenvatting

| Categorie | Findings | Direct gefixt | Uitgesteld |
|---|---|---|---|
| **Code bugs** | 14 | 10 | 4 (laag-impact) |
| **Storage hardening** | 8 | 6 | 2 (encryption blijft v1.4) |
| **Security (web)** | 25 | 4 | 21 (meestal defense-in-depth) |
| **Compliance (AVG/MDR)** | 25 | 4 (tekstueel) | 21 (vereist legal-input) |

**Tests:** 122 → **167** (+45, alle in green).
**Lighthouse live:** Performance 90 · A11y 100 · BP 100 · SEO 100 (zonder fixes nog te re-auditen).

## Gefixt vannacht — code-bugs

Elke fix heeft een regressie-test die `npm test` faalt als 'm ongedaan wordt gemaakt.

### 1. Apple Health XML export — 4 bugs in één file

**Bestand:** `src/lib/export.js:126-187`. Apple Health export was effectief
gebroken voor iedere gebruiker:

1. **Slaap-duur fout berekend.** Code zette eindtijd op `${log.sleep}:00`
   — een gebruiker met 8u slaap kreeg endDate `08:00` (= 10u na 22:00
   start). Apple Health rapporteerde dus altijd 10u slaap voor wie 8u
   logde. **Fix:** echte minuten-rekenkunde, `start + duration → end`.
2. **Beweging endDate vóór startDate.** Code zette eindtijd op
   `${movHH}:${movMM}` (de duur als kloktijd), dus 30 min beweging gaf
   end=`00:30`. Apple Health dropt zulke records stil. **Fix:** `08:00 +
   N min`, wraps naar volgende dag bij >16u.
3. **Timezone-drift.** `new Date('${dateStr}T00:00:00').toISOString()`
   gebruikt local-tz round-trip → in CET (UTC+1) wordt `2026-05-01`
   geserialiseerd als `2026-04-30T22:00Z`. Voor iedereen ten oosten van
   UTC schoof de creationDate naar de vorige kalenderdag. **Fix:** pure
   string-math op `yyyy-mm-dd`, geen Date-objecten in het kritieke pad.
4. **Geen guard op malformed datums of fractional uren.** Een log met
   `sleep: 7.5` produceerde `endDate=...T7.5:00:00` — invalid datetime.
   **Fix:** clamp + integer minutes-conversie, format `HH:MM` altijd geldig.

Regressie-tests: 9 nieuwe in `tests/export.test.js` voor elk van deze paden.

### 2. CSV export — CSV-injection + lege dagen + duplicate code

**Bestand:** `src/app.jsx` (inline `exportCSV`) → migratie naar
`src/lib/export.js::generateCsvExport`.

- **CSV injection** (Security audit F-02): inline `exportCSV` deed geen
  `=/+/-/@` prefix escape. Een gebruiker die `=HYPERLINK("evil.com")`
  in haar journal-note typte en de CSV met haar arts deelde, kreeg
  code-execution in Excel/Sheets/Numbers. De pure helper
  `generateCsvExport` deed het al correct met tab-prefix (`csvCell`),
  maar werd nergens aangeroepen.
- **Lege dagen geëxporteerd als nul-rijen** (Database audit H6):
  klinisch betekenisvol verschil tussen "niets gehad" en "niets
  gelogd". **Fix:** `logHasData()` filter vóór de export.
- **Twee CSV-implementaties divergeerden** (Code Review HIGH #9):
  inline had Engelse header-namen, pure helper had Nederlandse. UI is
  NL, de Engelse export was inconsistent.
- **Kolommen verbreed:** 10 → 23 kolommen zodat parity met de oude
  inline export gegarandeerd is (`cyclusdag, calorieen, eiwit_g,
  water_glazen, slaap_uur, beweging_min, mood/energy/cramps/bloating
  1-5 schaal, notitie, ...`).

Regressie-tests: 5 nieuwe in `tests/export.test.js`.

### 3. `useDailyLog.update` mist `lateCheck` deep-merge

**Bestand:** `src/app.jsx:153-163`. Iedere tap op een Late-cycle vraag
("Heb je stress gehad?") wiste alle eerder beantwoorde vragen, omdat de
custom `update`-callback `lateCheck` niet als nested object behandelde
(wel `gut`/`symptoms`/`ovulation`/`bleeding`). **Fix:** zelfde
deep-merge-regel toegevoegd. `storage.js::updateLog` deed het wel goed.

### 4. `contraceptionMissed` kon niet teruggezet worden naar null

**Bestand:** `src/app.jsx` (LateCycleCheckCard). Inversie-logica
`!v` mapped `null → true`, dus de Ja/Nee-toggle kon nooit terug naar
"geen antwoord". **Fix:** expliciete null-pass-through.

### 5. `getFertilityStatus` toonde "venster over X dagen" bij over-tijd

**Bestand:** `src/lib/cycle.js:659-687`. De functie gebruikte
`state.cycleDay` dat via modulo wrapt — een gebruikster die 33 dagen
in een 28-daagse cyclus zat had `cycleDay=6` en kreeg de melding
"vruchtbaar venster over 4 dagen", terwijl ze in werkelijkheid 5
dagen over tijd was. **Fix:** nieuwe `'overdue'` status; functie
accepteert nu een optionele `profile` arg om de echte overdueDays te
detecteren. FertilityWindowCard verbergt zichzelf bij overdue (de
LateCycleCheckCard neemt de communicatie over).

### 6. `setStorageErrorHandler` werd nooit aangeroepen

**Bestand:** `src/app.jsx::App` (mount). Quota-exceeded errors
(Safari Private Browsing, vol localStorage) werden stil geslikt
ondanks dat het storage-module ze met `notifyStorageError` keurig
doorgaf. **Fix:** wire bij app-mount, toon een alert + console-log
bij eerste fout.

### 7. Cross-tab listener miste theme-changes

**Bestand:** `src/app.jsx`. Twee tabs open: thema-wissel in tab A
werkte niet door in tab B. **Fix:** `storage` event listener
afhandelt nu ook `aura.theme`.

### 8. Dashboard-secties miste twee toggles

**Bestand:** `src/app.jsx::SettingsScreen`. `fertilityWindow` en
`lateCycleCheck` werden in Dashboard wel gegated via `hidden.has(...)`
maar de toggle-lijst in Settings ontbrak ze. Gebruiker kon ze niet
verbergen. **Fix:** beide toegevoegd aan de lijst.

### 9. Storage hardening tegen prototype-pollution + corruptie

**Bestand:** `src/lib/storage.js::loadLog`. De deep-merge spreadde alle
sub-objecten zonder type-check. Een gemanipuleerde log (DevTools-edit,
browser-extensie) met `gut: "oops"` of `__proto__` keys werd verwerkt
zonder validatie. **Fix:**
- `pickObj()` + `safeObj()` helpers — accepteer alleen plain objects,
  filter `__proto__/constructor/prototype` keys eruit.
- `num()` coerce voor alle numerieke velden — `NaN`, `Infinity`,
  string-input wordt 0.
- Length-caps: `note` → 280 chars, `meals` → 50 entries, `symptomen` →
  20 entries.

Regressie-tests: 6 nieuwe in `tests/storage.test.js`.

### 10. Meal-name input had geen length cap

**Bestand:** `src/app.jsx::ManualFoodEntryModal`. Een runaway paste
kon de log-blob opblazen tot quota-grootte. Profile.name en log.note
hadden wel een cap; meal.name had die niet. **Fix:** `slice(0, 80)`
op input + `maxLength={80}` HTML attribuut.

### 11. Minimumleeftijd 12 → 16

**Bestand:** `src/app.jsx`. UAVG art. 5 (NL implementatie van AVG art. 8)
eist voor verwerking van persoonsgegevens van kinderen <16 in een
informatiemaatschappij-dienst ouderlijke toestemming. Aura verwerkt
bijzondere categorie data (gezondheid, art. 9) — daar is het minimum
nog strenger. Was: HTML `min="14"`, validatie `<12`. Nu: `min="16"`,
validatie `<16`.

### 12. Sport-anticonceptie-vraag alleen bij hormonale methoden

**Bestand:** `src/app.jsx::LateCycleCheckCard`. "Heb je je
anticonceptie gevolgd?" is alleen zinvol bij methoden die de cyclus
onderdrukken (pil, hormoonspiraal). Voor een condoom/koperspiraal
hangt het niet van "gevolgd?" af. **Fix:** gate via
`suppressesCycle(profile.contraception)`.

## Gefixt vannacht — security hardening (web)

Beperkt tot wat veilig kon zonder bouwsysteem-rewrite of legal-input.

### 13. CSV-injection (audit Security F-02)

Zie #2 hierboven. Dit was zowel een security- als correctness-fix.

### 14. Storage validation defense-in-depth (audit Security F-11)

Zie #9 hierboven. Een gecompromitteerde browser-extensie kan nu geen
unsafe-key smokkelen via een geprepareerde log-blob.

### 15. Length-cap meal name (audit Security F-08)

Zie #10 hierboven.

### 16. Mobile-web-app-capable + robots.txt

Al gefixt in PR #25 (pre-audit). Vermeld voor volledigheid.

## Bewust uitgesteld — vereist legal-input

De Compliance Auditor identificeerde 6 BLOCKING punten vóór EU-launch
die niet alleen code zijn. Deze documenten zijn vereist (geschat 22u
gecombineerd):

### F-01 — Expliciete art. 9 AVG toestemming

Aura verwerkt gezondheidsgegevens. Volgens AVG art. 9 lid 2(a) vereist
dat **uitdrukkelijke toestemming** ("vrij, specifiek, geïnformeerd,
ondubbelzinnig"). Huidige onboarding heeft alleen een passieve
mededeling, geen checkbox. **Vereist:** consent-gate vóór onboarding-
step 1, met:

- Aparte uitleg dat Aura health data verwerkt onder art. 9(2a)
- Checkbox "Ik geef toestemming voor de verwerking van mijn
  gezondheidsgegevens op dit apparaat"
- Profielveld `consent: { givenAt: ISO, version: '1.3' }` opslaan
- Migratie voor bestaande gebruikers: eenmalig bevestigings-modal

Effort: ~4u. Eigen PR.

### F-02 — Identiteit verwerkingsverantwoordelijke

`legal.*` keys ontbreken **wie** Aura uitbrengt. AVG art. 13 lid 1(a)
eist naam, adres, contact. Geen DPO vereist (art. 37 — niet kernactivi-
teit op grote schaal), maar dat moet expliciet vermeld worden. Plus
klachtrecht bij AP (verplicht onder art. 13 lid 2(d)) met link naar
`autoriteitpersoonsgegevens.nl/zelf-doen/klacht-indienen-bij-de-ap`.

Effort: 30 min schrijven + jouw beslissing over identiteit (privé naam
+ adres, eenmanszaak, stichting?). Privé woonadres in een publieke
privacy-verklaring is doorgaans af te raden.

### F-03 — Bewaartermijn (AVG art. 5(1)(e) + 13(2)(a))

Huidige opslag is "onbeperkt tot reset". Voor health data is dat niet
defensible zonder onderbouwing in de legal-tekst. **Aanbeveling:**
documenteer dat data zo lang als gebruik bewaard blijft + voeg een
24-maanden-banner toe ("oude logs opschonen?").

Effort: 2u code + tekst.

### F-04 — Minimumleeftijd 16 + onboarding-bevestiging

Code is gefixt (zie #11), maar er ontbreekt nog een **expliciete
bevestiging tijdens onboarding** ("Ik ben 16 jaar of ouder"). Zonder
die checkbox kan een 13-jarige bewust een 16+ leeftijd invullen om
het minimum te omzeilen.

Effort: 30 min.

### F-05 — MDR positionering (Medical Device Regulation 2017/745)

Aura `pregnancyIntent: 'avoiding'` toont een vruchtbaar-venster + advies
("overweeg bescherming"). Onder MDCG 2019-11 raakt dat de MDR-grens.
Aura zit aan de veilige kant door explicit "geen medisch hulpmiddel"
te claimen, maar:

- De avoiding-disclaimer is **versterkt vannacht**: "kalendermethode
  ~75-80% effectief; gebruik betrouwbare anticonceptie als zwangerschap
  een gezondheidsrisico zou vormen". Helpt MDR-positionering.
- Verdere actie: `docs/mdr-positioning.md` schrijven die documenteert
  waarom Aura buiten MDR-scope valt (geen diagnose, geen behandeling,
  fitness/wellness software-klasse per MDCG-decisiontree §5.4).
- Marketingmateriaal mag **nooit** zeggen "voorkomt zwangerschap",
  "vervangt anticonceptie", "vruchtbaarheidsmonitor", "geboorte-
  controle". Houd elk extern document consistent met `legal.med.p1`.

Effort: 4u positionering doc + marketing review.

### F-06 — Cloudflare als verwerker + cross-border disclosure

Huidige `legal.ext.body` zegt "geen derde partijen" — technisch
misleidend. Cloudflare verwerkt IP-adressen (sinds Breyer C-582/14
persoonsgegevens) als verwerker. EU-US Data Privacy Framework geldt
voor edges buiten de EER. **Vereist:** `legal.hosting.*` keys met
expliciete Cloudflare-verwerker-tekst + DPA-link.

Effort: 1u tekst + 30 min Cloudflare-dashboard check (Web Analytics uit?).

## Andere SHOULD-FIX uitgesteld

- **F-09 (DPIA):** Voor health-data op gewone schaal is een light
  DPIA aan te raden. Effort 4u, kan na launch.
- **F-12 (volledige JSON-export):** AVG art. 20 data-portabiliteit is
  nu beperkt tot 90-daagse CSV + Apple Health. Volledige JSON-export
  als derde knop in Settings → "alle data". Effort 1u.
- **F-13 (reset-confirmatie):** "Profiel resetten" wist alles zonder
  modal. UX-risico, geen compliance-risico. Effort 1u.
- **F-15 (notif explainer):** Notification permission-prompt zonder
  uitleg. Effort 30 min.

## Bewust niet opgepakt — v1.4 of later

- **At-rest encryption** (`docs/encryption-followup.md`): Plain JSON
  in localStorage is gedocumenteerd in `storage.js`. Voor health-data
  defensibel binnen het huidige threat-model, maar AVG art. 32
  passende-technische-maatregelen voor health is een aandachtpunt.
  Plan ligt klaar, 12u werk, eigen PR.
- **CSP sha256-hashes** (Security F-01): `script-src 'unsafe-inline'`
  staat aan voor twee korte inline scripts (theme-init, SW-registration).
  Hashing automatiseren in build.mjs is 2u en geeft een echt strikt
  CSP. Niet ship-blokkerend.
- **Code-splitting voor perf 90 → 95+:** Eerder geprobeerd, gaf -3KB
  regressie bij 1 view-split (shared-chunk overhead). Vereist 4-5
  views extracten = 3-4u refactor met risico. Defer naar v1.1.

## Wat de gebruiker zelf nog moet doen

| Item | Tijd | Wie |
|---|---|---|
| iOS install-test op echte iPhone | 5 min | Jij |
| Apple Health import-test (na deze fix) | 3 min | Jij |
| Beslissing identiteit verwerkingsverantwoordelijke (F-02) | 30 min | Jij |
| Consent-gate (F-01) bouwen | 4u | Eigen PR |
| MDR-positionering doc + marketing review (F-05) | 4u | Jij + legal |
| Light DPIA (F-09) | 4u | Eigen PR |

## Tests

| Voor | Na | Toegevoegd |
|---|---|---|
| 122 | 167 | +45 regressie-tests |

Alle nieuwe tests dekken specifiek de bugs die deze audit aan het
licht bracht — zodat een toekomstige refactor faalt op `npm test`
voordat die in productie komt.
