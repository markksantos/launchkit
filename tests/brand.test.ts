import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { generateBrandIdentity } from '../src/brand/generate.js';
import type { ProductSpec } from '../src/types.js';

const SPEC: ProductSpec = {
  name: 'TestProduct',
  domain: 'testproduct.com',
  tagline: 'A simple tagline of six words',
  descriptions: {
    fifty: 'TestProduct is a simple sample tagline product description used by tests to verify generation logic across platform character limits and templating.',
    hundred: 'TestProduct is a sample product used by launchkit tests to verify the brand identity generator produces platform-fitted bios for twelve common social platforms with the canonical handle and brand colors threaded through.',
    twoHundred: 'TestProduct is a sample product used by launchkit tests to verify the brand identity generator produces platform-fitted bios for twelve common social platforms with the canonical handle and brand colors threaded through. The longer description is used on platforms with generous bio limits like LinkedIn, Crunchbase, and YouTube channel descriptions.',
  },
  category: 'saas',
  audience: 'Indie hackers shipping side projects.',
  useCase: 'They want a launch checklist that does not lie.',
  founder: { name: 'Test User' },
  handle: 'testproduct',
  github: { org: 'testorg', repo: 'testproduct' },
  brand: { primaryHex: '#112233', accentHex: '#445566' },
  targetLaunchDate: '2026-12-31',
};

describe('generateBrandIdentity', () => {
  it('writes a brand-identity.md with all 12 platforms', () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-brand-'));
    const r = generateBrandIdentity(SPEC, out);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(existsSync(r.value.markdownPath)).toBe(true);
      expect(r.value.plans.length).toBe(12);
    }
  });

  it('every bio fits inside the platform limit', () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-brand-'));
    const r = generateBrandIdentity(SPEC, out);
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const plan of r.value.plans) {
        expect(plan.bio.length).toBeLessThanOrEqual(plan.bioLimit);
      }
    }
  });

  it('every URL uses the canonical handle', () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-brand-'));
    const r = generateBrandIdentity(SPEC, out);
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const plan of r.value.plans) {
        // GitHub URL is the only one driven by spec.github.org rather than handle.
        if (plan.platform === 'github') continue;
        expect(plan.url.toLowerCase()).toContain(SPEC.handle.toLowerCase());
      }
    }
  });

  it('output is byte-stable for an unchanged spec', () => {
    const a = mkdtempSync(resolve(tmpdir(), 'launchkit-brand-a-'));
    const b = mkdtempSync(resolve(tmpdir(), 'launchkit-brand-b-'));
    const r1 = generateBrandIdentity(SPEC, a);
    const r2 = generateBrandIdentity(SPEC, b);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      const c1 = readFileSync(r1.value.markdownPath, 'utf-8');
      const c2 = readFileSync(r2.value.markdownPath, 'utf-8');
      expect(c1).toBe(c2);
    }
  });
});
