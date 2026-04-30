# Verwerkingsregister Aura

**Versie:** 1.0 — laatst bijgewerkt op [INVUL: datum]
**Volgende review:** [INVUL: datum, jaarlijks of bij elke wijziging]

Dit register voldoet aan AVG art. 30 lid 1 (verantwoordelijke). Een
register van een verwerker (art. 30 lid 2) is voor Aura niet van
toepassing — wij zijn zelf verwerkingsverantwoordelijke.

> Let op: de uitzondering op de registerverplichting voor entiteiten met
> minder dan 250 werknemers (AVG art. 30 lid 5) geldt **niet** als de
> verwerking bijzondere categorieën persoonsgegevens betreft. Aura
> verwerkt gezondheidsdata — register is dus verplicht ongeacht
> bedrijfsgrootte.

---

## 1. Verwerkingsverantwoordelijke

| Veld | Waarde |
|---|---|
| Naam | [INVUL: bedrijfsnaam + rechtsvorm] |
| Adres | [INVUL: postadres] |
| KvK-nummer | [INVUL] |
| Contactpersoon | [INVUL: naam + functie] |
| E-mail | [INVUL: contact-email] |
| FG (DPO) | [INVUL: naam + contact, of "n.v.t."] |

## 2. Verwerkingsactiviteiten

### Verwerking 1 — Lokale gezondheidsmonitoring door betrokkene

| Veld | Waarde |
|---|---|
| **Naam** | Lokale opslag en verwerking cyclus- en welzijnsdata |
| **Doel** | Betrokkene in staat stellen haar cyclus, voeding, slaap, beweging en symptomen te volgen en fase-passende suggesties te ontvangen |
| **Categorieën betrokkenen** | Gebruikers van de Aura PWA, primair 16+ |
| **Categorieën persoonsgegevens** | Gezondheidsdata: cyclusdatums, cycluslengte, calorieën, eiwit, hydratatie, slaap, beweging, vrije notitie (max 280 tekens), darmondersteuning, symptomen (energie, stemming, krampen, opgeblazen). Profielgegevens: naam (optioneel), leeftijd, gewicht, lengte, activiteitsniveau. |
| **Bijzondere categorie?** | Ja — gezondheidsdata (AVG art. 9 lid 1) |
| **Grondslag** | Art. 6 lid 1 sub a + art. 9 lid 2 sub a — uitdrukkelijke toestemming bij eerste opening |
| **Ontvangers** | Geen — gegevens blijven uitsluitend op het apparaat van betrokkene |
| **Doorgifte buiten EER** | Nee |
| **Bewaartermijn** | Tot betrokkene zelf wist |
| **Beveiligingsmaatregelen** | AES-GCM 256-bit, PBKDF2-SHA256 (600.000 iteraties), passphrase-unlock, auto-lock, in-memory key only |

### Verwerking 2 — Hosting en serveren van de webapp

| Veld | Waarde |
|---|---|
| **Naam** | Statische hosting Aura PWA |
| **Doel** | De webapp aanbieden via een browser-bezoek |
| **Categorieën betrokkenen** | Bezoekers van de Aura-website |
| **Categorieën persoonsgegevens** | IP-adres, User-Agent, tijdstip van bezoek (server access logs) |
| **Bijzondere categorie?** | Nee |
| **Grondslag** | Art. 6 lid 1 sub b — uitvoering overeenkomst (technisch noodzakelijk) en art. 6 lid 1 sub f — gerechtvaardigd belang (beveiliging, DDoS-mitigatie) |
| **Ontvangers** | Hostingpartij (verwerker, zie §3) |
| **Doorgifte buiten EER** | [INVUL: nee, of: ja met SCC's / DPF / adequaatheidsbesluit — afhankelijk van keuze hostingpartij] |
| **Bewaartermijn** | [INVUL: bv. 30 dagen — zie SLA hostingpartij] |
| **Beveiligingsmaatregelen** | TLS 1.2+, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, X-Frame-Options |

### Verwerking 3 — Beantwoorden van privacyverzoeken (optioneel)

| Veld | Waarde |
|---|---|
| **Naam** | Verwerking van AVG-verzoeken |
| **Doel** | Wettelijke verplichting om te reageren op verzoeken om inzage, rectificatie, wissing, beperking, dataportabiliteit en bezwaar |
| **Categorieën betrokkenen** | Gebruikers die een verzoek indienen |
| **Categorieën persoonsgegevens** | Naam, e-mailadres, inhoud van het verzoek |
| **Bijzondere categorie?** | Nee |
| **Grondslag** | Art. 6 lid 1 sub c — wettelijke verplichting (AVG zelf) |
| **Ontvangers** | Geen |
| **Doorgifte buiten EER** | Nee (afhankelijk van e-mailprovider) |
| **Bewaartermijn** | 2 jaar na afhandeling (bewijs van naleving) |
| **Beveiligingsmaatregelen** | E-mail via [INVUL: e-mailprovider, bv. ProtonMail, Mailbox.org of zakelijk Outlook met TLS] |

## 3. Verwerkers

| Verwerker | Doel | Locatie | DPA op orde? |
|---|---|---|---|
| [INVUL: hostingpartij] | Hosting statische app + serverlogs | [INVUL: regio] | [INVUL: ja, [link of referentie] / nee — actie vereist] |
| [INVUL: e-mailprovider] | Verzenden + ontvangen privacy-correspondentie | [INVUL: regio] | [INVUL] |

## 4. Doorgiften buiten de EER

[INVUL: Beschrijf per doorgifte: welke verwerker, welk land, welke
waarborg (SCC's, EU-VS Data Privacy Framework, adequaatheidsbesluit,
of bindende bedrijfsregels). Verwijs naar bewijsstukken in een DPA-map.]

## 5. Algemene beveiligingsmaatregelen

Conform AVG art. 32:

### Technisch

- End-to-end versleuteling van alle gezondheidsdata met AES-GCM 256-bit
- Wachtwoord-afleiding met PBKDF2-SHA256, 600.000 iteraties
- TLS 1.2+ met HSTS preload (HTTPS verplicht)
- Strikte Content-Security-Policy (`default-src 'self'`)
- Geen externe scripts, geen analytics, geen advertentienetwerken
- Self-hosted lettertypes — geen IP-doorgifte aan font-CDN's
- Auto-vergrendel na inactiviteit
- ErrorBoundary voorkomt informatielek bij crash
- Service-worker met versie-gecontroleerde cache (network-first
  navigatie)
- 67 unit tests + axe-scan + Playwright e2e draaien op elke commit

### Organisatorisch

- [INVUL: Wie heeft toegang tot productie-omgeving en hoe is dat
  geregeld?]
- [INVUL: Hoe wordt incident-response geregeld?]
- [INVUL: Wie krijgt onboarding op privacy/security en hoe vaak?]
- [INVUL: Hoe vaak worden DPA's en sub-verwerkers gereviewed?]

## 6. Datalek-procedure

Bij verdenking van een datalek:

1. **Direct vastleggen** wat, wanneer, hoeveel betrokkenen, welke
   gegevens (intern incident-log).
2. **Beoordelen** of melding aan AP nodig is (waarschijnlijk wél bij
   gezondheidsdata): binnen **72 uur** na constatering — AVG art. 33.
3. **Beoordelen** of melding aan betrokkenen nodig is — AVG art. 34
   (bij hoog risico voor rechten en vrijheden, vrijwel altijd bij
   gezondheidsdata zonder versleuteling).
4. **Mitigeren** — wachtwoord laten resetten, keys roteren, lek
   afsluiten.
5. **Documenteren** — vul incident-log aan met afhandeling.

[INVUL: Vermeld verantwoordelijke + back-up; documenteer in een eigen
incident-response-runbook]

---

## Reviewchecklist (voor de jurist / FG)

- [ ] Verwerkingen volledig — geen verborgen verwerking gemist
- [ ] Grondslagen kloppen
- [ ] Verwerkers + DPA's daadwerkelijk getekend
- [ ] Doorgifte-waarborgen actueel (DPF werd 2023 ingevoerd, controleer
      huidige status)
- [ ] Bewaartermijnen documenteerbaar
- [ ] Datalek-procedure getest met droogloop
