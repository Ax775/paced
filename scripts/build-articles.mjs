/**
 * build-articles.mjs — static article generator (SEO content layer).
 * ------------------------------------------------------------------
 * Turns content/articles/<locale>/<slug>.md into real static HTML pages under
 * dist/artikelen/<slug>/ (nl) and dist/articles/<slug>/ (en), plus a hub page
 * per locale, plus a generated sitemap.xml. These are crawlable WITHOUT
 * JavaScript — the whole point: long-tail organic pages a CSR SPA can't offer.
 *
 * Called from build.mjs after static assets are copied. Standalone runnable:
 *   node scripts/build-articles.mjs           # writes into ./dist
 *
 * No inline executable scripts are emitted (JSON-LD is a data block), so the
 * hardened production CSP needs no extra hashes for these pages.
 */
import { marked } from 'marked';
import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync,
} from 'node:fs';

const SITE = 'https://paced.nl';
const BRAND = 'Paced';
const PUBLISHER = 'Xaven BV';
// Locale-neutraal: Apple routeert zelf naar de landstore van de bezoeker.
// Spiegelt APP_STORE_URL in src/config/brand.js (de app-bundel kan hier niet
// bij, want dit script draait in Node vóór de bundle bestaat).
const APP_STORE_URL = 'https://apps.apple.com/app/id6804403415';
const SRC_DIR = 'content/articles';
const LOCALE_BASE = { nl: 'artikelen', en: 'articles' };
const HUB_TITLE = { nl: 'Artikelen', en: 'Articles' };
const HUB_INTRO = {
  nl: 'Rustige, eerlijke artikelen over je cyclus, voeding, slaap en welzijn — zonder dieetcultuur en zonder medische claims.',
  en: 'Calm, honest articles about your cycle, nutrition, sleep and wellbeing — without diet culture or medical claims.',
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal frontmatter parser: `---` block of flat `key: value` lines. */
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('article missing frontmatter');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    meta[key] = val;
  }
  return { meta, body: m[2] };
}

/** Shared <head> + chrome for every article/hub page. */
function pageShell({ locale, title, description, canonical, jsonLd, bodyHtml, alternates = [] }) {
  // <-escape voorkomt een </script>-breakout: frontmatter-tekst belandt
  // via JSON.stringify in dit blok en zou anders rauwe HTML kunnen injecteren.
  const ld = jsonLd
    ? `\n  <script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2).replace(/</g, '\\u003c')}\n  </script>`
    : '';
  const alt = alternates.map((a) => `\n  <link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`).join('');
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#c9768f" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${canonical}" />${alt}
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="author" content="${PUBLISHER}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${BRAND}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${SITE}/assets/og-image.png" />
  <meta property="og:locale" content="${locale === 'en' ? 'en_GB' : 'nl_NL'}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${SITE}/assets/og-image.png" />
  <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />${ld}
  <style>
    :root { color-scheme: light; }
    body { margin:0; background:#FBF9F3; color:#3E3B33; font-family:Inter,system-ui,sans-serif; line-height:1.65; }
    .wrap { max-width:44rem; margin:0 auto; padding:1.5rem; }
    a { color:#B06849; }
    header.site { display:flex; justify-content:space-between; align-items:center; padding:1rem 1.5rem; max-width:44rem; margin:0 auto; }
    header.site .brand { font-family:Fraunces,Georgia,serif; font-weight:700; font-size:1.25rem; color:#2A2823; text-decoration:none; }
    article h1, .hub h1 { font-family:Fraunces,Georgia,serif; color:#2A2823; line-height:1.2; font-size:2rem; }
    article h2 { font-family:Fraunces,Georgia,serif; color:#2A2823; margin-top:2rem; font-size:1.4rem; }
    article ul { padding-left:1.2rem; }
    .crumbs { font-size:.85rem; color:#8B8578; margin-bottom:1rem; }
    .cta { display:block; background:#fff; border:1px solid #E2D8BE; border-radius:1.25rem; padding:1.25rem 1.5rem; margin:2.5rem 0; text-align:center; }
    .cta a.btn { display:inline-block; background:#B06849; color:#fff; text-decoration:none; font-weight:600; padding:.7rem 1.5rem; border-radius:1rem; margin-top:.5rem; }
    .cta-alt { margin-top:.7rem; font-size:.85rem; }
    footer.site { font-size:.8rem; color:#8B8578; border-top:1px solid #EDE6D3; margin-top:2.5rem; padding:1.5rem; max-width:44rem; margin-left:auto; margin-right:auto; }
    .hub li { margin:.4rem 0; }
  </style>
</head>
<body>
  <header class="site">
    <a class="brand" href="/">${BRAND}</a>
    <a href="/${LOCALE_BASE[locale]}/">${HUB_TITLE[locale]}</a>
  </header>
  <div class="wrap">
${bodyHtml}
  </div>
  <footer class="site">
    ${BRAND} is een tracking- en bewustwordingsapp, geen medisch hulpmiddel en geen vervanging
    voor medisch advies. Uitgegeven door ${PUBLISHER}, Nederland.
  </footer>
</body>
</html>
`;
}

function ctaBlock(locale) {
  // Web-CTA blijft primair (de PWA werkt overal, ook op Android/desktop);
  // de App Store is een secundaire route voor iPhone-lezers.
  if (locale === 'en') {
    return `  <div class="cta">
    <strong>Track your cycle calmly — no account, no tracking.</strong><br/>
    <a class="btn" href="/">Open ${BRAND}</a>
    <div class="cta-alt"><a href="${APP_STORE_URL}">Or download the iPhone app →</a></div>
  </div>`;
  }
  return `  <div class="cta">
    <strong>Volg je cyclus rustig — zonder account, zonder tracking.</strong><br/>
    <a class="btn" href="/">Open ${BRAND}</a>
    <div class="cta-alt"><a href="${APP_STORE_URL}">Of download de iPhone-app →</a></div>
  </div>`;
}

function renderArticle(meta, body, locale, alternates = []) {
  const base = LOCALE_BASE[locale];
  // Trailing slash: Cloudflare Pages serves the directory index at /slug/ (200)
  // and 308-redirects /slug → /slug/. Canonical/og/JSON-LD must point at the
  // final, non-redirecting URL, so we keep the slash everywhere.
  const canonical = `${SITE}/${base}/${meta.slug}/`;
  const html = marked.parse(body);
  // Split after the first </h2> so the CTA sits mid-article, else append.
  const splitAt = html.indexOf('</h2>');
  const withCta =
    splitAt === -1
      ? `${html}\n${ctaBlock(locale)}`
      : `${html.slice(0, splitAt + 5)}\n${ctaBlock(locale)}\n${html.slice(splitAt + 5)}`;

  const crumbs = `<nav class="crumbs"><a href="/">${BRAND}</a> › <a href="/${base}/">${HUB_TITLE[locale]}</a> › ${esc(meta.title)}</nav>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: meta.title,
        description: meta.description,
        inLanguage: locale === 'en' ? 'en-GB' : 'nl-NL',
        datePublished: meta.published,
        dateModified: meta.updated || meta.published,
        image: `${SITE}${meta.image || '/assets/og-image.png'}`,
        mainEntityOfPage: canonical,
        author: { '@type': 'Organization', name: PUBLISHER },
        publisher: {
          '@type': 'Organization',
          name: PUBLISHER,
          logo: { '@type': 'ImageObject', url: `${SITE}/assets/icon-512.png` },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: BRAND, item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: HUB_TITLE[locale], item: `${SITE}/${base}/` },
          { '@type': 'ListItem', position: 3, name: meta.title, item: canonical },
        ],
      },
    ],
  };

  return pageShell({
    locale,
    title: meta.title,
    description: meta.description,
    canonical,
    jsonLd,
    alternates,
    bodyHtml: `${crumbs}\n  <article>\n${withCta}\n  </article>`,
  });
}

function renderHub(locale, articles) {
  const base = LOCALE_BASE[locale];
  const canonical = `${SITE}/${base}/`;
  const byCluster = {};
  for (const a of articles) (byCluster[a.cluster || 'Overig'] ||= []).push(a);
  const sections = Object.entries(byCluster)
    .map(
      ([cluster, items]) =>
        `<h2>${esc(cluster)}</h2>\n<ul>\n${items
          .map((a) => `  <li><a href="/${base}/${a.slug}">${esc(a.title)}</a></li>`)
          .join('\n')}\n</ul>`,
    )
    .join('\n');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${HUB_TITLE[locale]} — ${BRAND}`,
    url: canonical,
    inLanguage: locale === 'en' ? 'en-GB' : 'nl-NL',
  };

  return pageShell({
    locale,
    title: `${HUB_TITLE[locale]} — ${BRAND}`,
    description: HUB_INTRO[locale],
    canonical,
    jsonLd,
    bodyHtml: `<div class="hub">\n  <h1>${HUB_TITLE[locale]}</h1>\n  <p>${esc(HUB_INTRO[locale])}</p>\n${sections}\n</div>`,
  });
}

function writeSitemap(distDir, urls) {
  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
    )
    .join('\n');
  writeFileSync(
    `${distDir}/sitemap.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
  );
}

export function buildArticles(distDir = 'dist') {
  const urls = [{ loc: `${SITE}/`, lastmod: '2026-06-16', changefreq: 'monthly', priority: '1.0' }];

  // ── Pass 1: read every article (all locales) and index by translationKey ──
  const items = []; // { locale, base, meta, body }
  const byKey = {}; // translationKey → [{ locale, href }]
  for (const locale of Object.keys(LOCALE_BASE)) {
    const dir = `${SRC_DIR}/${locale}`;
    if (!existsSync(dir)) continue;
    const base = LOCALE_BASE[locale];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const { meta, body } = parseFrontmatter(readFileSync(`${dir}/${file}`, 'utf8'));
      if (!meta.slug) throw new Error(`${file}: frontmatter needs a slug`);
      // Slug gaat rauw in href-attributen, <loc>-XML én mkdirSync-paden:
      // strikte validatie sluit attribuut-/XML-injectie en path traversal
      // in één keer uit.
      if (!/^[a-z0-9-]+$/.test(meta.slug)) {
        throw new Error(`${file}: slug "${meta.slug}" must be kebab-case ([a-z0-9-])`);
      }
      // Ruwe HTML met scriptcapaciteit hoort niet in artikel-markdown thuis —
      // committers zijn vertrouwd, maar AI-gedrafte bodies kunnen per ongeluk
      // HTML bevatten. Falen bij de bouw is goedkoper dan saneren bij runtime.
      if (/<\s*(script|iframe|object|embed)\b/i.test(body)) {
        throw new Error(`${file}: raw <script>/<iframe>-style HTML is not allowed in article markdown`);
      }
      items.push({ locale, base, meta, body });
      if (meta.translationKey) {
        (byKey[meta.translationKey] ||= []).push({ locale, href: `${SITE}/${base}/${meta.slug}/` });
      }
    }
  }

  // ── Pass 2: render each article with hreflang alternates for its key-mates ──
  let count = 0;
  for (const { locale, base, meta, body } of items) {
    const peers = meta.translationKey ? byKey[meta.translationKey] : null;
    const alternates =
      peers && peers.length > 1
        ? [
            ...peers.map((p) => ({ hreflang: p.locale, href: p.href })),
            // x-default points at the NL version (primary market), else self.
            { hreflang: 'x-default', href: (peers.find((p) => p.locale === 'nl') || peers[0]).href },
          ]
        : [];

    mkdirSync(`${distDir}/${base}/${meta.slug}`, { recursive: true });
    writeFileSync(`${distDir}/${base}/${meta.slug}/index.html`, renderArticle(meta, body, locale, alternates));
    urls.push({
      loc: `${SITE}/${base}/${meta.slug}/`,
      lastmod: meta.updated || meta.published,
      changefreq: 'monthly',
      priority: '0.7',
    });
    count++;
  }

  // ── Hubs (one per locale that has articles) ──
  for (const locale of Object.keys(LOCALE_BASE)) {
    const base = LOCALE_BASE[locale];
    const articles = items.filter((i) => i.locale === locale).map((i) => i.meta);
    if (articles.length === 0) continue;
    mkdirSync(`${distDir}/${base}`, { recursive: true });
    writeFileSync(`${distDir}/${base}/index.html`, renderHub(locale, articles));
    urls.push({ loc: `${SITE}/${base}/`, lastmod: '2026-06-16', changefreq: 'weekly', priority: '0.8' });
  }

  // ── /support/ — vereist door de App Store-vermelding (Support URL) ──
  mkdirSync(`${distDir}/support`, { recursive: true });
  writeFileSync(`${distDir}/support/index.html`, pageShell({
    locale: 'nl',
    title: `Support — ${BRAND}`,
    description: `Hulp nodig met ${BRAND}? Antwoorden op veelgestelde vragen en direct contact — we reageren snel.`,
    canonical: `${SITE}/support/`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: `Support — ${BRAND}`,
      url: `${SITE}/support/`,
      inLanguage: 'nl-NL',
    },
    bodyHtml: `<div class="hub">
  <h1>Support</h1>
  <p>Vragen over ${BRAND}, iets dat niet werkt, of een idee? We horen het graag en
  reageren doorgaans binnen een paar dagen.</p>
  <div class="cta">
    <strong>Mail ons — we lezen alles zelf.</strong><br/>
    <a class="btn" href="mailto:info@xaven.io?subject=${encodeURIComponent(`Supportvraag ${BRAND}`)}">info@xaven.io</a>
    <div class="cta-alt"><a href="${APP_STORE_URL}">${BRAND} voor iPhone in de App Store →</a></div>
  </div>
  <h2>Veelgestelde vragen</h2>
  <p><strong>Waar staan mijn gegevens?</strong><br/>
  Uitsluitend lokaal op je eigen toestel. ${BRAND} heeft geen accounts, geen cloud en
  geen tracking — wij kunnen je gegevens niet zien. Exporteren (CSV, JSON, Apple
  Health) of alles wissen doe je in de app via <em>Instellingen</em>.</p>
  <p><strong>Ik wissel van telefoon — raak ik mijn data kwijt?</strong><br/>
  Maak in <em>Instellingen</em> een volledige export (JSON) en zet die op je nieuwe
  toestel terug.</p>
  <p><strong>Feedback geven?</strong><br/>
  Kan direct vanuit de app: <em>Instellingen → Feedback</em>. Of mail ons via de knop
  hierboven.</p>
  <p><strong>Privacy &amp; disclaimer</strong><br/>
  De volledige privacyverklaring en medische disclaimer vind je in de app onder
  <em>Instellingen</em>, of via <a href="/?legal=privacy">deze link</a>. ${BRAND} is een
  tracking- en bewustwordingsapp, geen medisch hulpmiddel.</p>
  <p><em>Questions in English? Email us at info@xaven.io — happy to help.</em></p>
</div>`,
  }));
  urls.push({ loc: `${SITE}/support/`, lastmod: '2026-08-23', changefreq: 'yearly', priority: '0.5' });

  writeSitemap(distDir, urls);
  console.log(`• Built ${count} article(s) + hubs + /support/ → generated sitemap.xml`);

  // 404.html: zonder dit bestand serveert Cloudflare Pages op onbekende paden
  // de app-shell met status 200 (SPA-fallback) — een soft-404 die zoekmachines
  // vervuilt. De app routeert uitsluitend via "/" + query/hash, dus een echte
  // 404-pagina breekt niets.
  writeFileSync(`${distDir}/404.html`, pageShell({
    locale: 'nl',
    title: `Pagina niet gevonden — ${BRAND}`,
    description: 'Deze pagina bestaat niet (meer).',
    canonical: `${SITE}/`,
    jsonLd: null,
    bodyHtml: `<div class="hub">
  <h1>Pagina niet gevonden</h1>
  <p>Deze pagina bestaat niet (meer). Misschien zoek je een van deze plekken:</p>
  <ul>
    <li><a href="/">De app — volg je cyclus, zonder account</a></li>
    <li><a href="/artikelen/">Artikelen (Nederlands)</a></li>
    <li><a href="/articles/">Articles (English)</a></li>
  </ul>
</div>`,
  }).replace('<meta name="robots" content="index, follow, max-image-preview:large" />',
             '<meta name="robots" content="noindex" />'));
  console.log('• Wrote 404.html (echte 404 i.p.v. SPA-fallback)');
}

// run-if-main
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildArticles('dist');
}
