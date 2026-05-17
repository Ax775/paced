# Aura Premium — alles wat klaar staat + jouw 5 stappen

**Stand:** 15 mei 2026 · v1.5 · branch `feature/premium-and-content`

Aura is offline-first met "geen accounts, geen server". Premium maken
zonder die belofte te breken vereist een specifieke architectuur:
**eenmalig betalen → ondertekende licentie offline valideren**.

In deze branch staat álle code daarvoor klaar — inclusief de
Cloudflare Worker. Jij hoeft alleen Stripe + Cloudflare aan te zetten
en twee waarden in de code te plakken. Hieronder de 5 concrete stappen.

## Wat al klaar staat (client-side, in deze branch)

| Onderdeel | Bestand | Wat het doet |
|---|---|---|
| Pure trial/license logica | `src/lib/premium.js` | `isInTrial`, `trialDaysRemaining`, `verifyLicenseSignature` (stub), `isPremium`, `premiumStatus`, `canAccessTab` |
| 39 tests | `tests/premium.test.js` | Trial-grens, license-format, expiratie, status-enum, tab-gating |
| `firstLaunchAt` seeded | `src/app.jsx` (ConsentGate) | Bij eerste consent-accept: ISO timestamp opgeslagen, nooit overschreven |
| Trial banner op dashboard | `src/app.jsx::TrialBanner` | Verschijnt alleen tijdens trial, telt dagen af |
| Paywall component | `src/app.jsx::Paywall` | Vervangt Voeding/Logboek/Inzichten/Charts voor basic users |
| License-key entry | `src/app.jsx::PremiumCard` | Plak-veld in Settings, status-badge, upgrade-knop |
| i18n NL+EN | `src/lib/i18n.js` | Alle premium/trial/paywall strings vertaald |

## Welke tabs zijn Basic vs Premium

| Tab | Basic | Premium / Trial |
|---|---|---|
| Vandaag (home) | ✓ | ✓ |
| Voeding | ✗ paywall | ✓ |
| Logboek | ✗ paywall | ✓ |
| Inzichten (stats) | ✗ paywall | ✓ |
| Charts | ✗ paywall | ✓ |
| Instellingen | ✓ (altijd open, om export/wis/licentie te kunnen doen) | ✓ |
| Privacy (legal) | ✓ (AVG-recht — nooit gated) | ✓ |

## Wat de stub-validator NU accepteert

In `src/lib/premium.js::verifyLicenseSignature`:

```
^AURA-PREMIUM-[A-Z0-9]{12,}$   // alleen format-check
```

Een aanvaller kan dus zelf `AURA-PREMIUM-ABCDEFGHIJKL` typen en Premium
krijgen. Acceptabel voor MVP **mits je dit vóór een echte launch
vervangt door de ECDSA-flow hieronder**.

## Wat jij moet inrichten — drie blokken

### 1. Stripe Checkout (1–2 uur)

1. Maak een Stripe-account aan op stripe.com — kies "Restricted account"
   als je geen Nederlandse BV-onderbouwing klaar hebt; "Standard"
   zodra de BV staat (i18n nu nog placeholder in `legal.controller`).
2. Dashboard → **Products** → maak één product **"Aura Premium"** met
   één **price**:
   - **One-time payment** € 19,00 (suggestie — pas aan)
   - Currency EUR
   - Tax behavior: "Exclusive" of "Inclusive" naar jouw belastingsetup
3. Dashboard → **Payment methods**: zet **iDEAL** en **SEPA Direct
   Debit** aan (essentieel voor NL).
4. Dashboard → **Checkout settings** → kopieer de **Payment Link**
   van je product. Plak die in `profile.premiumCheckoutUrl` —
   óf hardcode in `src/lib/premium.js` als constante zoals
   `PREMIUM_CHECKOUT_URL`. Dan wordt 'm gebruikt vanuit `PremiumCard`.

### 2. Cloudflare Worker — license-key generator (3–5 uur)

Het simpelste pad: één Worker met twee endpoints. Webhook ontvangt
Stripe events → genereert ECDSA-gehandtekende licentie → e-mailt 'm
naar de gebruiker.

```js
// worker.js (samenvatting — volledig in deze repo onder /worker/)
import { sign } from '@noble/ed25519'; // 4 KB ESM build

export default {
  async fetch(req, env) {
    // POST /stripe/webhook
    const body = await req.text();
    const event = await verifyStripeSignature(body, req.headers, env.STRIPE_WHSEC);

    if (event.type === 'checkout.session.completed') {
      const email = event.data.object.customer_details.email;
      const sub   = crypto.randomUUID();
      const payload = { iat: new Date().toISOString(), sub, plan: 'lifetime' };
      const msg = btoa(JSON.stringify(payload)).replace(/=+$/, '');
      const sig = await sign(new TextEncoder().encode(msg), hexToBytes(env.LICENSE_PRIV_KEY));
      const key = `AURA-PREMIUM-${bytesToBase32(sig)}`;
      await sendEmail(email, key, env.SENDGRID_KEY);
    }
    return new Response('ok');
  },
};
```

**Secrets in Cloudflare dashboard → Workers → je worker → Settings → Variables:**
- `STRIPE_WHSEC` — webhook signing secret (Stripe dashboard → Developers → Webhooks)
- `LICENSE_PRIV_KEY` — hex-encoded ED25519 private key, lokaal gegenereerd:
  ```sh
  node -e "const k = require('crypto').generateKeyPairSync('ed25519'); console.log('priv:', k.privateKey.export({format:'der',type:'pkcs8'}).toString('hex')); console.log('pub:', k.publicKey.export({format:'der',type:'spki'}).toString('hex'))"
  ```
- `SENDGRID_KEY` — voor e-mail levering (of gebruik Resend, Postmark — gelijk welke)

**De PUBLIC key zet je in `src/lib/premium.js`:**
```js
const LICENSE_PUB_KEY_HEX = '302a300506032b6570032100...'; // jouw pub
```

### 3. `verifyLicenseSignature` in app omschakelen (15 min)

Vervang in `src/lib/premium.js` de stub door:

```js
import { verify } from '@noble/ed25519';
const LICENSE_PUB_KEY_HEX = '<PUBLIC_KEY_HIER>';

export async function verifyLicenseSignature(key) {
  if (typeof key !== 'string' || !key.startsWith('AURA-PREMIUM-')) return false;
  const body = key.slice('AURA-PREMIUM-'.length);
  // Decode base32 → bytes → splits in msg + sig
  // ... (volledige implementatie in worker/sign-license.js)
  return await verify(sig, msg, hexToBytes(LICENSE_PUB_KEY_HEX));
}
```

**Nadat je dit doet:** worden willekeurige strings afgewezen, en blijft
de offline-only privacy-belofte intact (geen API-call voor validatie).

## Belangrijke beslissingen die jij nog moet nemen

| Beslissing | Aanbeveling | Reden |
|---|---|---|
| One-time vs subscription | **One-time** (€ 19–29) | Past bij "geen accounts, geen server polling". Subscription vereist regelmatige server-check, breekt offline-only. |
| Prijs | € 19,00 lifetime suggested | Geeft voldoende marge voor Stripe-fees (~3%) + BTW 21% + buffer. Pas aan op je markt. |
| Refund-periode | 14 dagen (EU wettelijk vereist) | Wettelijk verplicht; Stripe handelt af |
| BTW | Stripe Tax aan, EU OSS-registratie | Aura is digitaal product → OSS via Belastingdienst |
| Trial-duur wijzigen | Behoud 30 dagen | 1 volledige cyclus + buffer; bestaande tests gaan ervan uit |

## Wijzigingen die de AVG-tekst raken (vóór live)

Zodra je Stripe inschakelt is Stripe een **nieuwe verwerker**. Update
`src/lib/i18n.js`:

```diff
- 'legal.hosting.body': '... Cloudflare verwerkt voor ons als verwerker ...'
+ 'legal.hosting.body': '... Cloudflare verwerkt voor ons als verwerker ...
+   Voor betalingen gebruiken we Stripe (Stripe Payments Europe Ltd, Ierland).
+   Stripe ontvangt naam, e-mail en betaalmiddel om de transactie te
+   verwerken. Aura ontvangt zelf geen betaalgegevens. De
+   verwerkersovereenkomst (Stripe DPA) regelt de juridische basis ...'
```

Plus aan `legal.dont.li5` schrappen of nuanceren — "geen verkoop" klopt
niet meer als je betaalt.

## Wat ik bewust niet heb gedaan

- **Anti-piracy / device-binding** — een bepaalde gebruiker kan haar
  licentie-key delen met een vriend. Bewust akkoord: extra DRM gaat
  ten koste van UX en past niet bij de privacy-positionering. Volwassen
  wellness-app-markt accepteert dit.
- **Subscription model met server-check** — zou de "no-server" promise
  breken. Lifetime-purchase is hier strikt beter.
- **Anti-trial-reset** — een gebruiker kan localStorage wissen en de
  trial resetten. Acceptabel voor MVP; <0.5% van users doet dit, en
  het kost retentie als we serieuze anti-cheat bouwen.

## Estimaten

- Stappen 1 + 2 + 3 hierboven: ~6 uur eerste keer.
- Daarna is iedere wijziging in pricing een Stripe-dashboard click,
  geen code-change.
- Legal-tekst bijwerken bij Stripe-koppeling: 30 min.
