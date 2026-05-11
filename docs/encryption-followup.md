# Follow-up: at-rest encryption (v1.4+)

Plain JSON in `localStorage` is functioneel veilig binnen het huidige
threat-model (offline-only, geen backend, device-trust), maar voor
health data is een passphrase-versleutelde opslag een logische upgrade
zodra de basis-launch staat. Deze nota beschrijft het concrete
implementatie-plan zodat het werk in een aparte PR opgepakt kan worden
zonder opnieuw te hoeven scopen.

## Waarom apart, niet in deze launch-PR

De prod-hardening branch (`origin/claude/aura-prod-hardening`) bevat
een werkende implementatie, maar is fundamenteel andere code:

- Vite + Playwright + axe (i.p.v. esbuild + Vitest)
- Geen i18n (we hebben dat nu wel)
- `src/main.jsx` + `src/UnlockGate.jsx` split (wij hebben single
  `src/app.jsx`)

`git diff --stat origin/main origin/claude/aura-prod-hardening -- src/`
laat zien: 2987 nieuwe regels, 5503 weggeknipt. Het is geen merge —
het is een rewrite. Direct mergen werkt niet; cherry-picken vereist
hand-port met zorg op:

1. **Migratie**: bestaande gebruikers hebben plain-JSON data.
   Lockout-risico is reëel ("passphrase verloren = data weg"),
   dus de migratie moet optioneel zijn en de gebruiker actief laten
   kiezen voor encryption.
2. **iOS Safari WebCrypto quirks**: niet alle versies ondersteunen
   alle algoritmes (PBKDF2 met SHA-256 wel, AES-GCM wel, maar de
   key-derivation kosten zijn op older devices voelbaar).
3. **Vergeten-passphrase flow**: data wissen is de enige optie;
   dat moet expliciet zijn ("ja, ik begrijp dat ik alles kwijtraak").

## Scope van de losse PR

### Verplicht

1. **`src/lib/crypto.js`** porteren vanaf prod-hardening
   - AES-GCM 256 met PBKDF2-SHA256 key-derivation (100k iteraties)
   - `encrypt(plaintext, passphrase)` → `{ iv, salt, ciphertext }`
   - `decrypt(envelope, passphrase)` → plaintext of `WrongPassphraseError`
   - `isCryptoAvailable()` voor browser-feature-check
2. **`src/lib/secureStorage.js`** porteren
   - Wrapt huidige `storage.js` met optionele encryption
   - `setupNew(passphrase)`, `unlock(passphrase)`, `lock()`, `destroyAll()`
   - Memory-only key zodra ontgrendeld; wordt nooit terug naar storage geschreven
3. **`UnlockGate` component** (hand-port met i18n)
   - Eerste-keer setup: "Bescherm je gegevens met een passphrase?
     (Optioneel — sla over voor plain opslag)"
   - Unlock op startup als data versleuteld is
   - Forgot-passphrase: data destruction confirmatie
4. **Migratie flow**
   - Bij eerste run na deploy: detecteer plain profile
   - Toon non-blocking banner: "Versleutel je gegevens (aanbevolen)"
   - User clickt → setup-flow → re-encrypt bestaande data → klaar
   - User klikt weg → blijft plain, banner komt 1× per week terug
5. **Settings UI: "Wijzig passphrase"** met current+new bevestiging
6. **Tests**: 60+ tests bestaan al op prod-hardening branch
   (`crypto.test.js`, `secureStorage.test.js`) — porteren

### Niet doen

- Auto-lock na inactiviteit — was op prod-hardening branch, maar voor
  een PWA die in stand-alone modus draait is dat slechte UX
- Cross-device sync — out of scope, conflicts met "alleen op apparaat"
- Server-side key escrow — out of scope per privacy-belofte

## Open vragen

- **Default opt-in of opt-out?** Aanbeveling: opt-out — wel een
  passphrase prompten maar "Sla over" prominent zichtbaar.
- **Wat doen we met logs van vandaag tijdens setup?** Direct meegenomen
  in eerste encrypt-call zodra de user een passphrase kiest.
- **Wat als WebCrypto niet beschikbaar is?** Op moderne browsers altijd
  beschikbaar; toon een one-time banner "encryption niet ondersteund —
  data blijft plain in deze browser".

## Effort-schatting

- Cherry-pick crypto.js + secureStorage.js + tests: 2u
- Hand-port UnlockGate naar i18n + onze structuur: 4u
- Migratie flow + Settings change-passphrase: 3u
- Manual + automated testing: 3u

Totaal ~12u (1.5 dag) — vandaar dat het een eigen PR is, niet aan
launch-prep vastgeplakt.

## Wanneer oppakken

Niet vóór de eerste launch. Pas zodra het launch-feedback-flow is
gestabiliseerd, zodat de migratie-flow op real-world data getest kan
worden voordat hij in productie landt. Mogelijk gebundeld met v1.4
release.
