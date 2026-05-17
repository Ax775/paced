/**
 * Aura — Premium / Trial / License module
 * ----------------------------------------
 * Pure functions only. No DOM, no localStorage, no network.
 *
 * --- Model ---
 *
 * Aura kent drie staten:
 *
 *   trial:    eerste 30 dagen na `profile.firstLaunchAt`. Full access.
 *   premium:  geldige licentie in `profile.license`. Full access.
 *   basic:    geen geldige licentie + trial verlopen. Alleen Home tab.
 *
 * --- License-keuze: offline ECDSA verify ---
 *
 * De licentie is een gehandtekend payload (gesigneerd door je
 * Cloudflare Worker met een ED25519/P-256 private key na Stripe-
 * webhook). De app verifieert lokaal met de embedded public key —
 * zonder server-call, zonder accounts, zonder gebruikersdata naar
 * een API. Dat houdt de offline-only privacy-belofte intact.
 *
 * Format: base64url(json) + "." + base64url(signature)
 *
 *   payload = {
 *     iat:  ISO timestamp issued-at,
 *     sub:  random opaque id (geen e-mail of identiteit),
 *     plan: 'lifetime' | 'annual' | 'monthly',
 *     exp:  ISO timestamp (optional; weglaten voor lifetime)
 *   }
 *
 * --- Huidige status: stub-validator ---
 *
 * Tot de Worker er staat (zie docs/premium-setup.md) accepteert de
 * stub elke key in het format `AURA-PREMIUM-<min 12 alfanumerieke
 * tekens>`. Vervang `verifyLicenseSignature` met de echte ECDSA-check
 * zodra je het public key paar hebt — dan zijn willekeurige strings
 * niet meer geldig.
 */

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
 * License-key prefix die de stub-validator herkent. Bij overgang naar
 * de echte ECDSA-flow vervang je dit door payload-decode + signature-
 * verify met de embedded public key.
 */
const STUB_LICENSE_PREFIX = 'AURA-PREMIUM-';
const STUB_LICENSE_MIN_BODY = 12;
const STUB_LICENSE_RE = new RegExp(`^${STUB_LICENSE_PREFIX}[A-Z0-9]{${STUB_LICENSE_MIN_BODY},}$`);

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
 * Offline-validatie van een license-key. Vervang de stub door echte
 * ECDSA-verify zodra de Worker live is — zie docs/premium-setup.md.
 *
 * @param {string} key  De gepaste licentie-string
 * @returns {boolean}
 */
export function verifyLicenseSignature(key) {
  if (typeof key !== 'string') return false;
  // STUB: format-check op AURA-PREMIUM-<min 12 alfa-num>.
  // Een aanvaller kan dus zelf een geldig-formaat key bedenken.
  // Acceptabel voor MVP — Worker-flow sluit dat sluitend af.
  return STUB_LICENSE_RE.test(key.trim().toUpperCase());
}

/**
 * Geldige niet-verlopen licentie?
 *
 * `profile.license = { key, validatedAt, plan, exp? }`
 * - key + signature moeten kloppen
 * - exp (optioneel) — niet aanwezig betekent lifetime
 */
export function hasValidLicense(profile, now = new Date()) {
  const lic = profile?.license;
  if (!lic?.key) return false;
  if (!verifyLicenseSignature(lic.key)) return false;
  if (lic.exp) {
    const expDate = new Date(lic.exp);
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
