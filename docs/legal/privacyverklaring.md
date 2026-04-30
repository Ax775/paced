# Privacyverklaring Aura

**Versie:** 1.0 — laatst bijgewerkt op 30 april 2026
**Geldig vanaf:** [INVUL: datum van eerste publicatie]

> ⚠️ **CONCEPT — nog niet juridisch gereviewd.** Bevat nog `[INVUL: …]`
> placeholders. Niet publiceren als publieksgerichte tekst totdat alle
> placeholders ingevuld zijn én een privacyjurist akkoord heeft gegeven.

Aura ("wij", "ons") respecteert je privacy. Deze verklaring beschrijft hoe
wij omgaan met persoonsgegevens, in lijn met de Algemene verordening
gegevensbescherming (AVG / GDPR) en de Uitvoeringswet AVG (UAVG).

Aura is bewust ontworpen volgens het *privacy-by-design*-principe (AVG art. 25):
**al je gezondheidsdata blijft uitsluitend op je eigen apparaat** en is
versleuteld met een wachtwoord dat alleen jij kent.

---

## 1. Wie is verwerkingsverantwoordelijke?

**Xaven** (vennootschap onder firma — "Xaven VOF")
[INVUL: Postadres — straat, huisnummer, postcode, woonplaats]
KvK: [INVUL: KvK-nummer — wordt aangevraagd]
BTW: [INVUL: NL...B01 indien BTW-plichtig, anders "n.v.t."]

E-mail algemeen: [INVUL: contact@xaven.io]
E-mail privacyverzoeken: [INVUL: privacy@xaven.io]

[INVUL: Functionaris Gegevensbescherming (FG/DPO) — beoordelen of een
FG verplicht is. Onder AVG art. 37 lid 1 sub c is een FG verplicht bij
grootschalige verwerking van bijzondere categorieën persoonsgegevens.
Voor Aura wordt dit relevant naarmate het gebruikersaantal groeit;
laat dit door je privacyjurist beoordelen.]

## 2. Welke gegevens verwerken wij?

### 2.1 Gegevens die uitsluitend op je apparaat worden bewaard

De volgende gegevens slaan wij **versleuteld op in jouw browser**
(localStorage). Wij hebben hier zelf geen toegang toe en kunnen ze niet
inzien, herstellen of overdragen.

| Categorie | Voorbeelden | Bijzondere categorie? |
|---|---|---|
| Profielgegevens | Naam (optioneel), leeftijd, gewicht, lengte, activiteitsniveau | Ja — gezondheidsdata (AVG art. 9 lid 1) |
| Cyclusdata | Eerste dag menstruatie, cycluslengte, fase-historie | Ja — gezondheidsdata |
| Dagelijkse logs | Calorieën, eiwit, water, slaap, beweging, vrije notitie | Ja — gezondheidsdata |
| Symptomen | Energie, stemming, krampen, opgeblazen gevoel | Ja — gezondheidsdata |
| Darmondersteuning | Probiotica / vezels / gefermenteerd (vinkjes) | Ja — gezondheidsdata |
| Voorkeuren | Auto-vergrendel-interval, herinneringstijd | Nee |

**Versleuteling:** AES-GCM 256-bit met een sleutel afgeleid uit jouw
wachtwoord via PBKDF2-SHA256 (600.000 iteraties). De sleutel verlaat
nooit je apparaat. Wij kunnen je wachtwoord niet herstellen — dit is
een bewuste afweging tussen vertrouwelijkheid en gemak.

### 2.2 Gegevens die wij wél kortstondig verwerken

Wanneer je de app opent, worden onvermijdelijk technische gegevens door
de hostingpartij verwerkt om de pagina te kunnen serveren:

| Categorie | Doel | Bewaartermijn |
|---|---|---|
| IP-adres | Verbinding tot stand brengen, beveiliging (DDoS-mitigatie) | Cloudflare bewaart edge-logs op het Free plan ~4 dagen; analytics worden geanonimiseerd |
| User-Agent (browsertype) | Standaard HTTP-protocol, geen analyse | Idem |
| Tijdstip van bezoek | Idem | Idem |

Wij gebruiken deze gegevens **niet** voor analyse, profilering of
reclame. Er worden geen analytics-tools, advertentiepixels of
fingerprinting-technieken ingezet.

## 3. Doelen en grondslagen

| Doel | Persoonsgegevens | Grondslag (AVG art. 6 + 9) |
|---|---|---|
| App aan jou aanbieden (technisch serveren) | Technisch noodzakelijke loggegevens | Art. 6 lid 1 sub b — uitvoering overeenkomst |
| Jouw cyclus- en gezondheidsdata lokaal verwerken zodat de app functioneert | Bijzondere categorie gezondheidsdata | Art. 9 lid 2 sub a — uitdrukkelijke toestemming |
| Beveiliging (encryptie, lock-functie) | Sleutelmateriaal afgeleid uit wachtwoord | Art. 6 lid 1 sub f — gerechtvaardigd belang (informatiebeveiliging) |

Voor gezondheidsdata vragen wij bij de eerste opening van de app om
**uitdrukkelijke toestemming**. Je kunt deze toestemming op elk moment
intrekken door alle data te wissen via *Instellingen → Beveiliging →
Profiel resetten* of via *Wachtwoord vergeten? → Wis alles* op het
vergrendelscherm.

## 4. Cookies en lokale opslag

Aura gebruikt **geen cookies** voor tracking of analyse. Wij gebruiken
wel **lokale opslag** (localStorage en service-worker-cache) die voor de
werking van de app strikt noodzakelijk is:

- **Versleutelde data-opslag** — om jouw logs offline beschikbaar te houden
- **Configuratievoorkeuren** — bv. het auto-vergrendel-interval
- **Service worker cache** — om de app offline te kunnen openen
- **Schema-versie** — interne migratie-marker

Onder de Telecommunicatiewet art. 11.7a (e-Privacy Richtlijn) geldt voor
strikt noodzakelijke functionele opslag een uitzondering op de
toestemmingseis. Voor niet-essentiële opslag vragen wij apart om
toestemming — die niet-essentiële opslag bestaat momenteel niet.

## 5. Wij delen je gegevens niet

Aura verzendt **geen persoonsgegevens** naar externe partijen.
Concreet betekent dat:

- Geen cloud-synchronisatie
- Geen back-ups bij ons of bij derden
- Geen analytics (Google Analytics, Plausible, Matomo, etc.)
- Geen error-tracking (Sentry, etc.)
- Geen advertentienetwerken
- Geen fingerprinting-providers
- Geen externe fonts of CDN-resources die je IP doorgeven (lettertypes
  worden vanaf onze eigen server geserveerd)

De enige derde die noodzakelijkerwijs gegevens verwerkt, is onze
hostingpartij voor het serveren van de statische app. Zie §6.

## 6. Verwerkers (subverwerkers)

| Verwerker | Doel | Locatie | Verwerkersovereenkomst |
|---|---|---|---|
| Cloudflare, Inc. (Cloudflare Pages) | Hosting van de statische app + edge cache | Wereldwijd edge-netwerk; primaire serving via EU edge nodes | DPA automatisch geïncorporeerd in de Cloudflare Self-Serve Subscription Agreement; geaccepteerd op 30 april 2026. Document: https://www.cloudflare.com/cloudflare-customer-dpa/ |

Geen verdere verwerkers. Indien later e-mail- of foutmonitoring wordt
toegevoegd, dient deze tabel te worden uitgebreid met een ondertekende
verwerkersovereenkomst conform AVG art. 28 lid 3.

## 7. Doorgifte buiten de EER

Wij maken gebruik van Cloudflare Pages voor hosting. Cloudflare is een
Amerikaanse onderneming; technische logging-data (zoals IP-adressen
in edge-logs) kan daardoor buiten de Europese Economische Ruimte worden
verwerkt. Cloudflare hanteert daarvoor de **Standard Contractual Clauses
(SCC's)** zoals goedgekeurd door de Europese Commissie en is
gecertificeerd onder het **EU-VS Data Privacy Framework (DPF)**.

Verwijzingen:
- Cloudflare DPA: https://www.cloudflare.com/cloudflare-customer-dpa/
- DPF-certificering: https://www.dataprivacyframework.gov/list

## 8. Bewaartermijnen

| Gegevens | Bewaartermijn |
|---|---|
| Cyclus- en gezondheidsdata op jouw apparaat | Tot je deze zelf verwijdert |
| Voorkeuren | Idem |
| Serverlogs (IP, User-Agent) | ~4 dagen (Cloudflare Free plan edge logs) |
| Eventuele e-mails aan ons over privacyverzoeken | Tot 2 jaar na afhandeling |

## 9. Beveiligingsmaatregelen

Wij treffen passende technische en organisatorische maatregelen
(AVG art. 32):

- **End-to-end versleuteling** van alle gezondheidsdata met AES-GCM 256-bit
- **PBKDF2-SHA256** met 600.000 iteraties voor wachtwoord-afleiding
- **Geen platte tekst** in localStorage — alle aura.* sleutels bevatten ciphertext
- **Auto-vergrendel** na inactiviteit (instelbaar)
- **HTTPS** (TLS 1.2+) voor alle verbindingen
- **Strikte Content-Security-Policy** tegen XSS
- **HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy**
- **Geen externe scripts** of CDN's die met je interactie kunnen meelezen
- **Open broncode** zodat de versleuteling onafhankelijk te verifiëren is

Beperkingen die je zelf moet kennen:

- Wij kunnen je niet beschermen tegen malware, gecompromitteerde
  browser-extensies of fysieke toegang tot een ontgrendeld apparaat
- Het besturingssysteem kan een schermafbeelding van de app maken bij
  app-switching — overweeg een schermbescherming als dit voor jou
  relevant is
- Een browser-update of -reset kan je lokale data verwijderen — exporteer
  regelmatig via *Instellingen → Exporteren*

## 10. Jouw rechten

Onder de AVG heb je de volgende rechten:

| Recht | Hoe je het bij Aura uitoefent |
|---|---|
| Inzage (art. 15) | Je gegevens staan op je eigen apparaat — open de app en bekijk ze. Voor serverlogs: e-mail [INVUL: privacy@xaven.io] |
| Rectificatie (art. 16) | Wijzig profiel of logs in de app |
| Wissen (art. 17) | *Instellingen → Profiel resetten* of *Wachtwoord vergeten? → Wis alles* |
| Beperking (art. 18) | E-mail [INVUL: privacy@xaven.io] indien van toepassing |
| Dataportabiliteit (art. 20) | *Instellingen → Exporteren* — CSV en Apple Health XML |
| Bezwaar (art. 21) | E-mail [INVUL: privacy@xaven.io] |
| Niet onderworpen zijn aan automatische besluitvorming (art. 22) | Aura neemt geen geautomatiseerde besluiten met rechtsgevolg |
| Toestemming intrekken (art. 7 lid 3) | Door alle data te wissen — zie hierboven |

Wij reageren binnen één maand op verzoeken (AVG art. 12 lid 3).

### Klachtrecht

Ben je het niet eens met hoe wij met jouw gegevens omgaan, dan kun je
een klacht indienen bij de Autoriteit Persoonsgegevens:

- **Web:** https://autoriteitpersoonsgegevens.nl/nl/zelf-doen/privacyrechten/klacht-indienen-bij-de-ap
- **Telefoon:** 088 - 1805 250
- **Post:** Postbus 93374, 2509 AJ Den Haag

## 11. Geen profilering, geen geautomatiseerde besluitvorming

Aura toont je informatie en suggesties op basis van eenvoudige
berekeningen (bv. cyclusfase op basis van laatste menstruatiedatum).
Dit zijn geen geautomatiseerde besluiten met juridische of vergelijkbare
gevolgen in de zin van AVG art. 22. Aura geeft geen medisch advies en
neemt geen beslissingen over jou of voor jou.

## 12. Minderjarigen

Aura is bedoeld voor gebruikers van **16 jaar en ouder**. In Nederland
is 16 jaar de leeftijd waarop de AVG-toestemming voor
informatiediensten geldig is (UAVG art. 5). Voor gebruikers onder de 16
is toestemming van een ouder of voogd vereist.

Constateer je dat een minderjarige onder de 16 zonder die toestemming
gebruik maakt van Aura, dan kun je dat melden via [INVUL: privacy@xaven.io];
wij geven dan instructies om de data te verwijderen.

## 13. Wijzigingen

Wij kunnen deze privacyverklaring aanpassen. De huidige versie staat
altijd in de app onder *Instellingen → Juridisch* en op
[INVUL: https://<aura-domein>/legal/privacy.html — wordt gevuld zodra het Aura-domein is geregistreerd]. Bij materiële wijzigingen
melden wij dit zichtbaar in de app en vragen wij opnieuw om akkoord.

## 14. Contact

Vragen of klachten over privacy? Mail [INVUL: privacy@xaven.io]. Wij streven
ernaar binnen 5 werkdagen te reageren.

---

## Reviewchecklist (voor de jurist)

- [ ] Verwerkingsverantwoordelijke correct beschreven (rechtsvorm, KvK)
- [ ] DPO/FG-verplichting beoordeeld (AVG art. 37 — grootschaligheid)
- [ ] Grondslag art. 9 lid 2 sub a (uitdrukkelijke toestemming) is juridisch
      passend, of is een andere uitzondering meer geëigend (bv. art. 9 lid 2
      sub h voor gezondheid)?
- [ ] Hostingpartij + verwerkersovereenkomst vermeld
- [ ] Doorgifte buiten EER correct gedekt (SCC / DPF / adequaatheid)
- [ ] Bewaartermijnen serverlogs kloppen met daadwerkelijke configuratie
- [ ] Klachtrecht-passage actueel (AP-contactgegevens)
- [ ] Acceptance-flow geïmplementeerd: gebruiker accepteert in onboarding,
      timestamp + versie wordt bewaard
- [ ] Versie-bumping bij materiële wijziging — flow getest
- [ ] Tekst gespiegeld met colofon en medische disclaimer (consistentie)
- [ ] Toegankelijk voor schermlezer; B1-taalniveau overwogen
