#!/usr/bin/env node
/**
 * Aura — ED25519 key-pair generator voor de premium-licentie-flow.
 *
 * Run éénmalig vanaf de repo-root:
 *
 *   node worker/gen-keypair.mjs
 *
 * Output: één paar 32-byte ED25519 sleutels in hex.
 *
 *   PRIVATE  → zet als Cloudflare Worker secret `LICENSE_PRIV_KEY`:
 *              `wrangler secret put LICENSE_PRIV_KEY` (paste de hex)
 *              ⚠️ NOOIT in source committen. NOOIT in browser embedden.
 *
 *   PUBLIC   → plak in `src/lib/premium.js` als waarde voor
 *              `LICENSE_PUBLIC_KEY_HEX`. Mag in de browser, dat is hoe
 *              de app handtekeningen verifieert zonder server-call.
 *
 * Schakel daarna `LICENSE_VERIFY_MODE` in dezelfde file op `'ecdsa'`.
 * Code valt automatisch terug op de stub als de public key nog de
 * placeholder is — dus klaar zetten van Worker en app kan onafhankelijk.
 */

import { getPublicKeyAsync, utils } from '@noble/ed25519';

const priv = utils.randomSecretKey();
const pub  = await getPublicKeyAsync(priv);

const toHex = (bytes) => Array.from(bytes)
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Aura ED25519 keypair — bewaar de PRIVATE KEY veilig.');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log();
console.log('PRIVATE  (32 bytes hex):  → Cloudflare Worker secret');
console.log('  ' + toHex(priv));
console.log();
console.log('PUBLIC   (32 bytes hex):  → src/lib/premium.js');
console.log('  ' + toHex(pub));
console.log();
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Volgende stappen:');
console.log('  1. wrangler secret put LICENSE_PRIV_KEY  ← paste private hex');
console.log('  2. In src/lib/premium.js:');
console.log('       LICENSE_PUBLIC_KEY_HEX = "<public hex hierboven>"');
console.log('       LICENSE_VERIFY_MODE    = "ecdsa"');
console.log('  3. Commit (alleen de public key, NOOIT private)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
