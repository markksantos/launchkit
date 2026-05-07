import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { recordFixture, inspectHtml } from '../src/submissions/fixture-recorder.js';
import { validateFixtureFile } from '../src/submissions/fixture-validate.js';

const SAMPLE_HTML = `<!doctype html>
<html><body>
  <form action="/submit" method="post">
    <label for="product_name">Product Name</label>
    <input id="product_name" name="product[name]" type="text" placeholder="Acme" />

    <label for="product_url">Website</label>
    <input id="product_url" name="product[url]" type="url" />

    <label for="product_tagline">Tagline</label>
    <input id="product_tagline" name="product[tagline]" type="text" />

    <label for="product_description">Description</label>
    <textarea id="product_description" name="product[description]"></textarea>

    <label for="email">Email</label>
    <input id="email" name="email" type="email" />

    <button id="submit-btn" type="submit">Submit Listing</button>
  </form>
</body></html>`;

describe('inspectHtml', () => {
  it('extracts the canonical fields from a typical submit form', () => {
    const r = inspectHtml(SAMPLE_HTML);
    const sources = r.fields.map((f) => f.source);
    expect(sources).toContain('name');
    expect(sources).toContain('domain');
    expect(sources).toContain('tagline');
    expect(sources).toContain('descriptionTwoHundred');
    expect(sources).toContain('founderEmail');
  });

  it('prefers the id selector first', () => {
    const r = inspectHtml(SAMPLE_HTML);
    const nameField = r.fields.find((f) => f.source === 'name');
    expect(nameField?.selectors[0]).toBe('#product_name');
  });

  it('marks textarea fields as multiline', () => {
    const r = inspectHtml(SAMPLE_HTML);
    const desc = r.fields.find((f) => f.source === 'descriptionTwoHundred');
    expect(desc?.multiline).toBe(true);
  });

  it('skips hidden, file, and password inputs', () => {
    const html = `<form>
      <input type="hidden" name="csrf" />
      <input type="file" name="logo" />
      <input type="password" name="password" />
      <input type="text" name="product[name]" id="product_name" />
      <button type="submit">Go</button>
    </form>`;
    const r = inspectHtml(html);
    expect(r.fields.find((f) => f.source === 'name')).toBeDefined();
    // No 'logoPath' — file inputs are skipped on purpose (uploads need the agent's helper).
    expect(r.fields).toHaveLength(1);
  });

  it('finds a submit button and prefers an id selector', () => {
    const r = inspectHtml(SAMPLE_HTML);
    expect(r.submitSelector).toBe('#submit-btn');
  });
});

describe('recordFixture', () => {
  it('writes a valid fixture JSON when fields are found', async () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-fixture-'));

    // Inject a stub launcher that returns our sample HTML — no real browser needed.
    const r = await recordFixture({
      directory: 'sampledir',
      url: 'https://example.test/submit',
      outDir: out,
      playwrightLauncher: async () => ({
        async open() {
          return {
            async html() {
              return SAMPLE_HTML;
            },
            async close() {
              /* noop */
            },
          };
        },
        async close() {
          /* noop */
        },
      }),
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      const json = JSON.parse(readFileSync(r.value.fixturePath, 'utf-8'));
      expect(json.directory).toBe('sampledir');
      expect(json.formFields.length).toBeGreaterThan(0);
      expect(json.submitSelector).toBeTruthy();

      const validated = await validateFixtureFile(r.value.fixturePath);
      expect(validated.ok).toBe(true);
    }
  });

  it('returns a clear error when no fields are found', async () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-fixture-'));
    const r = await recordFixture({
      directory: 'empty',
      url: 'https://example.test',
      outDir: out,
      playwrightLauncher: async () => ({
        async open() {
          return {
            async html() {
              return '<html><body><h1>marketing</h1></body></html>';
            },
            async close() {
              /* noop */
            },
          };
        },
        async close() {
          /* noop */
        },
      }),
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FIXTURE_NO_FIELDS_FOUND');
  });
});

describe('committed directory fixtures', () => {
  const FIXTURE_DIR = resolve(__dirname, 'playwright/fixtures');

  it('betalist.json validates and includes core fields', async () => {
    const r = await validateFixtureFile(resolve(FIXTURE_DIR, 'betalist.json'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const sources = r.value.formFields.map((f) => f.source);
      expect(sources).toEqual(expect.arrayContaining(['name', 'domain', 'tagline', 'descriptionTwoHundred', 'founderEmail']));
      expect(r.value.requiresAuth).toBe(true);
    }
  });

  it('foundrlist.json validates and includes core fields', async () => {
    const r = await validateFixtureFile(resolve(FIXTURE_DIR, 'foundrlist.json'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const sources = r.value.formFields.map((f) => f.source);
      expect(sources).toEqual(expect.arrayContaining(['name', 'domain', 'tagline']));
    }
  });

  it('indiehackers.json validates and notes that it goes live without moderation', async () => {
    const r = await validateFixtureFile(resolve(FIXTURE_DIR, 'indiehackers.json'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.approvalNote).toMatch(/live immediately|no.*moderation/i);
    }
  });
});
