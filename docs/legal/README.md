# Aura — Juridische documenten

Concept-teksten voor publicatie. **Nog niet juridisch gereviewd**: laat
deze documenten checken door een privacyjurist of DPO voordat je ze
live zet, en zeker voordat publieke gebruikers data invoeren.

## Documenten

| Bestand | Doel | Verplicht? |
|---------|------|------------|
| [`privacyverklaring.md`](./privacyverklaring.md) | AVG art. 13/14 — informatie aan betrokkene | Ja, vóór elke verwerking |
| [`medische-disclaimer.md`](./medische-disclaimer.md) | Wellness-app afbakening + medische context | Ja, in-app zichtbaar |
| [`colofon.md`](./colofon.md) | Wet elektronische handel (BW art. 3:15d) — identiteitsvermelding | Ja, op site |
| [`dpia.md`](./dpia.md) | AVG art. 35 — Data Protection Impact Assessment | Ja, intern + op verzoek AP |
| [`verwerkingsregister.md`](./verwerkingsregister.md) | AVG art. 30 — register van verwerkingsactiviteiten | Ja, intern + op verzoek AP |

## Placeholders

In de teksten staan `[INVUL: …]` markers waar concrete feiten ontbreken.
Verzamel deze gegevens vóór review:

- Rechtsvorm (eenmanszaak / BV / stichting / vereniging)
- KvK-nummer
- Volledig postadres verwerkingsverantwoordelijke
- BTW-nummer (indien BTW-plichtig)
- Contact-email voor privacyverzoeken (idealiter `privacy@<domein>`)
- Algemeen contact-emailadres
- Domeinnaam waarop de app wordt gehost
- Naam + locatie hostingpartij (Cloudflare / Netlify / Vercel / Hetzner / …)
- Eventueel: naam DPO / Privacy Officer (alleen verplicht bij grootschalige
  verwerking van bijz. categorieën — bij Aura kan dit relevant worden)

## Workflow naar livegang

1. Vul de placeholders in
2. Stuur de teksten naar een privacyjurist (gespecialiseerd in AVG +
   gezondheidsdata). Verwacht 1–2 ronden feedback.
3. Genereer HTML-versies vanuit deze markdown (bv. via `markdown-it`
   of de Vite Markdown plugin) en zet ze onder `public/legal/`
4. Activeer de in-app links in `Settings → Juridisch`
5. Voeg een **acceptance-checkbox** toe in de eerste onboarding-stap:
   "Ik heb de privacyverklaring en medische disclaimer gelezen"
6. Bewaar het tijdstip van acceptance in `aura.profile.legalAcceptedAt`
   (al ondersteund in storage-laag)

## Versionering

Gebruik de variabele `LEGAL_VERSION` in de privacyverklaring (top van
het document) om bij toekomstige wijzigingen na te kunnen gaan welke
versie de gebruiker accepteerde. Bij een materiële wijziging:

- Bump het versienummer
- Toon een pop-up met "wat is er veranderd"-samenvatting
- Vraag opnieuw om akkoord
