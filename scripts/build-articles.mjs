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
function pageShell({ locale, title, description, canonical, jsonLd, bodyHtml }) {
  const ld = jsonLd ? `\n  <script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n  </script>` : '';
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#c9768f" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${canonical}" />
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
  if (locale === 'en') {
    return `  <div class="cta">
    <strong>Track your cycle calmly — no account, no tracking.</strong><br/>
    <a class="btn" href="/">Open ${BRAND}</a>
  </div>`;
  }
  return `  <div class="cta">
    <strong>Volg je cyclus rustig — zonder account, zonder tracking.</strong><br/>
    <a class="btn" href="/">Open ${BRAND}</a>
  </div>`;
}

function renderArticle(meta, body, locale) {
  const base = LOCALE_BASE[locale];
  const canonical = `${SITE}/${base}/${meta.slug}`;
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
  let count = 0;

  for (const locale of Object.keys(LOCALE_BASE)) {
    const dir = `${SRC_DIR}/${locale}`;
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
    if (files.length === 0) continue;

    const base = LOCALE_BASE[locale];
    const articles = [];
    for (const file of files) {
      const { meta, body } = parseFrontmatter(readFileSync(`${dir}/${file}`, 'utf8'));
      if (!meta.slug) throw new Error(`${file}: frontmatter needs a slug`);
      mkdirSync(`${distDir}/${base}/${meta.slug}`, { recursive: true });
      writeFileSync(`${distDir}/${base}/${meta.slug}/index.html`, renderArticle(meta, body, locale));
      articles.push(meta);
      urls.push({
        loc: `${SITE}/${base}/${meta.slug}`,
        lastmod: meta.updated || meta.published,
        changefreq: 'monthly',
        priority: '0.7',
      });
      count++;
    }

    // hub
    mkdirSync(`${distDir}/${base}`, { recursive: true });
    writeFileSync(`${distDir}/${base}/index.html`, renderHub(locale, articles));
    urls.push({ loc: `${SITE}/${base}/`, lastmod: '2026-06-16', changefreq: 'weekly', priority: '0.8' });
  }

  writeSitemap(distDir, urls);
  console.log(`• Built ${count} article(s) + hubs → generated sitemap.xml`);
}

// run-if-main
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildArticles('dist');
}
