# SEO-contentplan Paced — long-tail organisch verkeer

> Doel: van 1 indexeerbare URL naar een content-cluster dat informatieve zoekers
> binnenhaalt (top-funnel) en doorleidt naar de app (bottom-funnel, conversie).
> Markt: NL primair, EN secundair. Domein paced.nl. Uitgever Xaven BV.
> **Harde grens: MDR** — lifestyle/wellness, nooit diagnose/behandeling/voorspelling
> (zie docs/mdr-positioning.md). Dit is bovendien **YMYL-content** → Google eist
> hoge E-E-A-T; trust-signalen zijn geen extraatje maar voorwaarde om te ranken.

---

## 1. Architectuur — hoe content-pagina's in een CSR-SPA passen

Probleem: de app is client-rendered (React via esbuild-bundle). Eén URL, JS-afhankelijk.
Voor SEO moeten artikelen **echte statische HTML** zijn (geen JS-afhankelijkheid,
zoals de hero-fix die we net deden, maar dan volwaardige pagina's).

**Aanbevolen: lichte SSG-stap in de bestaande build** (geen framework — past bij
de vanilla/esbuild-setup, minimale impact).

- Bron: `content/articles/<locale>/<slug>.md` (Markdown + frontmatter:
  title, description, slug, locale, cluster, keywords, published, updated, hreflang-pair).
- Build-stap (`scripts/build-articles.mjs`, aangeroepen vanuit `build.mjs`):
  Markdown → statische HTML met dezelfde SEO-`<head>` als index.html
  (canonical, OG, Twitter, **JSON-LD `BlogPosting`/`Article` + `BreadcrumbList`**),
  + gedeelde header/footer + CTA naar de app.
- URL-structuur: `/artikelen/<slug>` (NL), `/articles/<slug>` (EN) + hub-pagina's
  `/artikelen/` en `/articles/`.
- **hreflang**: nu wél eerlijk mogelijk — elk NL-artikel met EN-tegenhanger krijgt
  `<link rel="alternate" hreflang="nl" …>` / `hreflang="en"` / `x-default`.
- `sitemap.xml`: uitbreiden zodat de build álle artikel-URL's + hubs genereert
  (sitemap wordt dan generated i.p.v. statisch).
- Interne links: elk artikel linkt naar (a) zijn pillar, (b) 2-3 spokes, (c) de app-CTA.

**Niet doen:** Next/Astro/SSR introduceren (te zwaar, breekt de simpele setup);
client-side routing voor artikelen (dan blijft het JS-afhankelijk → geen SEO-winst).

---

## 2. Meekoppeling met de bestaande content-pipeline

De offline Opus-pipeline (`scripts/generate-*.mjs`, `content/tone-of-voice.md`,
`src/lib/content/guardrails.js`) is al MDR-veilig en NL+EN. Hergebruik:

- **Drafts genereren**: een artikel-generator die per keyword-cluster een concept
  schrijft met `tone-of-voice.md` als system-context, daarna door `checkGuardrails`
  (geen calorie-getallen, geen diagnose, geen schaamte/dieetcultuur).
- **Mens-in-de-loop verplicht**: AI-draft → redactie/feitencheck → publicatie.
  YMYL + MDR = geen onbewerkte AI-output live.

---

## 3. Keyword-strategie — topic clusters (pillar → spokes)

Clusters sluiten 1:1 aan op de 7 pipeline-categorieën. Intent loopt van informatief
(top, volume, autoriteit) naar privacy (bottom, conversie).

| Cluster (pillar) | Voorbeeld-spokes (long-tail) | Intent |
|---|---|---|
| **De 4 cyclusfases** | "folliculaire fase wat is dat", "luteale fase symptomen", "wat gebeurt er tijdens de eisprong" | informatief |
| **Cyclus-bewuste voeding** | "eten tijdens menstruatie", "voeding luteale fase", "wat eten rond de eisprong" | informatief→commercieel |
| **Beweging per fase** | "sporten tijdens menstruatie", "trainen luteale fase", "mag je sporten met de eisprong" | informatief |
| **Slaap & cyclus** | "slecht slapen voor menstruatie", "slaap luteale fase", "moe rond je menstruatie" | informatief |
| **Mindfulness & welzijn** | "stemming voor menstruatie", "zacht zijn voor jezelf PMS", "rust nemen tijdens cyclus" | informatief |
| **Privacy & cyclus-apps** | "cyclus tracker zonder account", "menstruatie-app die data niet verkoopt", "period tracker offline/privacy" | **bottom-funnel (converteert)** | 

Strategie: informatieve spokes brengen verkeer + autoriteit; elke spoke linkt door
naar het **privacy-cluster** en de **app-CTA**. Het privacy-cluster is Paced's
unfaire voordeel — daar is de zoekintentie precies de positionering.

Voorbeeld-mapping per artikel: 1 primair keyword + 2-4 semantisch verwante; titel
≤60 tekens met keyword vooraan; H2's dekken de "people also ask"-subvragen.

---

## 4. On-page SEO per artikel (sjabloon)

- `<title>`: primair keyword + merk, ≤60 tekens.
- meta description: ~150 tekens, met de privacy-/rust-hook, klikgericht.
- H1 = primair keyword; H2/H3 = subvragen (PAA-dekking).
- JSON-LD `BlogPosting` (headline, datePublished/Modified, author=Xaven BV,
  publisher met logo, inLanguage, image) + `BreadcrumbList`.
- **E-E-A-T-signalen** (cruciaal voor YMYL): zichtbare auteur/uitgever, "laatst
  bijgewerkt"-datum, bronvermelding (bv. Voedingscentrum, betrouwbare bronnen),
  en de MDR-disclaimer ("geen medisch hulpmiddel / raadpleeg een arts").
- Interne links (pillar + 2-3 spokes) + **1 duidelijke app-CTA** ("Volg je cyclus
  rustig in Paced — zonder account").
- Afbeelding met beschrijvende alt; OG-image per artikel (kan generiek = bestaande).

---

## 5. Roadmap (gefaseerd)

**Fase 0 — infra (1 stap, eenmalig).**
`scripts/build-articles.mjs` + hub-template + generated sitemap + hreflang + JSON-LD.
1 voorbeeld-artikel end-to-end om de pijplijn te bewijzen.

**Fase 1 — cornerstone (NL, ~8-10 artikelen).**
Per cluster 1 pillar + de 2-3 hoogste-volume spokes. Begin met het **privacy-cluster**
(snelste conversie) + de **cyclusfases** (hoogste volume, voedt alle andere).

**Fase 2 — uitbreiden + EN.**
Resterende spokes; EN-vertalingen van de best presterende NL-artikelen (met hreflang).

**Fase 3 — onderhoud.**
Search Console-queries → bestaande artikelen verrijken/updaten ("laatst bijgewerkt"
verhoogt YMYL-vertrouwen); interne links bijwerken.

---

## 6. Meten

- Na deploy: Search Console + Bing Webmaster verifiëren, sitemap indienen.
- KPI's: impressies/clicks per cluster, gemiddelde positie op primaire keywords,
  click-through van artikel → app (CTA), assisterende conversies.
- Iteratie-ritme: maandelijks de "bijna-pagina-1"-queries (positie 8-20) oppakken.

---

## 7. Risico's / niet-doelen

- **MDR/YMYL**: nooit diagnostische of behandel-taal; alles door guardrails + redactie.
- **Thin/AI-content**: AI-draft is startpunt, niet eindproduct; mens-in-de-loop verplicht.
- **Duplicate content**: pillar/spokes onderscheidend houden; canonical correct.
- **Scope-creep**: geen CMS/framework; statische generatie binnen de huidige build.

---

## Status
- **Fase 0 — KLAAR (2026-06-16).** SSG-infra gebouwd + geverifieerd:
  `scripts/build-articles.mjs` (Markdown→statische HTML, hub per locale, JSON-LD
  BlogPosting+BreadcrumbList, generated sitemap), gewired in `build.mjs`,
  `marked` als devDep. Voorbeeldartikel `content/articles/nl/cyclus-tracker-
  zonder-account.md` → `/artikelen/cyclus-tracker-zonder-account` (200, geen JS
  nodig, CTA + breadcrumbs, valide JSON-LD). Sitemap bevat home + hub + artikel.
  CSP onveranderd (artikelpagina's hebben geen inline-scripts).
- Keuzes bevestigd: **NL-first**, **AI-draft + redactie**.
- **Volgende: Fase 1** — per cluster pillar + 2-3 spokes; starten met privacy +
  cyclusfases. Drafts via de Opus-pipeline, daarna redactie/feitencheck.

## Beslissingen die ik van je nodig heb vóór Fase 0/1
1. Start NL-only of meteen NL+EN? (advies: NL-first, EN in Fase 2)
2. AI-draft via de Opus-pipeline + jouw redactie, of zelf schrijven? (advies: AI-draft + redactie)
3. Wil je dat ik Fase 0 (de build-infra + 1 voorbeeld-artikel) nu bouw?
