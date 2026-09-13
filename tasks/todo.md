# Gebruikersfeedback ronde 1 (2026-09-13)

> 19 punten uit echte gebruikersfeedback. Doel: alles oppakken, geen
> half werk. Minimale impact per punt, geen nieuwe features erbij
> verzinnen.

## A — Copy (i18n, laag risico)
- [x] 1. `tracker.sleep`: "Slaap gisteravond" → "Slaap vannacht"
- [x] 2. `dash.greeting` + `onb.intro.title`: "Hoi" → "Hi"
- [x] 3. `sport.feltHow`: "Hoe voelde jouw beweging?" past niet bij de
      antwoorden (Rust/Licht/Matig/Intensief) → "Hoe intensief was je
      beweging?" (EN mee)
- [x] 4. Anticonceptie: "Liever niet zeggen" → "Zeg ik liever niet"

## B — Defaults
- [x] 5. Temperatuur-kaart standaard uit (nieuwe profielen)
- [x] 6. Eisprong-kaart standaard uit (nieuwe profielen)
      → `DEFAULT_HIDDEN_CARDS` in de onboarding; bestaande profielen
      niet retroactief aanraken
- [x] 7. Thema standaard "licht" i.p.v. "automatisch"

## C — Leesbaarheid / kleur
- [x] 8. "Tip van de dag": inline lichte gradient + `text-ink-700` →
      in donkere modus wit-op-crème = onleesbaar. Root cause: inline
      background ontsnapt aan de `[data-theme="dark"]`-overrides.
- [x] 9. Scan op dezelfde val elders (inline hex-achtergrond + themed
      tekstklasse)

## D — Kalender
- [x] 10. Groen lijkt te veel op elkaar (fertile #6dbf82 vs ovulation
      #3d9e57) → 4 duidelijk verschillende tinten
- [x] 11. Mist fases: kalender kleurt nu op period/vruchtbaar/ovulatie,
      terwijl het model 4 fases kent → kleuren per cyclusfase
      (menstruatie · folliculair · ovulatie · luteaal) via
      `phaseForCycleDay`, vruchtbaar venster als overlay-stip.
      Legenda mee. Bewerken van menstruatie-start blijft werken.

## E — Invoer
- [x] 12. Calorieën specifieker: fijnere stappen (+50) en het exacte
      getalveld zichtbaar bewerkbaar maken (het ís al een input, maar
      het ziet eruit als tekst)
- [x] 13. Beweging kan meer dan 90 min: 120 toevoegen + "+15"-chip om
      door te tellen

## F — Uitleg / waarde
- [x] 14. Darmgezondheid: waarom-regel + zichtbare beloning bij 3/3
- [x] 15. Recepten per fase: kop zegt niet wát er wordt aangeraden →
      intro met de voedingsfocus van die fase
- [x] 16. Dashboard: bij de tracker-kaarten tonen dat je ze via
      Instellingen kunt uitzetten

## G — Profiel
- [x] 17. "Zwangerschap" → vraag "Probeer je zwanger te worden?" met
      Ja / Nee (mapt op bestaande `trying` / `avoiding`)

## H — Logboek
- [x] 18. Symptoom-pillen tonen "E2 M4" → emoji + label + waarde
- [x] 19. Agenda in logboek: maandraster met data-markering waarmee je
      naar een dag springt (nu alleen een lange lijst)

## Verificatie
- [x] `npm test` groen
- [x] `node build.mjs` schoon
- [x] Runtime-check in de browser: dashboard, kalender, logboek,
      instellingen, licht + donker, 375px

## Niet-doelen
- Geen nieuwe features buiten de feedback. Geen herschrijving van de
  cyclus-engine. Geen datamodel-migratie voor bestaande gebruikers.

## Rapport (afgerond)

**Alle 19 punten doorgevoerd.** Tests 266/266 · build schoon · geen
console-errors · geen horizontale overflow op 375px in alle vijf tabs ·
tip-kaart contrast geverifieerd in licht (13:1) én donker (11:1).

### Buiten de feedback om gevonden en gefixt
- **`{namePart}` stond letterlijk in "Tip van de dag"** — vijf tip-teksten
  verwachten die sleutel, de code gaf alleen `{name}` mee.
- **`{shown} van 14 dagen`** onder de temperatuurgrafiek — `temp.range`
  verwacht `{shown}`, de aanroep gaf `{valid}`.
- **"Nog niets gelogd vandaag."** stond onder élke lege dag uit het
  verleden; de `.past`-variant bestond al maar werd nergens gebruikt.

### Geverifieerd gedrag
- Nieuw profiel krijgt `hiddenCards: ['temperature','ovulation']`;
  bestaande profielen blijven ongemoeid.
- Systeem op donker + geen opgeslagen voorkeur ⇒ app blijft licht.
  'Automatisch' blijft beschikbaar en volgt dan wél het systeem.
- Kalender toont vier fasekleuren (roze/groen/amber/pruim) met
  vruchtbaar-venster-stip; "Markeer start" werkt onveranderd.
- Logboek-agenda: 6 dagen met data aanklikbaar, springt naar de kaart met
  korte ring-markering; respecteert `prefers-reduced-motion`.

### Openstaande keuze voor de gebruiker
Amber en pruim zijn nieuw in het palet (de merkkleuren zijn 2× terracotta
+ 2× sage en die waren juist het probleem). Zachtere tinten kunnen, maar
gaan ten koste van onderscheidbaarheid.
