# Aura — Light DPIA (Gegevensbeschermings-effectbeoordeling)

**Stand:** 12 mei 2026 · v1.4
**Verwerker:** Aura PWA (offline-first webapplicatie)
**Verantwoordelijke:** `[VUL_IN: naam of entiteit van de uitgever]`
**Doel van dit document:** Voldoen aan AVG art. 35 — vastlegging van de
risico-analyse rond de verwerking van bijzondere-categorie data
(gezondheid). "Light" omdat het residual risk laag is dankzij de
on-device-only architectuur; een formele full-blown DPIA met externe
audit is niet vereist maar dit document fungeert als bewijslast.

## 1 · Wanneer is een DPIA verplicht?

Onder AVG art. 35 lid 3 + de AP-lijst is een DPIA verplicht bij o.a.
"verwerking van bijzondere persoonsgegevens op grote schaal". Aura
**raakt** deze categorie:

- ✓ Bijzondere persoonsgegevens (gezondheid, art. 9)
- ✓ Beoogd voor langetermijn-stelselmatige verwerking (dagelijks log)
- ✓ Doelgroep deels kwetsbaar (minderjarigen ≥16, zwangere-trying-modus)
- ✗ **Niet** "grote schaal" in de traditionele zin — data wordt nooit
  centraal samengevoegd, alleen lokaal verwerkt
- ✗ **Geen** geautomatiseerde besluitvorming met rechtsgevolg

De residual risk is laag genoeg dat formele AP-consultatie (art. 36)
**niet** vereist is. Deze light DPIA legt die conclusie vast.

## 2 · Beschrijving van de verwerking (art. 35 lid 7(a))

### Wat wordt verwerkt
- **Profiel:** naam (optioneel), leeftijd, gewicht, lengte,
  activiteitsniveau, cycluslengte, anticonceptie-type, zwangerschap-
  intentie
- **Cyclus:** datums menstruatie, basaaltemperatuur, eisprong-markers
- **Dagelijks logboek:** voeding (calorieën, eiwit, water), slaap,
  beweging, symptomen, vrije notitie, sportintensiteit, bloedingsdetails
- **Voorkeuren:** taal, thema, herinneringstijd, dashboard-volgorde,
  zichtbare kaarten

### Hoe
- 100% lokale opslag in `localStorage` van de browser
- Plain JSON (geen at-rest encryption in v1.4 — gepland voor v1.5 of
  later, zie `docs/encryption-followup.md`)
- Géén server, géén accounts, géén API-calls naar derden

### Waar
- Op het apparaat van de gebruiker (computer, telefoon, tablet)
- Hosting van de app-code: Cloudflare Pages (EU + global edges).
  Cloudflare ziet alleen technische verbindingsmetadata (IP, User-Agent,
  timestamp) — geen Aura-userdata.

### Door wie
- Verwerkingsverantwoordelijke: `[VUL_IN]`
- Verwerker (alleen voor app-distributie): Cloudflare Inc. /
  Cloudflare Germany GmbH
- Geen sub-verwerkers voor user-data zelf (data verlaat het apparaat niet)

## 3 · Noodzaak- en evenredigheid (art. 35 lid 7(b))

| Vraag | Antwoord |
|---|---|
| Is de verwerking nodig voor het doel? | Ja — cyclus-tracker zonder cyclus-data is onmogelijk. |
| Zijn de gegevens minimaal? | Ja — geen veld is verplicht buiten cycle-start. Naam, gewicht, lengte zijn opt-in voor personalisatie. |
| Bestaat een minder ingrijpend alternatief? | Theoretisch: een aggregate-only API-app. Praktijk: dan moet data het apparaat verlaten = méér ingrijpend. Lokaal-only is de meest privacy-vriendelijke variant. |
| Past de bewaartermijn bij het doel? | Ja — pattern-inzichten over de tijd vereisen historie. Gebruiker bepaalt zelf wanneer ze wist. |
| Is er geautomatiseerde besluitvorming met rechtsgevolg? | Nee — alleen visualisatie en non-prescriptieve suggesties. |

## 4 · Risico-analyse

Top-5 risico's, met restrisico na mitigatie:

### R1 — Lokale device-compromise (gestolen telefoon, ongedeelde toegang)
- **Kans:** medium. **Impact:** hoog (gezondheidsgegevens leesbaar).
- **Mitigatie:** transparant gecommuniceerd in `legal.basis` en
  `legal.med`. Apparaat-vergrendeling is verantwoordelijkheid van de
  gebruiker. Plan voor at-rest encryption in v1.5
  (`docs/encryption-followup.md`).
- **Restrisico:** laag — vereist fysieke toegang + ontgrendeling.

### R2 — Browser-extensie of malware met `storage` permissions
- **Kans:** laag. **Impact:** medium-hoog.
- **Mitigatie:** geen mitigatie technisch mogelijk — een extensie met
  storage-toegang kan elke localStorage lezen. Voor v1.5 verkort
  encryption deze surface.
- **Restrisico:** laag — gebruiker installeert zelf extensies.

### R3 — Cross-site / XSS exploitatie via supply-chain
- **Kans:** zeer laag. **Impact:** hoog (data exfiltratie).
- **Mitigatie:** CSP met `default-src 'self'`; HSTS preload; geen
  `dangerouslySetInnerHTML`; lockfile-pinned deps; geen externe CDNs
  in productie. Audit `security-audit-2026-05-12.md` bevestigt zero
  XSS-paden.
- **Restrisico:** laag — een npm-supply-chain compromise van React
  zelf zou alle React-apps raken; niet Aura-specifiek.

### R4 — MDR-overschrijding door verkeerde communicatie
- **Kans:** laag (interne discipline). **Impact:** medium (regulatory).
- **Mitigatie:** `docs/mdr-positioning.md` legt taalregels vast.
  Marketing review-checklist daarin opgenomen.
- **Restrisico:** laag mits checklist gevolgd wordt.

### R5 — Minderjarige (<16) registreert met valse leeftijd
- **Kans:** medium. **Impact:** medium (AVG art. 8 schending).
- **Mitigatie:** validatie blokkeert <16 op profile-save, consent-gate
  vraagt expliciete bevestiging "Ik ben 16 of ouder", legal-tekst
  noemt leeftijdsgrens.
- **Restrisico:** medium — geen technische middel om leeftijds-claim
  te verifiëren in een offline app. Acceptable risk omdat (a) wet
  het toestaat als de leeftijd plausibel is gevraagd, en (b) er geen
  data het apparaat verlaat dus geen breach-surface.

## 5 · Mitigerende maatregelen — overzicht

Technisch:
- CSP, HSTS, X-Frame-Options, Cross-Origin-Opener-Policy
- localStorage type-safety + prototype-pollution guard
- CSV-injection escape
- Lengte-caps op user-input
- Schema-versioning + deep-merge migration in `loadLog`
- Service worker met restrictive cache-policy (`isCacheable` filter)

Procedureel:
- Consent-gate met expliciete checkbox vóór data-verwerking
- Reset-flow met tweede-stap "typ WIS" bevestiging
- Volledige JSON-export voor data-portabiliteit
- Heldere legal-tekst met identiteit, rechtsbasis, bewaartermijn,
  hosting-positie, AP-klachtrecht

Communicatief:
- MDR-positioning doc voor consistentie marketing/UI
- LegalView toegankelijk vanuit Settings én vanuit consent-gate

## 6 · Conclusie + monitoring

Aura kan onder bovenstaande maatregelen worden ingezet zonder formele
AP-consultatie. Restrisico's zijn medium-laag en gecompenseerd door
de on-device-only architectuur die de blast-radius van elke breach
beperkt tot één apparaat.

**Herzieningsmoment:** dit DPIA-document moet opnieuw beoordeeld worden bij:

- Toevoeging van sensor-integratie of biometrische data
- Wijziging in hosting-architectuur (b.v. serverless functions)
- Wijziging in doelgroep (medische professionals, klinieken)
- Wijziging in dataverwerking-categorie (DNA, geo-locatie, etc.)
- Wijziging in MDCG-richtsnoer of AP-DPIA-lijst

**Volgende geplande herziening:** mei 2027, of eerder bij één van bovenstaande
gebeurtenissen.
