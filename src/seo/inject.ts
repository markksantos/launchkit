import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { ProductSpec, Result } from '../types.js';
import { err, ok } from '../types.js';

export interface SeoInjectOptions {
  /** Root project directory the HTML, sitemap, robots etc. live under. */
  projectRoot: string;
  /** Path to the index.html file relative to projectRoot. */
  htmlPath?: string;
  /** Path to the public folder relative to projectRoot. */
  publicDir?: string;
  /** Existing route paths to include in sitemap (in addition to "/"). */
  extraRoutes?: string[];
}

export interface SeoInjectResult {
  htmlPath: string;
  injected: { jsonLd: boolean; openGraph: boolean; twitter: boolean; canonical: boolean; manifestLink: boolean };
  publicFiles: string[];
}

/**
 * Inject Organization + Product JSON-LD, OG/Twitter meta tags, sitemap.xml,
 * robots.txt, site.webmanifest, and canonical/manifest <link> tags into a
 * project's index.html. Existing schema is preserved (we only add what is
 * missing) so re-running is idempotent.
 */
export function injectSeo(spec: ProductSpec, opts: SeoInjectOptions): Result<SeoInjectResult> {
  const root = resolve(opts.projectRoot);
  const htmlPath = resolve(root, opts.htmlPath ?? 'index.html');
  const publicDir = resolve(root, opts.publicDir ?? 'public');

  let html: string;
  try {
    html = readFileSync(htmlPath, 'utf-8');
  } catch (cause) {
    return err('SEO_HTML_NOT_FOUND', `Could not read ${htmlPath}.`, 'Check that the project has an index.html.', cause);
  }

  const url = `https://${spec.domain}`;
  const ogImage = `${url}/og-image.png`;

  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: spec.name,
    legalName: spec.name,
    url,
    logo: `${url}/${spec.brand.logoPath ?? 'logo.png'}`.replace(/\/+/g, (m) => (m.endsWith(':/') ? m : '/')),
    description: spec.descriptions.twoHundred,
    sameAs: [
      `https://www.linkedin.com/company/${spec.handle}`,
      `https://x.com/${spec.handle}`,
      `https://www.instagram.com/${spec.handle}`,
      `https://www.facebook.com/${spec.handle}`,
      `https://github.com/${spec.github.org}`,
      `https://www.crunchbase.com/organization/${spec.handle}`,
    ],
    contactPoint: spec.support?.email
      ? [
          { '@type': 'ContactPoint', contactType: 'customer support', email: spec.support.email, availableLanguage: 'English' },
        ]
      : undefined,
  };

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: spec.name,
    description: spec.descriptions.twoHundred,
    brand: { '@type': 'Brand', name: spec.name },
    url,
    ...(spec.pricing?.startingPriceUsd !== undefined
      ? {
          offers: {
            '@type': 'Offer',
            price: String(spec.pricing.startingPriceUsd),
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock',
            url,
          },
        }
      : {}),
  };

  const jsonLdBlocks = [
    `<script type="application/ld+json">${JSON.stringify(orgSchema)}</script>`,
    `<script type="application/ld+json">${JSON.stringify(productSchema)}</script>`,
  ].join('\n    ');

  const ogTags = [
    `<meta property="og:title" content="${escapeAttr(spec.name)} — ${escapeAttr(spec.tagline)}" />`,
    `<meta property="og:description" content="${escapeAttr(spec.descriptions.fifty)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}/" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:site_name" content="${escapeAttr(spec.name)}" />`,
    `<meta property="og:locale" content="en_US" />`,
  ].join('\n    ');

  const twitterTags = [
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(spec.name)} — ${escapeAttr(spec.tagline)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(spec.descriptions.fifty)}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
  ].join('\n    ');

  const canonicalTag = `<link rel="canonical" href="${url}/" />`;
  const manifestTag = `<link rel="manifest" href="/site.webmanifest" />`;
  const themeColorTag = `<meta name="theme-color" content="${spec.brand.primaryHex}" />`;

  const injected = {
    jsonLd: !html.includes('application/ld+json'),
    openGraph: !html.includes('property="og:title"'),
    twitter: !html.includes('name="twitter:card"'),
    canonical: !html.includes('rel="canonical"'),
    manifestLink: !html.includes('rel="manifest"'),
  };

  const additions: string[] = [];
  if (injected.jsonLd) additions.push(jsonLdBlocks);
  if (injected.openGraph) additions.push(ogTags);
  if (injected.twitter) additions.push(twitterTags);
  if (injected.canonical) additions.push(canonicalTag);
  if (injected.manifestLink) additions.push(manifestTag);
  if (!html.includes('name="theme-color"')) additions.push(themeColorTag);

  let newHtml = html;
  if (additions.length > 0) {
    const closeHead = newHtml.indexOf('</head>');
    if (closeHead === -1) {
      return err('SEO_NO_HEAD', `${htmlPath} has no </head> tag.`, 'Pass an HTML file with a proper head.');
    }
    newHtml = newHtml.slice(0, closeHead) + `    ${additions.join('\n    ')}\n  ` + newHtml.slice(closeHead);
    writeFileSync(htmlPath, newHtml, 'utf-8');
  }

  // Public files: sitemap, robots, manifest.
  mkdirSync(publicDir, { recursive: true });
  const publicFiles: string[] = [];

  const sitemapPath = resolve(publicDir, 'sitemap.xml');
  writeFileSync(sitemapPath, renderSitemap(url, opts.extraRoutes ?? []), 'utf-8');
  publicFiles.push(sitemapPath);

  const robotsPath = resolve(publicDir, 'robots.txt');
  writeFileSync(robotsPath, renderRobots(url), 'utf-8');
  publicFiles.push(robotsPath);

  const manifestPath = resolve(publicDir, 'site.webmanifest');
  writeFileSync(manifestPath, renderManifest(spec), 'utf-8');
  publicFiles.push(manifestPath);

  return ok({ htmlPath, injected, publicFiles });
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderSitemap(baseUrl: string, routes: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const all = ['/', ...routes];
  const urls = all
    .map((r) => `  <url>\n    <loc>${baseUrl}${r === '/' ? '/' : r}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${r === '/' ? '1.0' : '0.7'}</priority>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function renderRobots(baseUrl: string): string {
  return `# launchkit-generated robots.txt — adjust per-product if you have private routes.\nUser-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

function renderManifest(spec: ProductSpec): string {
  return JSON.stringify(
    {
      name: spec.name,
      short_name: spec.name,
      description: spec.descriptions.fifty,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: spec.brand.primaryHex,
      icons: [
        {
          src: spec.brand.logoPath ?? '/favicon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
        },
      ],
    },
    null,
    2,
  );
}

// Suppress the unused-variable lint for the helper imported for future use.
void dirname;
