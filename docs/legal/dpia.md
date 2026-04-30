# Data Protection Impact Assessment — Aura

**Versie:** 1.0 — laatst bijgewerkt op 30 april 2026
**Status:** Concept, nog niet beoordeeld door FG/jurist
**Volgende review:** uiterlijk 30 april 2027, en altijd bij elke
materiële wijziging in de verwerking

> ⚠️ **CONCEPT — bevat nog `[INVUL: …]` placeholders.** Niet
> definitief vóórdat een privacyjurist of FG akkoord heeft gegeven.

Deze DPIA volgt de structuur van de **Autoriteit Persoonsgegevens** zoals
beschreven in haar handleiding *Data Protection Impact Assessment* (versie
2024) en is opgezet conform AVG art. 35.

---

## Waarom is deze DPIA verplicht?

Een DPIA is verplicht bij verwerkingen die "waarschijnlijk een hoog
risico" inhouden voor de rechten en vrijheden van betrokkenen
(AVG art. 35 lid 1). De AP-lijst (Stcrt. 2019, 64418) noemt onder andere:

> "Op grote schaal en/of systematisch verwerken van bijzondere
> persoonsgegevens, met name gezondheidsgegevens."

Aura verwerkt **gezondheidsdata** (cyclus, symptomen, voeding) en richt
zich op een potentieel breed publiek. De combinatie van bijzondere
categorie data + potentieel grote schaal triggert de DPIA-verplichting.

## 1. Beschrijving van de verwerking

### 1.1 Aard

Aura is een Progressive Web App (PWA) waarmee gebruikers hun
menstruatiecyclus, voeding, beweging, slaap en welzijn bijhouden. De
app berekent op basis van invoer in welke cyclusfase de gebruikster zich
bevindt en geeft fase-passende suggesties.

Alle gezondheidsdata wordt **uitsluitend op het apparaat van de
gebruiker bewaard**, versleuteld met AES-GCM 256-bit. De sleutel wordt
afgeleid uit een wachtwoord dat de gebruiker zelf kiest (PBKDF2-SHA256,
600.000 iteraties). De sleutel verlaat het apparaat niet.

### 1.2 Reikwijdte

| Aspect | Beschrijving |
|---|---|
| Categorieën persoonsgegevens | Gezondheidsdata (cyclus, voeding, slaap, beweging, symptomen, vrije notities) + identificatiegegevens (naam optioneel, leeftijd, gewicht, lengte) |
| Categorieën betrokkenen | Personen die menstrueren, primair 16 jaar en ouder, Nederlandstalig |
| Doelgroep schaal | [INVUL: aantal verwachte gebruikers — bij meer dan enkele duizenden actieve gebruikers spreken we van "grootschalig"] |
| Geografisch bereik | Primair Nederland en Vlaanderen; geen geo-restrictie technisch afgedwongen |
| Bewaartermijn | Tot de gebruiker zelf wist (lokaal) of installatie verwijdert |
| Bron | Door betrokkene zelf ingevoerd |

### 1.3 Aard van de verwerking

| Verwerking | Beschrijving |
|---|---|
| Verzamelen | Direct via UI-invoer door betrokkene zelf |
| Vastleggen | Versleuteld in localStorage van de browser |
| Structureren | JSON per dag (`aura.log.YYYY-MM-DD`) en één profiel-object (`aura.profile`) |
| Opslaan | Browser-localStorage; geen serverzijde-opslag |
| Raadplegen | Door de betrokkene zelf via de app; door derden alleen mogelijk bij fysieke toegang tot een ontgrendeld apparaat |
| Aanpassen | Door de betrokkene zelf |
| Wissen | Door de betrokkene zelf via *Profiel resetten* of *Wachtwoord vergeten? → Wis alles* |

Geen verwerking door middel van: cloud-upload, e-mail, koppeling met
externe diensten, automatische besluitvorming, profilering met
rechtsgevolg.

### 1.4 Doelen

1. De gebruiker in staat stellen haar eigen cyclus en gezondheid te
   monitoren — primair persoonlijk inzicht.
2. Op basis van de cyclusfase fase-passende suggesties tonen voor
   voeding, beweging en zelfzorg.
3. Een dagelijkse herinnering bieden om bij te houden (optioneel,
   alleen client-side).

### 1.5 Belangen van de verwerkingsverantwoordelijke

[INVUL: Beschrijf het belang van de aanbieder — bv. commercieel
(licentie/abonnement), missiegedreven (vrouwgezondheid empoweren), of
gemengd. Bij commerciële belangen: beschrijf businessmodel, want dat
beïnvloedt de proportionaliteits-toets.]

### 1.6 Context

- Hostingpartij: Cloudflare Pages (Cloudflare, Inc., gecertificeerd onder EU-VS Data Privacy Framework + SCC's)
- Verwerkersovereenkomst: automatisch geïncorporeerd in Cloudflare Self-Serve Subscription Agreement; geaccepteerd 30 april 2026
- Externe verwerkers verder: geen
- Open broncode: ja — https://github.com/Ax775/Claude (private tot livegang)

## 2. Beoordeling noodzaak en evenredigheid

### 2.1 Rechtmatigheid (AVG art. 6, 9)

| Verwerking | Grondslag | Onderbouwing |
|---|---|---|
| Technisch serveren van app | Art. 6 lid 1 sub b — overeenkomst | Noodzakelijk voor het kunnen aanbieden van de dienst |
| Lokale verwerking gezondheidsdata | Art. 6 lid 1 sub a + art. 9 lid 2 sub a — uitdrukkelijke toestemming | Betrokkene geeft expliciet akkoord bij eerste opening |
| Beveiliging (versleuteling, autoslot) | Art. 6 lid 1 sub f — gerechtvaardigd belang (informatiebeveiliging) | Noodzakelijk om vertrouwelijkheid te garanderen, geringe inbreuk op rechten |

Alternatieve grondslag overwogen: **art. 9 lid 2 sub h (gezondheidszorg)**
— niet van toepassing, want Aura is geen zorgverlener en valt niet
onder een beroepsgeheim.

### 2.2 Doelbinding

De verwerking dient uitsluitend de in §1.4 genoemde doelen. Er is geen
verdere verwerking voor analyse, marktonderzoek of training van
machine-learning-modellen.

### 2.3 Minimale gegevensverwerking

| Categorie | Reden voor opname | Alternatief overwogen? |
|---|---|---|
| Naam | Persoonlijke aanspreekvorm in onboarding | Optioneel — kan leeg gelaten worden |
| Leeftijd, gewicht, lengte | Berekening basaal metabolisme + dagelijkse calorie/eiwit-doelen | Mag overgeslagen worden; doelen worden dan niet getoond |
| Activiteitsniveau | Idem | Idem |
| Eerste menstruatiedatum + cycluslengte | Cyclusfase-berekening | Verplicht voor cyclus-functie; gebruiker mag deze functie negeren |
| Dagelijkse logs (eten, slapen, etc.) | Doel van de app | Volledig optioneel per dag |

### 2.4 Juistheid

Gegevens worden door de betrokkene zelf ingevoerd en kunnen op elk
moment worden gecorrigeerd. Wij voegen geen externe gegevens toe.

### 2.5 Bewaartermijn

Tot betrokkene zelf wist. Geen automatische verwijdering — wel een
expliciete export-functie en wis-functie. Dit voldoet aan AVG art. 5
lid 1 sub e mits de betrokkene weet hoe te wissen (zie §10
privacyverklaring).

### 2.6 Rechten van betrokkenen

Volledig ondersteund — zie §10 van de privacyverklaring.

## 3. Risicoanalyse

We onderscheiden risico's voor de **vertrouwelijkheid**, **integriteit**
en **beschikbaarheid** van de gegevens, en voor de **rechten en vrijheden**
van betrokkenen.

| # | Risico | Waarschijnlijkheid | Impact | Bruto-risico |
|---|---|---|---|---|
| R1 | Onbevoegde toegang door fysieke toegang tot ontgrendeld apparaat | Midden | Hoog (gevoelige gezondheidsdata kan tot stigma, problemen in relaties of werk leiden) | Hoog |
| R2 | Onbevoegde toegang via gestolen apparaat (vergrendeld) | Midden | Laag (data is versleuteld) | Laag |
| R3 | Brute-force aanval op zwak wachtwoord | Midden | Hoog | Hoog |
| R4 | Browser-extensie of XSS leest geheugen of localStorage | Laag | Hoog | Midden |
| R5 | Schermafbeelding door OS (app-switcher screenshot) | Hoog | Midden | Midden |
| R6 | Gebruiker vergeet wachtwoord, verliest data | Midden | Midden (data verloren, geen lek) | Midden |
| R7 | Browserdata wordt gewist (cache leeg, browser-reset) | Midden | Midden | Midden |
| R8 | Hostingpartij wordt gehackt en serveert kwaadaardige JavaScript | Laag | Hoog (sleutel + plaintext kan gestolen worden) | Midden |
| R9 | Doorgifte van logging-IP buiten EER (Cloudflare edge-netwerk) | Midden | Laag (alleen IP/User-Agent in edge-logs, ~4 dagen) | Laag-Midden |
| R10 | Betrokkene onder 16 zonder ouderlijke toestemming | Midden | Midden | Midden |

### Mitigerende maatregelen

| # | Maatregel | Adres |
|---|---|---|
| M1 | Auto-vergrendel na inactiviteit (instelbaar 5/15/30/60 min) | R1 |
| M2 | AES-GCM 256 + PBKDF2-SHA256 600k iteraties | R2, R3 |
| M3 | Wachtwoordsterkte-meter en advies van 12+ tekens | R3 |
| M4 | Strikte Content-Security-Policy (default-src 'self', geen inline scripts) | R4, R8 |
| M5 | HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy | R4, R8 |
| M6 | Subresource Integrity op derde-partij assets | R8 (zie restrisico) |
| M7 | Self-hosted lettertypes (geen Google Fonts) | R9 |
| M8 | Hostingpartij in EER + verwerkersovereenkomst | R9 |
| M9 | Open broncode — onafhankelijke verifieerbaarheid | R8 |
| M10 | Backup-promptscherm in onboarding ("bewaar je wachtwoord nu") | R6 |
| M11 | CSV- en Apple Health-export (dataportabiliteit) | R6, R7 |
| M12 | Privacyverklaring vermeldt expliciet leeftijdsgrens 16+ | R10 |
| M13 | Geen externe analytics, advertentie- of fingerprintingscripts | R4, R8, R9 |

### Restrisico

Met bovenstaande maatregelen blijft een restrisico bestaan op:

- **R5 (OS-schermafbeelding):** technisch niet volledig te mitigeren in
  een PWA. Documentatie noemt dit en suggereert OS-niveau
  schermprivacy waar relevant.
- **R6 (wachtwoord vergeten):** bewust geaccepteerd. Een wachtwoord-recovery
  mechanisme zou de vertrouwelijkheid (R2) ondermijnen. Mitigatie via M10
  en lock-screen reset.
- **R8 (gecompromitteerde host):** beperkt door CSP en SRI; restrisico
  ligt bij operationele veiligheid van hostingpartij.

Het restrisico wordt **acceptabel** geacht, gezien de combinatie van
preventieve maatregelen en de duidelijke informatieverstrekking in de
privacyverklaring en de onboarding.

## 4. Voorafgaande raadpleging

Een voorafgaande raadpleging van de AP (AVG art. 36) is **niet** vereist
omdat na bovenstaande maatregelen geen hoog restrisico overblijft.
Zou bij latere wijziging het risico opnieuw als "hoog" worden
geclassificeerd (bv. bij introductie van cloud-sync), dan moet deze
DPIA worden herzien en moet AP-raadpleging opnieuw worden overwogen.

## 5. Borging

| Wat | Wie | Wanneer |
|---|---|---|
| Periodieke herziening DPIA | [INVUL: verantwoordelijke] | Jaarlijks + bij elke materiële wijziging |
| Penetratietest / security-audit | [INVUL: extern bureau, naam] | [INVUL: vóór livegang + jaarlijks] |
| Bug-bountyprogramma of meldingskanaal | [INVUL] | Continu |
| Privacyverklaring up-to-date houden | [INVUL] | Bij elke release-bump |
| Verwerkersovereenkomsten op orde | [INVUL] | Bij elke nieuwe verwerker |

---

## Reviewchecklist (voor de jurist / FG)

- [ ] Triggers voor DPIA-verplichting correct beoordeeld (AVG art. 35
      lid 3 + AP-lijst Stcrt. 2019/64418)
- [ ] Reikwijdte (§1.2) accuraat met betrekking tot doelgroep en schaal
- [ ] Grondslag-keuze (§2.1) onderbouwd; alternatief art. 9 lid 2 sub h
      gemotiveerd uitgesloten
- [ ] Risicocatalogus (§3) volledig — niets vergeten?
- [ ] Mitigaties controleren in code (security review naast deze DPIA)
- [ ] Beslissing géén voorafgaande raadpleging (§4) onderbouwd genoeg
- [ ] Beleg jaarlijkse herziening en wie verantwoordelijk is
- [ ] Bij materiële verandering (bv. cloud-sync): herzieningsproces
      gedocumenteerd
