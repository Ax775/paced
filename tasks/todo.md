# SEO-optimalisatie Paced — todo

> Doel: maximale vindbaarheid (organisch + social) én conversie, zonder MDR-rode
> lijnen te overschrijden. Domein `https://paced.nl`, publieke naam **Paced**,
> uitgever **Xaven BV** (bron: docs/app-store-metadata.md, capacitor.config.json).

## Vastgestelde uitgangssituatie (codebase)
- `<html lang="nl">` ✓, maar **body = lege `<div id="root">`** → crawlers/social-
  unfurlers (WhatsApp, LinkedIn, iMessage, FB — géén JS) zien NUL content.
- `<head>`: alleen viewport/theme/description (dun, generiek). **Geen** canonical,
  **geen** Open Graph, **geen** Twitter Cards, **geen** JSON-LD.
- robots.txt minimaal (geen Sitemap-directive). **Geen** sitemap.xml.
- Geen OG-/social-share-image (1200×630).
- build.mjs stript alleen dev-scripts → toegevoegde meta/link/JSON-LD + statische
  body-content **overleven de build**. Kopieert manifest/_headers/robots; sitemap
  moet toegevoegd.
- Herbruikbare, MDR-getoetste copy (NL+EN) in docs/app-store-metadata.md.

## MDR-rode lijnen (docs/mdr-positioning.md) — copy mag NOOIT:
diagnose/behandeling/ziektevoorspelling claimen · "vervangt anticonceptie" ·
medisch-hulpmiddel-taal. Positionering = rustige, privacy-first lifestyle/wellness-
tracker; alles op het toestel; geen account/tracking/reclame.

## Stappen (impact-volgorde)
- [ ] **index.html `<head>`** — title (keyword+benefit), sterke description (~155),
      canonical, robots, application-name/author, OG (type/site_name/title/desc/url/
      image/locale nl_NL + alternate en_GB), Twitter summary_large_image.
- [ ] **JSON-LD** in `<head>` — WebSite + Organization (Xaven BV) + SoftwareApplication
      (HealthApplication, gratis offer, inLanguage nl/en, publisher). GEEN nep-rating,
      GEEN FAQPage (guideline-risico + content-mismatch), GEEN medical schema.
- [ ] **index.html `<body>`** — statische SEO-hero in `#root` (H1 + value-prop +
      privacy-features + CTA), die React bij mount vervangt. Crawlers zonder JS
      krijgen echte content; users de app. + `<noscript>` fallback.
- [ ] **robots.txt** — `Sitemap: https://paced.nl/sitemap.xml`.
- [ ] **sitemap.xml** (nieuw) — homepage (SPA: 1 indexeerbare URL).
- [ ] **build.mjs** — sitemap.xml naar dist kopiëren (assets/ al gekopieerd → OG-image meelift).
- [ ] **scripts/generate-og-image.mjs** + `npm run gen:og` — 1200×630 branded PNG →
      assets/og-image.png (sharp, zelfde patroon als gen:icon). Genereren + committen.
- [ ] **manifest.webmanifest** — description aanlijnen met positionering (klein).

## Risico's / niet-doelen
- Geen hreflang naar niet-bestaande per-taal-URLs (SPA = 1 URL, client-side i18n) →
  alleen og:locale + alternate, eerlijk.
- Geen aparte support/privacy-pagina's bouwen (zijn `?legal=`/`?…` query-params).
- Statische hero kort houden (geen duplicate-content-wildgroei); React vervangt 'm.
- Niets dat de gehardende CSP breekt (JSON-LD = inline <script type=ld+json>, geen JS-exec
  → valt buiten script-src hashing? check: build hasht inline <script> zonder type? verifiëren).

## Verificatie
- build draait; dist/index.html bevat canonical/OG/JSON-LD; dist/sitemap.xml aanwezig.
- JSON-LD valide (parse-check). OG-image 1200×630 bestaat.
- Bestaande tests blijven groen; app boot zonder console-errors (preview-rooktest).

## Review (afgerond 2026-06-16)
**Alle stappen klaar, build groen, dist geverifieerd.**

Gewijzigd/nieuw:
- `index.html` `<head>`: keyword+benefit title, sterke description, canonical
  (paced.nl), robots (max-image-preview:large), application-name/author/publisher,
  keywords, volledige Open Graph (incl. og:image 1200×630 + locale nl_NL/en_GB),
  Twitter summary_large_image, JSON-LD @graph (WebSite + Organization Xaven BV +
  SoftwareApplication HealthApplication, gratis offer). Geen nep-rating/FAQ/medical.
- `index.html` `<body>`: statische SEO-hero in #root (H1 + value-prop + 4 privacy-
  features + CTA + MDR-disclaimer) + <noscript>. React vervangt 'm bij mount.
- `robots.txt`: Sitemap-directive. `sitemap.xml` (nieuw): homepage.
- `build.mjs`: sitemap.xml → dist.
- `scripts/generate-og-image.mjs` + `npm run gen:og`: branded 1200×630 PNG
  (sharp, systeem-fonts, icoon gecomposit). `assets/og-image.png` gegenereerd+gecommit.
- `manifest.webmanifest`: name "Paced — Cyclus & Welzijn" + aangelijnde description.

Verificatie:
- `node build.mjs` ✓; CSP nog 4 hashes (JSON-LD = data-blok, niet gehasht, valt buiten script-src).
- dist: canonical/OG/twitter/JSON-LD aanwezig; sitemap.xml + og-image gekopieerd;
  robots-directive aanwezig. JSON-LD parse-valide (3 types).
- Preview (gebouwde app): boot zonder console-errors; rauwe HTML toont hero
  (crawler/no-JS); React vervangt hero → h1Count=1, géén duplicate content;
  sitemap 200 application/xml, og-image 200 image/png.

MDR-veilig: geen diagnose/behandeling/anticonceptie-claims; disclaimer in hero.

Vervolg (buiten scope, optioneel):
- PWA-manifest `screenshots` toevoegen (richer install-UI) — vereist schermafbeeldingen.
- Echte content-/blog-pagina's voor long-tail organisch verkeer (SPA heeft nu 1 URL).
- Google Search Console + Bing Webmaster verifiëren na deploy; sitemap indienen.
