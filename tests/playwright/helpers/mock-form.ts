import type { DirectoryFixture } from '../../../src/submissions/types.js';

/**
 * Build a deterministic HTML page whose form satisfies the *first* selector of
 * every field in a fixture, plus the submit selector. This lets a Playwright
 * test prove that a fixture's selectors are valid Playwright selectors and that
 * the selectors a real browser-operator would try actually resolve against a
 * matching DOM — the thing that silently breaks when a directory changes its
 * markup. It does NOT hit the network and does NOT depend on the real site.
 *
 * `variant` lets a test inject a captcha / login wall / success banner so the
 * fixture's failure/success assertions can be exercised too. The success
 * banner text is derived from the fixture's own first success assertion so the
 * assertion is guaranteed to be matchable when the directory actually succeeds.
 */
export interface MockFormOptions {
  variant?: 'plain' | 'captcha' | 'success';
}

export function buildMockFormHtml(fixture: DirectoryFixture, opts: MockFormOptions = {}): string {
  const variant = opts.variant ?? 'plain';
  const fields = fixture.formFields.map((f) => renderField(f.selectors[0]!, Boolean(f.multiline))).join('\n      ');
  const submit = renderSubmit(fixture.submitSelector);

  const captcha = variant === 'captcha' ? '<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>' : '';
  const success = variant === 'success' ? `<div class="banner">${successText(fixture)}</div>` : '';

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${escapeHtml(fixture.name)} submit (mock)</title></head>
  <body>
    ${success}
    ${captcha}
    <form action="/submit" method="post">
      ${fields}
      ${submit}
    </form>
  </body>
</html>`;
}

/** Sample text that matches the fixture's first `text=/regex/` success assertion. */
function successText(fixture: DirectoryFixture): string {
  for (const a of fixture.successAssertions) {
    const m = /^text=\/(.*)\/([a-z]*)$/s.exec(a);
    if (!m) continue;
    const sample = sampleForPattern(m[1]!);
    if (sample) return `${sample} — submission received.`;
  }
  return 'Thanks for your submission.';
}

/**
 * Produce a literal string that the given (simple) regex source will match.
 * launchkit success assertions are plain alternations of literal phrases, so
 * we take the first alternative and strip regex metacharacters.
 */
function sampleForPattern(source: string): string | null {
  const firstAlt = source.split('|')[0] ?? source;
  const literal = firstAlt.replace(/[\\^$.*+?()[\]{}]/g, '').trim();
  return literal.length > 0 ? literal : null;
}

/**
 * Turn a fixture field selector into an element the selector will match.
 * Handles the shapes launchkit fixtures actually emit: `#id`,
 * `tag[name="x"]`, `tag[type="url"]`, `tag[placeholder*="x" i]`,
 * `[role="textbox"][contenteditable="true"]`, `.class`.
 */
function renderField(selector: string, multiline: boolean): string {
  // Use the first simple alternative in a comma list.
  const first = selector.split(',')[0]!.trim();
  const { tag, id, classes, attrs } = parseSelector(first, multiline ? 'textarea' : 'input');

  const attrStr = renderAttrs(attrs);
  const idStr = id ? ` id="${escapeAttr(id)}"` : '';
  const classStr = classes.length ? ` class="${classes.map(escapeAttr).join(' ')}"` : '';
  const contentEditable = attrs['contenteditable'] === 'true' ? ' contenteditable="true"' : '';

  if (attrs['role'] === 'textbox' || (attrs['contenteditable'] === 'true' && tag !== 'textarea')) {
    return `<div${idStr}${classStr} ${attrStr}${contentEditable}></div>`;
  }
  if (tag === 'textarea') return `<textarea${idStr}${classStr} ${attrStr}></textarea>`;
  if (tag === 'select') return `<select${idStr}${classStr} ${attrStr}><option value="1">one</option></select>`;
  if (tag === 'div') return `<div${idStr}${classStr} ${attrStr}${contentEditable}></div>`;
  return `<input${idStr}${classStr} ${attrStr} />`;
}

function renderSubmit(selector: string): string {
  // Submit selectors are often comma lists like:
  //   button[type="submit"], button:has-text("Post"), button:has-text("Publish")
  // Render a single button that satisfies the first simple part AND carries the
  // has-text labels, so the button stays a single resolvable element.
  const parts = selector.split(',').map((s) => s.trim());
  const hasTexts = parts
    .map((p) => /:has-text\(["']([^"']+)["']\)/.exec(p)?.[1])
    .filter((t): t is string => Boolean(t));

  const first = parts[0]!;
  const { tag, id, attrs } = parseSelector(stripHasText(first), 'button');
  if (!('type' in attrs)) attrs['type'] = 'submit';
  const attrStr = renderAttrs(attrs);
  const idStr = id ? ` id="${escapeAttr(id)}"` : '';
  const label = hasTexts[0] ?? 'Submit';

  if (tag === 'input') return `<input${idStr} ${attrStr} value="${escapeAttr(label)}" />`;
  return `<button${idStr} ${attrStr}>${escapeHtml(label)}</button>`;
}

function stripHasText(selector: string): string {
  return selector.replace(/:has-text\(["'][^"']+["']\)/g, '').trim();
}

interface ParsedSelector {
  tag: string;
  id: string | null;
  classes: string[];
  attrs: Record<string, string>;
}

function parseSelector(selector: string, defaultTag: string): ParsedSelector {
  const attrs: Record<string, string> = {};
  const classes: string[] = [];
  let id: string | null = null;

  // Leading tag (optional).
  const tagMatch = /^([a-z][a-z0-9]*)/i.exec(selector);
  let tag = tagMatch?.[1]?.toLowerCase() || defaultTag;

  // #id
  const idMatch = /#([A-Za-z0-9_:-]+)/.exec(selector);
  if (idMatch) id = idMatch[1] ?? null;

  // .class
  const classRe = /\.([A-Za-z0-9_-]+)/g;
  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(selector)) !== null) classes.push(cm[1]!);
  // A bare `.trix-content` style selector has no leading tag.
  if (selector.trim().startsWith('.')) tag = defaultTag;

  // [attr="value"] and [attr*="value" i] (we render the substring value verbatim).
  const attrRe = /\[([A-Za-z0-9_-]+)\s*([*^$~|]?=)\s*"([^"]*)"(?:\s+[a-z])?\]/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(selector)) !== null) {
    attrs[m[1]!] = m[3]!;
  }

  return { tag, id, classes, attrs };
}

function renderAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(' ');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
