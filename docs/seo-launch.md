# SEO launch-checklist — paced.nl

Stappen die credentials/accounts vereisen en dus door een mens gedaan worden.
De code-kant (meta, OG, JSON-LD, sitemap, artikellaag, hreflang) staat al live.

---

## 1. Google Search Console — domein verifiëren

Twee methodes. **DNS-TXT** heeft de voorkeur (domein-breed, raakt geen code).

### Methode A — DNS TXT (aanbevolen)
1. Ga naar https://search.google.com/search-console → **Add property** → **Domain** → `paced.nl`.
2. Google toont een TXT-record (`google-site-verification=...`).
3. Voeg dat TXT-record toe bij je DNS-provider (waar `paced.nl` gehost is), op de root (`@`).
4. Wacht tot DNS propageert (minuten–uren) → klik **Verify**.

### Methode B — HTML-tag (alternatief, via code)
1. Search Console → **Add property** → **URL prefix** → `https://paced.nl/`.
2. Kopieer de token uit `<meta name="google-site-verification" content="TOKEN">`.
3. In `index.html` staat dit blok al klaar (gecomment). Haal de comment weg en plak de token:
   ```html
   <meta name="google-site-verification" content="TOKEN" />
   ```
4. `npm run build`, deploy, → **Verify**.

## 2. Bing Webmaster Tools
1. https://www.bing.com/webmasters → site toevoegen `https://paced.nl`.
   (Je kunt vaak importeren vanuit Search Console — scheelt verificatie.)
2. Of via de HTML-tag `<meta name="msvalidate.01" content="TOKEN">` (staat ook klaar in `index.html`).

## 3. Sitemap indienen
- Search Console → **Sitemaps** → dien in: `https://paced.nl/sitemap.xml`
- Bing → idem.
- De sitemap wordt automatisch gegenereerd bij elke build (home + hubs + alle artikelen,
  met trailing-slash URL's). Robots.txt verwijst er al naar.

## 4. Social-preview testen (OG-image)
Na deploy de unfurl-cache van de platforms verversen:
- LinkedIn: https://www.linkedin.com/post-inspector/ → `https://paced.nl/`
- Facebook: https://developers.facebook.com/tools/debug/ → Scrape Again
- X/Twitter: https://cards-dev.twitter.com/validator (of deel een testlink)
- Verwacht: titel, beschrijving en de 1200×630 `og-image.png`.

## 5. Content genereren met Opus (zodra ANTHROPIC_API_KEY beschikbaar is)
Eén commando per taak:
```bash
export ANTHROPIC_API_KEY=sk-ant-...

# tone-of-voice (eenmalig) + template-bibliotheek
npm run content:tov
npm run content:templates                 # of: npm run content:regen -- --category=sleep

# artikel-draft (MDR-veilig, guardrail-gecheckt) — daarna mens-feitencheck
npm run draft:article -- \
  --topic="sporten tijdens je menstruatie" \
  --cluster="Beweging per fase" --locale=nl --slug=sporten-tijdens-menstruatie

# build pakt nieuwe artikelen automatisch op (pagina + hub + sitemap + hreflang)
npm run build
```
Let op: artikel-output is een **draft**. YMYL/MDR → feitencheck vóór publicatie.

## 6. Post-launch monitoring
- Search Console → Performance: impressies/clicks per cluster, gemiddelde positie.
- Maandelijks de "bijna-pagina-1"-queries (positie 8–20) oppakken; bestaande
  artikelen verrijken en `updated`-datum bijwerken.
