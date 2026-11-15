# App Store-verwijzing zichtbaar maken op paced.nl (2026-11-15)

> Vraag: "ik wil dat je op paced.nl een verwijzing maakt naar de app store"

## Bevinding vooraf
De link bestaat al in `index.html` (statische hero, regel ~606), maar die
hero zit ín `#root` en React leegt `#root` bij mount. Dus:

- crawlers en no-JS-bezoekers zien de knop
- **een echte bezoeker met JavaScript ziet 'm nooit** — na een fractie van
  een seconde staat de onboarding er

Daarom voelt het terecht alsof er geen verwijzing is. Niet "nog toevoegen"
maar "zichtbaar maken binnen de app zelf".

## Plan
- [ ] `AppStoreLink`-component in `app.jsx` — één plek, hergebruikt
- [ ] Gate op `!IS_NATIVE_IOS`: in de iOS-app zelf is "download in de App
      Store" onzin (en een rare noot richting App Review)
- [ ] Plaatsing 1 — onboarding stap 0: rustige regel onder de privacytekst,
      precies waar iemand kiest hoe ze Paced gaat gebruiken
- [ ] Plaatsing 2 — Instellingen, naast de feedback-kaart: blijvend
      vindbaar voor wie de web-app al gebruikt
- [ ] i18n NL + EN
- [ ] Statische hero laten staan (SEO/no-JS blijft nuttig)

## Verificatie
- [ ] `npm test` groen, `node build.mjs` schoon
- [ ] Link zichtbaar in de draaiende app (onboarding + instellingen)
- [ ] href exact `https://apps.apple.com/app/id6804403415`
- [ ] Niet zichtbaar wanneer `IS_NATIVE_IOS` waar is
- [ ] Geen horizontale overflow op 375px

## Niet-doelen
- Geen download-banner of smart-app-banner die de webervaring kaapt
- De web-CTA blijft primair: de PWA werkt ook op Android en desktop

## Rapport (afgerond)

**Root cause:** de link bestond al, maar alleen in de statische hero in
`index.html` — en die hero zit ín `#root`, dat React bij mount leegt. Alleen
crawlers en no-JS-bezoekers zagen 'm; een echte bezoeker nooit. De hero blijft
staan (SEO + no-JS), de verwijzing staat nu óók binnen de app.

Toegevoegd: `AppStoreLink` (één component, `!IS_NATIVE_IOS`), op twee plekken:
- onboarding stap 0, onder de privacyregels
- Instellingen, onder de feedback-knop met een scheidingslijntje

Geverifieerd: 266 tests groen · build schoon · link zichtbaar en aanklikbaar
op beide plekken · href exact `https://apps.apple.com/app/id6804403415` ·
`target="_blank"` + `rel="noopener noreferrer"` · geen console-errors · geen
horizontale overflow op 375px.

Niet opnieuw op een toestel getest: de `IS_NATIVE_IOS`-gate. Dezelfde constante
schakelt al de premium-UI uit en dat is eerder deze sessie op de simulator
bevestigd; de gate hier is één regel (`if (IS_NATIVE_IOS) return null`).
