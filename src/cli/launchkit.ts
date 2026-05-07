#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseSpecFile } from '../spec/parse.js';
import { generateBrandIdentity } from '../brand/generate.js';
import { generateAccountChecklist } from '../checklist/generate.js';
import { generateAllContent } from '../content/generate.js';
import { injectSeo } from '../seo/inject.js';
import { openStatusDB } from '../status/db.js';
import type { ProductSpec, Result } from '../types.js';

/**
 * launchkit CLI. Sub-commands:
 *
 *   spec validate <spec.json>
 *   brand generate <spec.json> [--out=examples/<name>]
 *   checklist generate <spec.json> [--out=...]
 *   content generate <spec.json> [--out=...]
 *   seo inject <spec.json> --project=<path>
 *   status <projectDir>
 *   e2e <spec.json>
 */

const args = process.argv.slice(2);
const [cmd, sub, ...rest] = args;

function flag(name: string, fallback?: string): string | undefined {
  const found = rest.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

function positional(): string[] {
  return rest.filter((a) => !a.startsWith('--'));
}

function expectSpecPath(): string {
  const [path] = positional();
  if (!path) {
    fail(`Missing path to product-spec.json. Usage: launchkit ${cmd} ${sub ?? ''} <spec.json>`);
  }
  return path;
}

function fail(message: string, hint?: string): never {
  console.error(`launchkit: ${message}`);
  if (hint) console.error(`hint: ${hint}`);
  process.exit(1);
}

function unwrap<T>(r: Result<T>, label: string): T {
  if (r.ok) return r.value;
  fail(`${label}: ${r.error.message}`, r.error.hint);
}

async function main() {
  if (!cmd) {
    printUsage();
    process.exit(0);
  }

  if (cmd === 'spec' && sub === 'validate') {
    const spec = unwrap(await parseSpecFile(expectSpecPath(), { strictCrossField: true }), 'spec validate');
    console.log(`✓ Spec valid: ${spec.name} → https://${spec.domain} (launch ${spec.targetLaunchDate})`);
    return;
  }

  if (cmd === 'brand' && sub === 'generate') {
    const specPath = expectSpecPath();
    const spec = unwrap(await parseSpecFile(specPath), 'brand generate');
    const out = flag('out', defaultOut(specPath, spec))!;
    const result = unwrap(generateBrandIdentity(spec, out), 'brand generate');
    console.log(`✓ Brand identity → ${result.markdownPath} (${result.plans.length} platforms)`);
    return;
  }

  if (cmd === 'checklist' && sub === 'generate') {
    const specPath = expectSpecPath();
    const spec = unwrap(await parseSpecFile(specPath), 'checklist generate');
    const out = flag('out', defaultOut(specPath, spec))!;
    const path = unwrap(generateAccountChecklist(spec, out), 'checklist generate');
    console.log(`✓ Checklist → ${path}`);
    return;
  }

  if (cmd === 'content' && sub === 'generate') {
    const specPath = expectSpecPath();
    const spec = unwrap(await parseSpecFile(specPath), 'content generate');
    const out = flag('out', defaultOut(specPath, spec))!;
    const pieces = unwrap(generateAllContent(spec, out), 'content generate');
    console.log(`✓ Content → ${pieces.length} pieces in ${out}/content/`);
    return;
  }

  if (cmd === 'seo' && sub === 'inject') {
    const specPath = expectSpecPath();
    const spec = unwrap(await parseSpecFile(specPath), 'seo inject');
    const project = flag('project');
    if (!project) fail('seo inject requires --project=<path-to-target-project>');
    const result = unwrap(injectSeo(spec, { projectRoot: project! }), 'seo inject');
    const inj = result.injected;
    console.log(`✓ SEO injected into ${result.htmlPath} (jsonld:${inj.jsonLd} og:${inj.openGraph} twitter:${inj.twitter} canonical:${inj.canonical})`);
    console.log(`  + public files: ${result.publicFiles.length}`);
    return;
  }

  if (cmd === 'status') {
    // status is a single-word command; the first arg is the project dir.
    const projectDir = sub ?? positional()[0];
    if (!projectDir) fail('Usage: launchkit status <projectDir>');
    const db = openStatusDB(resolve(projectDir!, 'status.db'));
    const subs = db.listSubmissions();
    const accts = db.listAccounts();
    const cont = db.listContent();
    const sch = db.listSchemaChecks();
    db.close();

    console.log(`launchkit status — ${projectDir}\n`);
    console.log(`Accounts (${accts.length}):`);
    for (const a of accts) console.log(`  ${pad(a.platform, 28)} ${pad(a.status, 22)} ${a.url}`);
    console.log(`\nDirectory submissions (${subs.length}):`);
    for (const s of subs) console.log(`  ${pad(s.directory, 22)} ${pad(s.status, 18)} ${s.url ?? ''}`);
    console.log(`\nContent (${cont.length}):`);
    for (const c of cont) console.log(`  ${pad(c.filename, 38)} ${pad(c.channel, 14)} ${c.status}`);
    console.log(`\nSchema checks (${sch.length}):`);
    for (const sc of sch) console.log(`  ${pad(sc.name, 30)} ${sc.status}${sc.detail ? ` — ${sc.detail}` : ''}`);
    return;
  }

  if (cmd === 'e2e') {
    // e2e is a single-word command; the first arg is the spec path.
    const specPath = sub ?? positional()[0];
    if (!specPath) fail('Usage: launchkit e2e <spec.json>');
    const spec = unwrap(await parseSpecFile(specPath!, { strictCrossField: true }), 'e2e: spec validate');
    const out = defaultOut(specPath!, spec);
    console.log(`launchkit e2e → ${spec.name} (${out})\n`);

    const brand = unwrap(generateBrandIdentity(spec, out), 'e2e: brand');
    console.log(`  ✓ brand-identity.md (${brand.plans.length} platforms)`);

    const checklist = unwrap(generateAccountChecklist(spec, out), 'e2e: checklist');
    console.log(`  ✓ account-checklist.md → ${checklist}`);

    const content = unwrap(generateAllContent(spec, out), 'e2e: content');
    console.log(`  ✓ ${content.length} content pieces in ${out}/content/`);

    // Status DB tracking — record what the deterministic skills produced.
    const db = openStatusDB(resolve(out, 'status.db'));
    for (const plan of brand.plans) {
      db.recordAccount({ platform: plan.platform, url: plan.url, status: 'not-started', handle: spec.handle, notes: `${plan.bio.length}/${plan.bioLimit} chars` });
    }
    for (const piece of content) {
      db.recordContent({ filename: piece.filename, channel: channelFor(piece.filename), status: 'drafted', charsOrWords: piece.metric.value });
    }
    db.close();
    console.log(`  ✓ status.db initialised`);
    console.log(`\nDone. Manual next steps live in ${out}/account-checklist.md.`);
    return;
  }

  printUsage();
  fail(`Unknown command: ${cmd} ${sub ?? ''}`);
}

function defaultOut(specPath: string, spec: ProductSpec): string {
  const dir = dirname(resolve(specPath));
  if (dir.endsWith(spec.name.toLowerCase())) return dir;
  return dir;
}

function channelFor(filename: string): string {
  if (filename.startsWith('reddit-')) return 'reddit';
  if (filename.startsWith('linkedin')) return 'linkedin';
  if (filename.startsWith('show-hn')) return 'hackernews';
  if (filename.startsWith('product-hunt')) return 'producthunt';
  if (filename.startsWith('launch-tweet')) return 'x';
  if (filename.startsWith('blog')) return 'blog';
  if (filename.startsWith('newsletter')) return 'newsletter';
  return 'other';
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function printUsage(): void {
  console.log(`launchkit — opinionated SaaS launch operator

usage:
  launchkit spec validate <spec.json>
  launchkit brand generate <spec.json> [--out=<dir>]
  launchkit checklist generate <spec.json> [--out=<dir>]
  launchkit content generate <spec.json> [--out=<dir>]
  launchkit seo inject <spec.json> --project=<dir>
  launchkit status <projectDir>
  launchkit e2e <spec.json>

read SKILL.md and skills/ for the Claude Code skill specs.`);
}

// Avoid unused-variable lint for readFileSync that some sub-commands use indirectly.
void readFileSync;

main().catch((cause: unknown) => {
  console.error(`launchkit: unexpected error\n${cause instanceof Error ? cause.stack : String(cause)}`);
  process.exit(2);
});
