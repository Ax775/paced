# Aura License Worker

Cloudflare Worker dat na een Stripe-betaling een ED25519-gehandtekende
licentie genereert en naar de gebruiker mailt.

De Worker is bewust **stateless** — geen database, geen log van wie
welke licentie heeft. Eenmaal verstuurd is de licentie volledig
offline te verifiëren door de app zelf, zonder dat de Worker ooit
weer benaderd hoeft te worden.

## Eenmalige setup

```sh
# 1. Cloudflare CLI installeren (als je 'm niet al hebt)
npm install -g wrangler

# 2. Inloggen
wrangler login

# 3. Naar de worker-folder
cd worker
npm install

# 4. ED25519 key-pair genereren (op je eigen machine, niet in de Worker)
node ../worker/gen-keypair.mjs
# → kopieer de PRIVATE hex naar de volgende stap,
#   plak de PUBLIC hex straks in src/lib/premium.js

# 5. Secrets in de Worker zetten
wrangler secret put LICENSE_PRIV_KEY          # paste de PRIVATE hex
wrangler secret put STRIPE_WEBHOOK_SECRET     # uit Stripe dashboard
wrangler secret put RESEND_API_KEY            # uit resend.com (gratis tier)

# 6. (Optioneel) From-email in wrangler.toml zetten op je geverifieerde
#    Resend-domein. Zonder dit komen e-mails niet door.

# 7. Deploy
wrangler deploy
# → krijgt een URL als https://aura-license-worker.<je-account>.workers.dev
```

## Stripe koppelen

In het Stripe-dashboard:

1. **Developers → Webhooks → Add endpoint**
2. URL: `https://aura-license-worker.<je-account>.workers.dev/stripe/webhook`
3. Listen to: `checkout.session.completed`
4. Save → Stripe toont een **Signing secret** — die was wat je in
   stap 5 hierboven als `STRIPE_WEBHOOK_SECRET` zette
5. **Products → Add product** "Aura Premium" → maak een **Payment Link**
   van € 19,00 one-time
6. Kopieer de Payment Link → zet 'm in `src/lib/premium.js` als
   `PREMIUM_CHECKOUT_URL` constante

## App koppelen aan deze Worker

In `src/lib/premium.js`:

```diff
- export const LICENSE_VERIFY_MODE = 'stub';
- export const LICENSE_PUBLIC_KEY_HEX = 'REPLACE_ME_WITH_ED25519_PUBLIC_KEY_HEX';
+ export const LICENSE_VERIFY_MODE = 'ecdsa';
+ export const LICENSE_PUBLIC_KEY_HEX = '<jouw_public_hex_uit_gen-keypair>';
+ export const PREMIUM_CHECKOUT_URL = 'https://buy.stripe.com/<je-payment-link>';
```

## Testen

```sh
# Lokaal de Worker draaien (dry-run, geen secrets nodig voor /health)
wrangler dev

# In een tweede terminal
curl http://localhost:8787/health
# → ok

# Stripe webhook simuleren (vereist Stripe CLI: stripe.com/docs/cli)
stripe trigger checkout.session.completed
```

## Wat staat er níét in

- Subscription handling — alleen one-time payment / lifetime license
- License revocation — geen database, dus geen revoke-list. Een
  gestolen of gelekte licentie blijft geldig tot je een nieuwe keypair
  rolt (heel ongebruikelijk; voor zo'n event roll je `gen-keypair.mjs`
  opnieuw en bump je app + Worker)
- Refund-flow — Stripe-dashboard handelt dit zelf af, geen Worker code
- Multi-device limit — een gebruiker kan haar licentie op meerdere
  apparaten plakken; dit is bewuste keuze (de UX van anti-piracy weegt
  niet op tegen de loyale-gebruiker-vriendelijkheid)
