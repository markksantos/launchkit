import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { generateAllContent } from '../src/content/generate.js';
import { scanForBanned } from '../src/content/banned-words.js';
import type { ProductSpec } from '../src/types.js';

const SPEC: ProductSpec = {
  name: 'TestProduct',
  domain: 'testproduct.com',
  tagline: 'A simple tagline of six words',
  descriptions: {
    fifty: 'TestProduct is a sample product used by launchkit tests to verify content generation across formats and platforms with all banned phrases scrubbed.',
    hundred: 'TestProduct is a sample product used by launchkit tests to verify content generation across multiple platforms. The hundred-word description threads through the launch tweet thread, the LinkedIn post, and the longer Show HN body.',
    twoHundred: 'TestProduct is a sample product used by launchkit tests to verify the entire content pipeline. The descriptions are deliberately mundane and concrete; they test that the generator threads the spec into every platform without inventing details and without producing any banned AI-giveaway phrases that would mark the output as machine-written.',
  },
  category: 'saas',
  audience: 'Indie hackers shipping side projects.',
  useCase: 'They want every launch artifact ready in one command.',
  founder: { name: 'Test User' },
  handle: 'testproduct',
  github: { org: 'testorg', repo: 'testproduct' },
  brand: { primaryHex: '#112233', accentHex: '#445566' },
  targetLaunchDate: '2026-12-31',
  subreddits: ['r/SideProject', 'r/IndieDev'],
};

describe('generateAllContent', () => {
  it('writes one file per format plus one per subreddit', () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-content-'));
    const r = generateAllContent(SPEC, out);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const files = readdirSync(resolve(out, 'content'));
      expect(files).toContain('launch-tweet-thread.md');
      expect(files).toContain('linkedin-launch.md');
      expect(files).toContain('show-hn.md');
      expect(files).toContain('product-hunt.md');
      expect(files).toContain('blog-launch.md');
      expect(files).toContain('newsletter-pitch.md');
      expect(files).toContain('reddit-sideproject.md');
      expect(files).toContain('reddit-indiedev.md');
      // 6 standard + 2 reddit
      expect(files.length).toBe(8);
    }
  });

  it('every file is free of banned AI-giveaway phrases', () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-content-'));
    const r = generateAllContent(SPEC, out);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const dir = resolve(out, 'content');
      for (const f of readdirSync(dir)) {
        const text = readFileSync(resolve(dir, f), 'utf-8');
        const hits = scanForBanned(text);
        expect(hits, `banned phrases in ${f}: ${hits.map((h) => h.phrase).join(', ')}`).toHaveLength(0);
      }
    }
  });

  it('falls back to category default subreddits when none in spec', () => {
    const noSubsSpec = { ...SPEC, subreddits: undefined } as ProductSpec;
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-content-'));
    const r = generateAllContent(noSubsSpec, out);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const files = readdirSync(resolve(out, 'content'));
      const redditCount = files.filter((f) => f.startsWith('reddit-')).length;
      expect(redditCount).toBe(5); // CATEGORY_DEFAULT_SUBS for saas → 5
    }
  });
});

describe('tweet thread length', () => {
  it('every tweet stays at or under 280 chars', () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-content-'));
    const r = generateAllContent(SPEC, out);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const text = readFileSync(resolve(out, 'content', 'launch-tweet-thread.md'), 'utf-8');
      // Each tweet body lives between "## Tweet N (X/280)" header and the next "## " or EOF.
      const tweets = [...text.matchAll(/## Tweet \d+ \((\d+)\/280\)\n\n([\s\S]*?)(?=\n\n## |\n*$)/g)];
      expect(tweets.length).toBeGreaterThanOrEqual(5);
      for (const t of tweets) {
        const length = Number.parseInt(t[1] ?? '0', 10);
        expect(length).toBeLessThanOrEqual(280);
        expect((t[2] ?? '').length).toBeLessThanOrEqual(280);
      }
    }
  });
});
