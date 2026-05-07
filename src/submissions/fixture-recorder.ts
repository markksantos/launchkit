import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Result } from '../types.js';
import { err, ok } from '../types.js';
import type { DirectoryFixture, FormFieldSpec, SourceField } from './types.js';

export interface RecordFixtureOptions {
  /** Directory slug, e.g. "betalist". */
  directory: string;
  /** The submit URL to inspect. */
  url: string;
  outDir: string;
  /** Override Playwright launcher for tests. */
  playwrightLauncher?: () => Promise<{
    open: (url: string) => Promise<{
      html: () => Promise<string>;
      close: () => Promise<void>;
    }>;
    close: () => Promise<void>;
  }>;
}

export interface RecordFixtureResult {
  fixturePath: string;
  fixture: DirectoryFixture;
}

/**
 * Inspect a directory's submit page and record a static fixture describing
 * how to fill it out. The fixture is then consumed at runtime by the
 * browser-operator agent against the user's authenticated browser session.
 *
 * Recording uses the locally-installed @playwright/test browser to render the
 * page (so JS-rendered forms work). It does not log in. It does not submit.
 * It only inspects the public form.
 */
export async function recordFixture(opts: RecordFixtureOptions): Promise<Result<RecordFixtureResult>> {
  const launcher = opts.playwrightLauncher ?? defaultLauncher;
  let browser: Awaited<ReturnType<typeof launcher>> | null = null;
  try {
    browser = await launcher();
  } catch (cause) {
    return err(
      'FIXTURE_BROWSER_LAUNCH_FAILED',
      `Could not launch a Playwright browser: ${(cause as Error).message}`,
      'Run `pnpm exec playwright install chromium` once.',
      cause,
    );
  }

  let html = '';
  try {
    const page = await browser.open(opts.url);
    html = await page.html();
    await page.close();
  } catch (cause) {
    await safeClose(browser);
    return err('FIXTURE_PAGE_FAILED', `Could not load ${opts.url}: ${(cause as Error).message}`, undefined, cause);
  }
  await safeClose(browser);

  const inspection = inspectHtml(html);
  if (inspection.fields.length === 0) {
    return err(
      'FIXTURE_NO_FIELDS_FOUND',
      `No form fields found at ${opts.url}.`,
      'Check the URL — it may be the marketing page rather than the submit form, or the form may render only after auth.',
    );
  }

  const fixture: DirectoryFixture = {
    directory: opts.directory,
    name: prettyName(opts.directory),
    submitUrl: opts.url,
    formFields: inspection.fields,
    submitSelector: inspection.submitSelector,
    successAssertions: defaultSuccessAssertions(opts.directory),
    failureAssertions: defaultFailureAssertions(),
    approvalNote: defaultApprovalNote(opts.directory),
    recordedAt: new Date().toISOString(),
  };

  mkdirSync(resolve(opts.outDir), { recursive: true });
  const fixturePath = resolve(opts.outDir, `${opts.directory}.json`);
  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n', 'utf-8');

  return ok({ fixturePath, fixture });
}

async function safeClose(browser: { close: () => Promise<void> } | null): Promise<void> {
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    /* swallow */
  }
}

/**
 * Default Playwright launcher. Imports `@playwright/test` lazily so unit
 * tests that inject a stub launcher never load the heavy module.
 */
async function defaultLauncher() {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  return {
    async open(url: string) {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      return {
        async html() {
          return page.content();
        },
        async close() {
          await page.close();
        },
      };
    },
    async close() {
      await browser.close();
    },
  };
}

interface InspectResult {
  fields: FormFieldSpec[];
  submitSelector: string;
}

/**
 * Inspect raw HTML for inputs, textareas, selects, and a likely submit
 * button. Heuristics: we map common form-field labels (name, url, etc.) to
 * the corresponding source field on the spec. The user is expected to
 * hand-edit the fixture if the heuristics miss a field.
 */
export function inspectHtml(html: string): InspectResult {
  // Strip script/style blocks so we don't match content inside them.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const inputRe = /<(input|textarea|select)\b[^>]*>/gi;
  const fields: FormFieldSpec[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(stripped)) !== null) {
    const tag = m[0];
    const tagName = (m[1] ?? '').toLowerCase();
    const type = (attr(tag, 'type') || (tagName === 'textarea' ? 'textarea' : 'text')).toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'file', 'password', 'reset'].includes(type)) continue;
    const name = attr(tag, 'name') ?? '';
    const id = attr(tag, 'id') ?? '';
    const placeholder = attr(tag, 'placeholder') ?? '';
    const ariaLabel = attr(tag, 'aria-label') ?? '';
    const labelText = findLabelText(stripped, id) ?? '';

    const composite = `${name}|${id}|${placeholder}|${ariaLabel}|${labelText}`.toLowerCase();
    const source = guessSource(composite);
    if (!source) continue;
    if (seen.has(source)) continue;
    seen.add(source);

    const selectors: string[] = [];
    if (id) selectors.push(`#${id}`);
    if (name) selectors.push(`${tagName}[name="${name}"]`);
    if (ariaLabel) selectors.push(`${tagName}[aria-label="${ariaLabel}"]`);
    if (placeholder) selectors.push(`${tagName}[placeholder="${placeholder}"]`);
    selectors.push(tagName);

    fields.push({
      source,
      label: ariaLabel || labelText || placeholder || name || id,
      selectors,
      multiline: tagName === 'textarea',
    });
  }

  const submitSelector = guessSubmitSelector(stripped);

  return { fields, submitSelector };
}

const SOURCE_GUESSES: Array<[RegExp, SourceField]> = [
  [/(product\s*name|brand\s*name|company\s*name|startup\s*name|^title$|\bname\b)/i, 'name'],
  [/(domain|website|url)/i, 'domain'],
  [/(tagline|headline|short\s*description|one[- ]liner|pitch)/i, 'tagline'],
  [/(long\s*description|about|summary|description)/i, 'descriptionTwoHundred'],
  [/(category|industry|tags?)/i, 'category'],
  [/(audience|who\s*is\s*it\s*for|target)/i, 'audience'],
  [/(use[- ]case|problem)/i, 'useCase'],
  [/(your[\s-]?name|founder|maker|creator)/i, 'founderName'],
  [/(email|contact)/i, 'founderEmail'],
  [/(handle|username|twitter|x\b)/i, 'handle'],
  [/(github|repo|repository)/i, 'githubRepoUrl'],
  [/(logo|icon|avatar)/i, 'logoPath'],
  [/(screenshot|image|cover)/i, 'firstScreenshotPath'],
];

function guessSource(text: string): SourceField | null {
  for (const [pattern, source] of SOURCE_GUESSES) {
    if (pattern.test(text)) return source;
  }
  return null;
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
  const m = re.exec(tag);
  if (m) return m[1] ?? null;
  const re2 = new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i');
  const m2 = re2.exec(tag);
  return m2 ? m2[1] ?? null : null;
}

function findLabelText(html: string, id: string): string | null {
  if (!id) return null;
  const re = new RegExp(`<label[^>]*for\\s*=\\s*["']${id}["'][^>]*>([\\s\\S]*?)<\\/label>`, 'i');
  const m = re.exec(html);
  if (!m) return null;
  return (m[1] ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 80);
}

function guessSubmitSelector(html: string): string {
  // Prefer button[type=submit] whose text suggests submission.
  const submitRe = /<(button|input)\b[^>]*type\s*=\s*"submit"[^>]*>(.*?)<\/\1>?/gi;
  const candidates: { sel: string; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = submitRe.exec(html)) !== null) {
    const tag = m[0];
    const text = (m[2] ?? '').replace(/<[^>]*>/g, '').trim();
    const id = attr(tag, 'id');
    const value = attr(tag, 'value');
    const sel = id ? `#${id}` : `${m[1] ?? 'button'}[type="submit"]`;
    candidates.push({ sel, text: text || value || '' });
  }
  if (candidates.length > 0) {
    // Prefer one whose text matches "submit/launch/post/share/list".
    const preferred = candidates.find((c) => /(submit|launch|post|share|list|publish|create|continue)/i.test(c.text));
    return (preferred ?? candidates[0]!).sel;
  }
  return 'button[type="submit"]';
}

function defaultSuccessAssertions(directory: string): string[] {
  return [
    'text=/submitted/i',
    'text=/thank/i',
    'text=/pending/i',
    'text=/we will review/i',
    `text=/your ${prettyName(directory)} listing/i`,
  ];
}

function defaultFailureAssertions(): DirectoryFixture['failureAssertions'] {
  return [
    { kind: 'captcha', selector: 'iframe[src*="recaptcha"]', message: 'reCAPTCHA detected — halt.' },
    { kind: 'captcha', selector: 'iframe[src*="hcaptcha"]', message: 'hCaptcha detected — halt.' },
    { kind: 'captcha', selector: '.cf-turnstile', message: 'Cloudflare Turnstile detected — halt.' },
    { kind: 'login', selector: 'a[href*="/login"], a[href*="/signin"]', message: 'Login wall encountered.' },
    { kind: 'rate-limit', selector: 'text=/too many requests/i', message: 'Rate limited.' },
  ];
}

function defaultApprovalNote(directory: string): string {
  return `Submission to ${prettyName(directory)} typically lands in a moderation queue for 1–7 days. Re-check via /launch status --refresh.`;
}

function prettyName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
