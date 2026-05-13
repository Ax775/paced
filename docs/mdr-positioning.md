# Aura — MDR-positionering (Medical Device Regulation 2017/745)

**Stand:** 12 mei 2026 · v1.4 · branch `compliance/avg-consent-and-docs`

Dit document onderbouwt waarom Aura **buiten de scope** van de EU Medical
Device Regulation (Verordening (EU) 2017/745, "MDR") valt. Het is
opgesteld voor (a) interne consistentie tussen product, copy en
support, (b) de Compliance Auditor-aanbeveling uit `security-audit-
2026-05-12.md` (finding F-05), en (c) een mogelijke vraag van een
nationale toezichthouder (IGJ / AP).

## Korte conclusie

Aura is **lifestyle/wellness-software** zoals bedoeld in MDCG 2019-11
("Guidance on Qualification and Classification of Software in MDR
2017/745 and IVDR 2017/746"), §5.4. Het stelt geen diagnose, beïnvloedt
geen behandeling, en monitort geen fysiologische processen voor een
medisch doel. Daarmee is het **geen** medisch hulpmiddel in de zin van
MDR art. 2(1).

## MDR-decisiontree (MDCG 2019-11 §3.4)

Per stap een ja/nee + onderbouwing:

1. **Is Aura software?** Ja — Progressive Web App, JavaScript/React.
2. **Is het MDSW (Medical Device Software)?**
   - Verwerkt het data voor een individuele patiënt? Ja, cyclus + welzijn.
   - Heeft het een **medisch doel** (art. 2(1) MDR)? **Nee**:
     - Geen diagnose (geen ziekte/aandoening-identificatie)
     - Geen monitoring (geen alarmering bij fysiologische afwijkingen,
       geen interpretatie voor klinische beslissing)
     - Geen behandeling / preventie van ziekte
     - Geen voorspelling of prognose van ziekte
   - Dus: **geen MDSW**.
3. **Resterende categorie:** lifestyle/wellness-software per §5.4 — buiten MDR.

## Belangrijke design-keuzes die de positie onderhouden

| Beslissing | Waar | Waarom dit MDR-veilig is |
|---|---|---|
| Geen diagnostische tekst | overal | "Je zit in vruchtbaar venster" is statistiek, geen diagnose |
| Geen behandel-advies | `legal.med.p1` | Expliciet "vervangt geen consult bij arts" |
| Geen monitoring-alarmen | engine | Geen pushen bij "afwijkende waarden"; user-driven inzicht |
| Disclaimer in `pregnancyIntent='avoiding'` branch | `app.jsx::FertilityWindowCard` | "Kalendermethode ~75–80% effectief; gebruik betrouwbare anticonceptie als zwangerschap een gezondheidsrisico zou vormen" — geen actief anticonceptie-advies |
| Geen claim "vervangt anticonceptie" | overal | Marketing + UI moeten dit nooit suggereren |
| Calorieën/eiwit als referentie, niet voorschrift | `nutrition.js` | "Schatting op basis van algemene formules" in `legal.med.p2` |

## Rode lijnen — wat Aura **nooit** mag doen zonder eerst MDR-traject

- Claim zelf zwangerschap te kunnen voorkomen of detecteren ("Aura is
  betrouwbaarder dan een condoom")
- Diagnose voorstellen ("Je hebt mogelijk PCOS")
- Behandel-advies geven ("Stop met de pil als je dit symptoom hebt")
- Alarm-functies voor klinische thresholds ("Je BBT-stijging duidt op
  zwangerschap — neem direct contact op met de huisarts")
- Integratie met biometrische sensoren voor real-time meting van
  vitale functies (hartslag, oxymetrie, bloeddruk) — dat zou Aura
  potentieel MDSW maken
- Premie-/verzekerings-koppelingen ("deel je data met je
  zorgverzekeraar voor korting")

## Wat zou Aura over de MDR-grens duwen?

Drie scenario's om bewust te vermijden:

### Scenario A — Anticonceptie-claim
Als marketing of UI gaat zeggen "betrouwbaar alternatief voor
anticonceptie" of "natuurlijke geboortebeperking", verschuift Aura
naar **Class IIb medisch hulpmiddel** (zoals Natural Cycles in 2017–
2018 moest doorlopen). Vereist CE-mark, klinische evaluatie,
notified-body audit, post-market surveillance.

**Mitigatie:** taal-discipline in alle externe kanalen. App-store
listing, website, social media — nooit deze terminologie.

### Scenario B — Aandoening-detectie
"Aura herkent mogelijke PCOS-symptomen" of "detecteert hormonale
disbalans" maakt het diagnostische MDSW (mogelijk **Class IIa**).

**Mitigatie:** pattern-inzichten blijven beschrijvend en non-
diagnostisch ("je cycli zijn 6 dagen langer geworden in 3 maanden")
zonder etiket ("dit kan op X duiden").

### Scenario C — Behandelings-interventie
Als Aura medicijn-doseringen, supplement-aanbevelingen op klinische
basis, of behandel-protocollen gaat aanbieden, schuift het naar MDSW
**Class IIa+** met bijbehorende eisen.

**Mitigatie:** voedings-/welzijns-tips blijven generiek (zoals nu in
`insights.js`), nooit op individuele klinische input.

## Externe-communicatie checklist (marketing/PR/store)

Voor elke externe tekst over Aura — controleer:

- [ ] Wordt het woord "medisch", "klinisch", "diagnose", "behandeling",
      "voorkomen van zwangerschap", "anticonceptie" gebruikt? Zo ja:
      herformuleren.
- [ ] Bevat het beloftes over uitkomsten ("voor X% effectief",
      "betrouwbaarder dan Y")? Zo ja: schrappen of vervangen door
      kalendermethode-statistiek (~75-80%) met disclaimer.
- [ ] Wordt Aura gepresenteerd naast medische apparaten / instrumenten?
      Zo ja: heroverwegen, want associatie kan misleidend zijn.
- [ ] App Store / Play Store category: "Health & Fitness" is correct;
      "Medical" zou MDR-flags triggeren bij Apple/Google review.

## Wat te doen bij IGJ- of AP-vraag

1. Verwijs naar dit document + `docs/security-audit-2026-05-12.md`.
2. Toon de bron-code: geen biometrische sensor-readout, geen externe
   API-calls, alleen lokale heuristieken.
3. Onderbouw met `legal.med.*` keys in `src/lib/i18n.js` dat de
   wellness-positionering consistent in de UI staat.
4. Onderbouw met `FertilityWindowCard` (`src/app.jsx`) dat advies
   conservatief en disclaimer-rijk is.

## Heroverwegingsmomenten

Heroverweeg deze positionering bij:

- Nieuwe feature die zwangerschap-detectie of -voorkoming claimt
- Nieuwe integratie met fysiologische sensoren
- Klinische partnerschappen of professionele endorsements
- Marketing-koers die "alternatief voor X medisch product"-taal gebruikt
- Wijziging in MDCG-richtsnoeren (volg MDCG-publicaties jaarlijks)
