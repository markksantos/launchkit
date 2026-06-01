import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DirectoryFixture } from '../../src/submissions/types.js';
import { buildMockFormHtml } from './helpers/mock-form.js';

/**
 * Contract tests for the shipped directory fixtures.
 *
 * These do NOT touch the real directories (which require auth and would be
 * flaky / rate-limited). Instead, each test renders a deterministic DOM that
 * matches the fixture's selectors and proves the contract the browser-operator
 * agent depends on at runtime:
 *
 *   1. Every field's primary selector is valid CSS and resolves to one element.
 *   2. Each field is fillable (the value round-trips).
 *   3. The submit selector resolves to a clickable element.
 *   4. The failure assertions correctly DETECT a captcha / login wall.
 *   5. At least one success assertion matches a confirmation page.
 *
 * If a directory changes its markup, the fixture is hand-re-recorded; this test
 * guards the selector grammar and the assertion grammar from regressing.
 */

const FIXTURE_DIR = resolve(import.meta.dirname, 'fixtures');
const SHIPPED = ['betalist', 'foundrlist', 'indiehackers'];

function loadFixture(slug: string): DirectoryFixture {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, `${slug}.json`), 'utf-8')) as DirectoryFixture;
}

/** Convert a launchkit assertion string into a Playwright locator on `page`. */
function locatorFor(page: import('@playwright/test').Page, assertion: string) {
  const textMatch = /^text=\/(.*)\/([a-z]*)$/s.exec(assertion);
  if (textMatch) {
    return page.getByText(new RegExp(textMatch[1]!, textMatch[2] || undefined));
  }
  return page.locator(assertion);
}

for (const slug of SHIPPED) {
  test.describe(`${slug} fixture`, () => {
    test('every field selector resolves and is fillable', async ({ page }) => {
      const fixture = loadFixture(slug);
      await page.setContent(buildMockFormHtml(fixture));

      for (const field of fixture.formFields) {
        const selector = field.selectors[0]!;
        const el = page.locator(selector);
        await expect(el, `selector ${selector} should resolve`).toHaveCount(1);

        // File inputs are filled by a dedicated upload helper — skip here.
        if (selector.includes('type="file"')) continue;
        // Selects can't be .fill()'d; just confirm they're present.
        const tag = await el.evaluate((node) => node.tagName.toLowerCase());
        if (tag === 'select') continue;

        await el.fill(`value-for-${field.source}`);
        await expect(el).toHaveValue(`value-for-${field.source}`);
      }
    });

    test('submit selector resolves to a single element', async ({ page }) => {
      const fixture = loadFixture(slug);
      await page.setContent(buildMockFormHtml(fixture));
      await expect(page.locator(fixture.submitSelector)).toHaveCount(1);
    });

    test('captcha failure assertion detects an injected captcha', async ({ page }) => {
      const fixture = loadFixture(slug);
      await page.setContent(buildMockFormHtml(fixture, { variant: 'captcha' }));

      const captchaAssertions = fixture.failureAssertions.filter((a) => a.kind === 'captcha');
      expect(captchaAssertions.length).toBeGreaterThan(0);

      // The recaptcha iframe variant must trip at least one captcha selector.
      const tripped = await Promise.all(
        captchaAssertions.map((a) => page.locator(a.selector).count().then((n) => n > 0)),
      );
      expect(tripped.some(Boolean), 'an injected reCAPTCHA must trip a captcha assertion').toBe(true);
    });

    test('a success assertion matches the confirmation page', async ({ page }) => {
      const fixture = loadFixture(slug);
      await page.setContent(buildMockFormHtml(fixture, { variant: 'success' }));

      const matches = await Promise.all(
        fixture.successAssertions.map((a) =>
          locatorFor(page, a)
            .count()
            .then((n) => n > 0)
            .catch(() => false),
        ),
      );
      expect(matches.some(Boolean), 'at least one success assertion should match the confirmation banner').toBe(true);
    });
  });
}
