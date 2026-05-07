import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { injectSeo } from '../src/seo/inject.js';
import type { ProductSpec } from '../src/types.js';

const SPEC: ProductSpec = {
  name: 'TestProduct',
  domain: 'testproduct.com',
  tagline: 'A simple tagline of six words',
  descriptions: {
    fifty: 'a'.repeat(60),
    hundred: 'b'.repeat(120),
    twoHundred: 'c'.repeat(220),
  },
  category: 'saas',
  audience: 'Indie hackers.',
  useCase: 'A weekend launch.',
  founder: { name: 'Test User' },
  handle: 'testproduct',
  github: { org: 'testorg', repo: 'testproduct' },
  brand: { primaryHex: '#112233', accentHex: '#445566' },
  targetLaunchDate: '2026-12-31',
  support: { email: 'support@testproduct.com' },
};

const STARTER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Existing title — do not overwrite</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe('injectSeo', () => {
  it('adds JSON-LD, OG, Twitter, canonical, manifest tags into a fresh page', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'launchkit-seo-'));
    writeFileSync(resolve(root, 'index.html'), STARTER_HTML);
    const r = injectSeo(SPEC, { projectRoot: root });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const html = readFileSync(resolve(root, 'index.html'), 'utf-8');
      expect(html).toContain('application/ld+json');
      expect(html).toContain('property="og:title"');
      expect(html).toContain('name="twitter:card"');
      expect(html).toContain('rel="canonical"');
      expect(html).toContain('rel="manifest"');
      expect(html).toContain('name="theme-color"');
      // Existing title is preserved.
      expect(html).toContain('Existing title — do not overwrite');
      // Public files are written.
      expect(existsSync(resolve(root, 'public/sitemap.xml'))).toBe(true);
      expect(existsSync(resolve(root, 'public/robots.txt'))).toBe(true);
      expect(existsSync(resolve(root, 'public/site.webmanifest'))).toBe(true);
    }
  });

  it('is idempotent — re-running does not duplicate tags', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'launchkit-seo-'));
    writeFileSync(resolve(root, 'index.html'), STARTER_HTML);
    injectSeo(SPEC, { projectRoot: root });
    const after1 = readFileSync(resolve(root, 'index.html'), 'utf-8');
    injectSeo(SPEC, { projectRoot: root });
    const after2 = readFileSync(resolve(root, 'index.html'), 'utf-8');
    expect(after1).toBe(after2);
  });

  it('reports HTML missing </head> as a clear error', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'launchkit-seo-'));
    writeFileSync(resolve(root, 'index.html'), '<!doctype html><html><body></body></html>');
    const r = injectSeo(SPEC, { projectRoot: root });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SEO_NO_HEAD');
  });

  it('preserves existing schema if present', () => {
    const html = STARTER_HTML.replace(
      '</head>',
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Existing"}</script></head>',
    );
    const root = mkdtempSync(resolve(tmpdir(), 'launchkit-seo-'));
    writeFileSync(resolve(root, 'index.html'), html);
    const r = injectSeo(SPEC, { projectRoot: root });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const after = readFileSync(resolve(root, 'index.html'), 'utf-8');
      expect(after).toContain('"name":"Existing"');
      // injected.jsonLd should be false because we preserved existing schema.
      expect(r.value.injected.jsonLd).toBe(false);
    }
  });
});
