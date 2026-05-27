# Paced — App Store Connect Privacy formulier

Apple's "App Privacy" sectie in App Store Connect vereist gedetailleerd
uitleg van welke data verzameld wordt, waarvoor, en of het gekoppeld is
aan de gebruiker. Deze antwoorden moeten **exact matchen** met je
in-app privacy-tekst en je Privacy Policy — als Apple een mismatch
detecteert wordt de submission geweigerd of de app na publicatie
verwijderd.

Dit document mapt elke Apple-vraag naar het juiste antwoord voor Paced.

---

## Hoofdvraag: "Does this app collect data?"

**Antwoord: YES** *(zie waarom hieronder)*

Hoewel Paced's kerfunctionaliteit volledig lokaal is (geen data verlaat
het apparaat), is er één opt-in feature die wel data verwerkt: de
**partner-koppeling via Supabase**. Apple's definitie van "data
collection" omvat alle data die het apparaat verlaat, ongeacht of jij
of een derde-partij het opslaat. Dus zodra de partner-feature wordt
gebruikt, verzamel je technisch gezien data en moet je YES antwoorden.

> 💡 Belangrijk: ook al kan de gebruiker de partner-feature
> negeren, je MOET YES antwoorden zolang de feature ÜBERHAUPT bestaat.
> Apple kijkt naar wat de app *kan* doen, niet wat een specifieke
> user *daadwerkelijk* doet.

---

## Data types collected — antwoorden per categorie

Voor elk data-type vraagt Apple:
1. Wordt het verzameld? (Y/N)
2. Waarvoor? (één of meer purposes)
3. Is het gekoppeld aan de gebruikersidentiteit? (Y/N)
4. Wordt het gebruikt voor tracking? (Y/N)

### Contact Info → Email Address
- **Collected:** YES (alleen bij partner-feature opt-in — voor magic-link login)
- **Purposes:** App Functionality
- **Linked to user:** YES
- **Used for tracking:** NO

### Health & Fitness → Health and Fitness
- **Collected:** YES (alleen bij partner-feature opt-in — partner krijgt huidige cyclus-fase + dag te zien)
- **Purposes:** App Functionality
- **Linked to user:** YES
- **Used for tracking:** NO

> ⚠️ Apple legt deze vraag onder een microscoop voor cycle-trackers.
> Wees expliciet in App Privacy details dat alleen *huidige fase* en
> *cyclus-dag* gedeeld worden, NIET de volledige log-geschiedenis.

### User Content → Other User Content
- **Collected:** YES (de optionele "owner_note" tekst bij partner-share, max paar honderd tekens)
- **Purposes:** App Functionality
- **Linked to user:** YES
- **Used for tracking:** NO

### Identifiers → User ID
- **Collected:** YES (Supabase `auth.uid()` — een willekeurige UUID gekoppeld aan email)
- **Purposes:** App Functionality
- **Linked to user:** YES
- **Used for tracking:** NO

---

## Data types NOT collected — antwoord NO

Voor de volgende categorieën expliciet **NO** antwoorden:

| Categorie | Reden |
|---|---|
| Financial Info | Paced verwerkt geen betaling |
| Location | Geen geo-locatie ooit |
| Sensitive Info (race, religion, etc.) | Niet gevraagd |
| Contacts | Geen toegang tot Contacts |
| User Content → Photos/Videos/Audio | Geen mediafiles |
| User Content → Customer Support | Geen in-app messaging |
| User Content → Gameplay | N/A |
| Browsing History | Geen tracking van bezochte schermen |
| Search History | Geen search |
| Identifiers → Device ID | Geen IDFA, geen fingerprinting |
| Purchases | Geen IAP |
| Usage Data → Product Interaction | Geen analytics |
| Usage Data → Advertising Data | Geen ads |
| Usage Data → Other Usage Data | Geen telemetry |
| Diagnostics → Crash Data | Geen crash-reporter (niet via Apple, niet via 3rd party) |
| Diagnostics → Performance Data | Geen |
| Diagnostics → Other Diagnostic Data | Geen |
| **Other Data** | Geen overige verzameling |

> 💡 Paced's *lokale* opslag (localStorage) telt **niet** als "collected"
> voor Apple's definitie. Pas wanneer data het device verlaat (zoals
> in de partner-feature) wordt het "collected". Dus al die andere
> health-velden (slaap, voeding, etc.) die wij lokaal opslaan zijn
> NIET verzameld.

---

## Privacy Practices — gedetailleerde verklaring

Apple laat je voor elke "YES" een tekstuele toelichting geven. Hier
zijn de aanbevolen antwoorden:

### Voor "Health and Fitness data"
```
Paced collects health data (current menstrual cycle phase and cycle
day) only when the user explicitly enables the optional partner-
linking feature. The user generates an invitation link, the partner
accepts the link, and from that moment forward the user's current
phase + cycle day is shared with the partner via end-to-end isolated
rows in our Supabase database (each user can only read their own
data, enforced via row-level security policies).

The user can disconnect at any time via Settings → Partner →
Disconnect, which immediately stops further sharing. All other
health data (symptoms, daily logs, temperature readings, nutrition,
sleep, etc.) stays exclusively on the user's device and is never
transmitted.
```

### Voor "Email Address"
```
Paced collects email addresses only when the user opts into the
partner-linking feature, for the sole purpose of magic-link
authentication. The email is used to send a one-time login link;
no marketing communications are sent. The user can delete their
account (and email record) by signing in and using Settings →
Partner → Disconnect followed by full account deletion via
contact info@xaven.io.
```

### Voor "User ID"
```
A randomly-generated UUID is assigned by our authentication
provider (Supabase) when the user signs in via magic link for
the partner feature. This ID exists solely to enforce row-level
security so users can only access their own data. It is not
shared with any third party, not used for analytics, and not
linked to any external identifier (no IDFA, no fingerprinting).
```

### Voor "Other User Content" (owner_note)
```
When using the partner-linking feature, the user can write an
optional short note (a few hundred characters) visible to their
linked partner — for context like "feeling great today" or "low
energy, please be gentle". This note is stored alongside the
phase snapshot in the same row, accessible only to the user and
their linked partner via row-level security policies.
```

---

## Third-party SDKs disclosure

Apple vraagt ook: welke third-party SDKs gebruikt de app?

| SDK | Doel | Data collected by SDK |
|---|---|---|
| `@supabase/supabase-js` | Partner-feature auth + database | Email, user UUID, health phase data (alleen bij opt-in) |
| Geen analytics SDKs | — | — |
| Geen advertising SDKs | — | — |
| Geen crash-reporting SDKs | — | — |
| Geen attribution SDKs | — | — |

> 💡 Capacitor zelf is geen SDK in Apple's definitie — het is een
> wrapper voor de webview. Geen disclosure nodig.

---

## Privacy Manifest (PrivacyInfo.xcprivacy)

Sinds iOS 17 (2024) vereist Apple een **Privacy Manifest** voor elke
third-party SDK. Voor Paced's iOS-app moet je een
`PrivacyInfo.xcprivacy` bestand toevoegen aan `ios/App/App/`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeHealth</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeUserID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
```

> 💡 `CA92.1` = "Declare this reason to access user defaults to read
> and write information that is only accessible to the app itself."
> Dit is de juiste reden voor onze localStorage-gebaseerde opslag
> (Capacitor mapt localStorage onder de hood naar UserDefaults).

**Toevoegen in vervolg-PR** na `npx cap add ios` is gedraaid en de
`ios/App/App/` directory bestaat.

---

## Risico-flags specifiek voor cycle-trackers

Apple is sinds 2022 (na Roe v. Wade) extra streng op period-trackers.
Specifieke red flags die je moet vermijden:

| Red flag | Hoe Paced dit oplost |
|---|---|
| Vage privacy-claims | Specifieke claim: "all data stays on device unless you opt into partner-share" |
| Data verkoop / sharing met derden | Nooit. Expliciet uitgesloten in onze Privacy Policy. |
| Onduidelijke jurisdictie | Xaven BV is EU-bedrijf, Supabase EU-region, AVG-conform |
| Vragen om health-data zonder duidelijke reden | Paced geeft per veld uitleg (zie consent-gate + in-app legal-tekst) |
| Geen opt-out / data-deletion flow | Paced heeft één-knop "wis alles" + JSON-export voor portabiliteit |

---

## Submission-tips

1. **Antwoord conservatief.** Bij twijfel: zeg dat je iets verzamelt. Apple weigert apps die "we collect nothing" claimen maar wel een third-party-SDK hebben (Supabase = YES).

2. **Beschrijving consistent houden.** De App Privacy details moeten 1-op-1 matchen met je in-app Privacy Policy. Apple's reviewers checken dit handmatig voor health-apps.

3. **Privacy Policy URL moet werken.** Apple test of de URL bereikbaar is en niet 404't. Niet alleen linken — de pagina moet ook geladen worden binnen ~5 seconden.

4. **Demo-account voorbereid hebben.** Voor de partner-feature: maak één test-account aan en geef de credentials in "App Review Information" sectie. Anders kan de reviewer de feature niet testen → meestal wordt de app afgewezen tot je dat aanlevert.

5. **Verwacht een 1e weigering.** Voor cycle-trackers is een eerste afwijzing normaal — meestal vragen ze om verduidelijking over data-flow of health-data justification. Reageer in App Store Connect's review-chat, niet via email.
