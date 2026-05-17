/**
 * Aura — Premium / Trial / License module
 * ----------------------------------------
 * Mix van pure helpers + ED25519 signature verify. Geen DOM, geen
 * localStorage, geen netwerk-call. De licentie wordt 100% offline
 * gevalideerd met een embedded public key.
 *
 * --- Model ---
 *
 * Aura kent drie staten:
 *
 *   trial:    eerste 30 dagen na `profile.firstLaunchAt`. Full access.
 *   premium:  geldige licentie in `profile.license`. Full access.
 *   basic:    geen geldige licentie + trial verlopen. Alleen Home tab.
 *
 * --- License-format ---
 *
 *   AURA-PREMIUM-<base64url(JSON payload)>.<base64url(signature)>
 *
 *   payload = {
 *     iat:  ISO timestamp issued-at,
 *     sub:  random opaque id (geen e-mail of identiteit),
 *     plan: 'lifetime' | 'annual' | 'monthly',
 *     exp:  ISO timestamp (optional; weglaten voor lifetime)
 *   }
 *
 * --- Twee verify-modi ---
 *
 * `LICENSE_VERIFY_MODE = 'stub'`  — alleen format-check
 *   (default). Geschikt voor demo/dev. Een gebruiker kan zelf een
 *   geldige string typen en premium krijgen. Documenteer dit ALS DEV.
 *
 * `LICENSE_VERIFY_MODE = 'ecdsa'` — echte ED25519-verify met
 *   `LICENSE_PUBLIC_KEY_HEX`. Production-grade. Vereist dat je
 *   Cloudflare Worker keys heeft gegenereerd en de public key in
 *   deze file is gezet.
 *
 * Schakel om door beide constanten hieronder te vullen + mode op
 * 'ecdsa' te zetten. Code valt automatisch terug op de stub als de
 * public key nog de placeholder is — voorkomt accidenteel deployen
 * met een unconfigured ECDSA-modus die alle licenties zou weigeren.
 */

import { verifyAsync as ed25519VerifyAsync } from '@noble/ed25519';

/**
 * Duur van de free trial in dagen, vanaf `firstLaunchAt`.
 *
 * 30 dagen is een gangbare retentiekeuze voor wellness-apps en geeft
 * de gebruikster genoeg cycli (gemiddeld ~1.07) om een patroon te
 * zien. Bij wijziging: bestaande gebruikers behouden hun trial-start;
 * een nieuwe duur werkt door op iedereen die nu in trial zit.
 */
export const TRIAL_DAYS = 30;

/**
 * License-key prefix. Universeel; stub én ECDSA gebruiken 'm.
 */
const STUB_LICENSE_PREFIX = 'AURA-PREMIUM-';
const STUB_LICENSE_MIN_BODY = 12;
const STUB_LICENSE_RE = new RegExp(`^${STUB_LICENSE_PREFIX}[A-Z0-9]{${STUB_LICENSE_MIN_BODY},}$`);

/**
 * Schakel deze twee om wanneer je Stripe-betaalflow + Cloudflare
 * Worker live staat. Tot dat moment blijft de stub-validator actief
 * en is iedere `AURA-PREMIUM-<≥12 alfanumeriek>` string geldig —
 * uitsluitend bedoeld voor dev/demo.
 *
 * Stappen:
 *   1. `node worker/gen-keypair.mjs` → krijgt pub + priv in hex
 *   2. Zet priv in Cloudflare Worker secret `LICENSE_PRIV_KEY`
 *   3. Plak pub hieronder in `LICENSE_PUBLIC_KEY_HEX`
 *   4. Zet `LICENSE_VERIFY_MODE` op `'ecdsa'`
 * Code valt automatisch terug op de stub als de public key de
 * placeholder is gebleven — defense-in-depth tegen half-geconfigureerde
 * deploys die anders elke betaalde licentie zouden afwijzen.
 */
export const LICENSE_VERIFY_MODE = 'stub'; // 'stub' | 'ecdsa'
export const LICENSE_PUBLIC_KEY_HEX = 'REPLACE_ME_WITH_ED25519_PUBLIC_KEY_HEX';

/**
 * Stripe Payment Link voor "Aura Premium". Vul in zodra je 'm in het
 * Stripe-dashboard hebt aangemaakt. Tot dan toont de PremiumCard een
 * "checkout nog niet ingericht"-toast bij klik op "Upgrade".
 */
export const PREMIUM_CHECKOUT_URL = '';

const ECDSA_CONFIGURED =
  LICENSE_VERIFY_MODE === 'ecdsa' &&
  typeof LICENSE_PUBLIC_KEY_HEX === 'string' &&
  /^[0-9a-fA-F]{64}$/.test(LICENSE_PUBLIC_KEY_HEX); // ed25519 pub = 32 bytes = 64 hex

/* base64url decode → Uint8Array, zonder externe library */
function base64UrlDecode(str) {
  if (typeof str !== 'string') return null;
  // Padding terug toevoegen + url-chars → standaard base64.
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (str.length % 4)) % 4);
  try {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    // Node fallback voor unit tests
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    return null;
  } catch { return null; }
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(out[i])) return null;
  }
  return out;
}

/**
 * Echte ED25519-verify. Async omdat @noble/ed25519 onder de motorkap
 * SHA-512 doet via WebCrypto. Returnt false bij elke fout (invalid
 * encoding, signature mismatch, key onleesbaar) — nooit een throw
 * naar de UI-laag.
 */
async function verifyEcdsaSignature(key) {
  try {
    if (typeof key !== 'string') return false;
    if (!key.startsWith(STUB_LICENSE_PREFIX)) return false;
    const body = key.slice(STUB_LICENSE_PREFIX.length);
    const dot = body.indexOf('.');
    if (dot <= 0 || dot >= body.length - 1) return false;
    const payloadB64 = body.slice(0, dot);
    const sigB64    = body.slice(dot + 1);
    const payloadBytes = base64UrlDecode(payloadB64);
    const sigBytes     = base64UrlDecode(sigB64);
    const pubBytes     = hexToBytes(LICENSE_PUBLIC_KEY_HEX);
    if (!payloadBytes || !sigBytes || !pubBytes) return false;
    if (sigBytes.length !== 64) return false; // ED25519 signature is 64 bytes
    return await ed25519VerifyAsync(sigBytes, payloadBytes, pubBytes);
  } catch {
    return false;
  }
}

/**
 * Parse de payload (geverifieerd of niet). Gebruikt door
 * `hasValidLicense` voor expiry-check; alleen op de payload, signature
 * is al gecheckt elders.
 */
function tryParseLicensePayload(key) {
  try {
    if (typeof key !== 'string' || !key.startsWith(STUB_LICENSE_PREFIX)) return null;
    const body = key.slice(STUB_LICENSE_PREFIX.length);
    const dot = body.indexOf('.');
    if (dot <= 0) return null;
    const payloadBytes = base64UrlDecode(body.slice(0, dot));
    if (!payloadBytes) return null;
    const json = new TextDecoder().decode(payloadBytes);
    const parsed = JSON.parse(json);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch { return null; }
}

/**
 * @returns {number}  Dagen sinds `firstLaunchAt`, of 0 wanneer ontbrekend.
 */
export function daysSinceFirstLaunch(profile, now = new Date()) {
  if (!profile?.firstLaunchAt) return 0;
  const start = new Date(profile.firstLaunchAt);
  if (Number.isNaN(start.getTime())) return 0;
  const diffMs = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

/**
 * Is de gebruikster nog binnen de trial-periode?
 * Geen `firstLaunchAt` → niet in trial (consent-gate moet 'm zetten).
 */
export function isInTrial(profile, now = new Date()) {
  if (!profile?.firstLaunchAt) return false;
  return daysSinceFirstLaunch(profile, now) < TRIAL_DAYS;
}

/**
 * Hoeveel dagen heeft ze nog in trial — 0 als verlopen.
 */
export function trialDaysRemaining(profile, now = new Date()) {
  if (!profile?.firstLaunchAt) return 0;
  return Math.max(0, TRIAL_DAYS - daysSinceFirstLaunch(profile, now));
}

/**
 * Synchroon format-check. Houdt de oude API in stand voor sync code-
 * paden (tests, snelle UI-rendering). Returnt true voor elke key die
 * ten minste het format-patroon matcht — een werkelijke ECDSA-verify
 * gebeurt in `verifyLicenseSignatureAsync` en wordt gebruikt door
 * `hasValidLicenseAsync`.
 */
export function verifyLicenseSignature(key) {
  if (typeof key !== 'string') return false;
  return STUB_LICENSE_RE.test(key.trim().toUpperCase());
}

/**
 * Volledige offline-validatie: format + (indien geconfigureerd)
 * ECDSA-handtekening. Async omdat ED25519-verify via WebCrypto async is.
 *
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function verifyLicenseSignatureAsync(key) {
  if (!verifyLicenseSignature(key)) return false;
  // Geen ECDSA geconfigureerd → trust het format-check (stub mode).
  // Logs één keer per page-load zodat het in DevTools opvalt.
  if (!ECDSA_CONFIGURED) {
    if (typeof window !== 'undefined' && !window.__auraEcdsaWarned) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Aura premium] License-verify draait in STUB-modus. Niet ' +
        'production-grade. Zet LICENSE_VERIFY_MODE op "ecdsa" en plak ' +
        'je public key in src/lib/premium.js zodra je Worker draait.',
      );
      window.__auraEcdsaWarned = true;
    }
    return true;
  }
  return await verifyEcdsaSignature(key);
}

/**
 * Geldige niet-verlopen licentie? (sync — alleen format-check)
 *
 * Voor UI-rendering die niet kan wachten op async. Gebruikt het
 * licentie-object dat al ge-async-gevalideerd is bij activate, plus
 * een sync expiry-check op de payload of het `exp` veld.
 *
 * `profile.license = { key, validatedAt, plan, exp? }`
 */
export function hasValidLicense(profile, now = new Date()) {
  const lic = profile?.license;
  if (!lic?.key) return false;
  if (!verifyLicenseSignature(lic.key)) return false;

  // Expiry check — prefer `lic.exp` (set bij activate), valt anders
  // terug op payload.exp uit de key (voor licenties die zonder
  // expliciete exp-veld in het profile zijn gezet).
  let expIso = lic.exp;
  if (!expIso) {
    const payload = tryParseLicensePayload(lic.key);
    if (payload?.exp) expIso = payload.exp;
  }
  if (expIso) {
    const expDate = new Date(expIso);
    if (Number.isNaN(expDate.getTime())) return false;
    if (now.getTime() >= expDate.getTime()) return false;
  }
  return true;
}

/**
 * Heeft de gebruikster volledige toegang (trial OF licentie)?
 *
 * Een gebruikster zonder profile (vóór onboarding) is geen "basic" —
 * onboarding heeft sowieso voorrang op de paywall.
 */
export function isPremium(profile, now = new Date()) {
  if (!profile) return false;
  return isInTrial(profile, now) || hasValidLicense(profile, now);
}

/**
 * Welke staat is de gebruikster in? Handig voor UI-render-logica.
 *
 * @returns {'trial' | 'premium' | 'basic' | 'unconfigured'}
 */
export function premiumStatus(profile, now = new Date()) {
  if (!profile) return 'unconfigured';
  if (hasValidLicense(profile, now)) return 'premium';
  if (isInTrial(profile, now)) return 'trial';
  return 'basic';
}

/**
 * Mag deze tab open in de huidige staat?
 *
 * Basic-gebruikers zien alleen Home (`home`) + de privacy-tekst
 * (`legal`) — die laatste mag nooit gegated worden om AVG-redenen.
 * Settings blijft ook open zodat ze hun licentie kunnen invoeren
 * of hun data kunnen exporteren of wissen.
 */
export function canAccessTab(tabId, profile, now = new Date()) {
  if (isPremium(profile, now)) return true;
  return tabId === 'home' || tabId === 'settings' || tabId === 'legal';
}
