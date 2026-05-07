import { defineConfig } from '@playwright/test';

/**
 * Playwright config for launchkit's directory-submission flows.
 *
 * The browser-operator agent does NOT run a fresh browser — it attaches to
 * the user's authenticated browser session via Playwright MCP. This config
 * exists for the (rare) cases where a skill needs an isolated headless test,
 * e.g. fixture recording for a directory's form layout.
 */
export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
