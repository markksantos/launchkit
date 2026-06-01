# launchkit — Overnight Worklog

## What it is

`launchkit` is a Claude Code skill library + TypeScript CLI that automates the
operational ~70% of a SaaS product launch. From a single validated
`product-spec.json` it produces: platform-consistent brand bios for 12 platforms,
a tiered human account-creation checklist (with paste-ready copy), launch content
for every channel (tweet thread, LinkedIn, Show HN, Reddit per-sub, Product Hunt,
blog, newsletter) with an AI-slop banned-words filter, JSON-LD/OG/Twitter/sitemap/
robots/manifest SEO injection into a target website repo, Cloudflare DNS automation
(diff-and-add, never destructive), a Playwright fixture recorder for directory
submissions, and a SQLite status tracker that survives session restart. The hard
rules (never create accounts, never type passwords, never solve captchas, halt →
`needs-human`) are baked in by design.

Stack: TypeScript, Node 22, pnpm, tsc build, vitest, Playwright, better-sqlite3,
ajv, Cloudflare API v4 (fetch-based).

## Starting state (honest completeness: ~85%)

The triage hint said 72%, but the code was materially further along than that. On
arrival the project **already built cleanly, lint was clean, and 71 vitest tests
passed**. v1 + v1.1 were both shipped: spec validation, brand/checklist/content
generators, SEO injector, status DB, Cloudflare DNS client + orchestrator, tone
analyzer, fixture recorder, and 3 hand-curated directory fixtures. The gaps were
the polish-and-ship layer: a handful of real bugs, dead code / lint hacks, missing
`.env.example`, no Playwright runtime tests, no npm publish config / release
workflow, an e2e command that didn't wire in SEO/DNS, and a README that
under-reported its own test count.

This is genuinely Mark-authored code (his voice, his FamShield example, his
conventions) — not a third-party clone.

## What I changed, fixed, added, built

### Real bugs fixed
- **`src/spec/parse.ts`** — the strict-mode tagline check allowed up to **12**
  words while its error message and the JSON Schema doc both say **5–10**.
  Tightened the upper bound to 10 so behavior matches the contract. Also removed a
  dead empty `if` block (a soft-check that did nothing).
- **`src/checklist/generate.ts`** — removed the `pasteCopyChars` field: it was set
  inconsistently (sometimes a char limit, sometimes 0) and **never rendered**. Pure
  dead state. Removed from the interface and all 13 items.

### Dead code / lint-hack cleanup (production hygiene)
- **`src/cli/launchkit.ts`** — removed the unused `readFileSync` import and the
  `void readFileSync;` hack that existed only to silence the resulting lint error;
  collapsed `defaultOut`'s two identical return branches into one.
- **`src/seo/inject.ts`** — removed the unused `dirname` import and `void dirname;`.
- **`src/content/generate.ts`** — removed the dead `existsFile` export (a one-line
  wrapper around `existsSync`, used nowhere real) and the now-unused `existsSync`
  import; removed its meaningless test (`survives existsFile import`, which didn't
  even call `existsFile`).

### Features wired up
- **e2e now runs SEO + DNS** (`src/cli/launchkit.ts`). `launchkit e2e <spec>` gained
  `--project=<website-dir>` (injects SEO into the target repo and records per-schema
  checks — json-ld / open-graph / twitter-card / canonical — into `status.db`) and
  `--apply-dns` (the Cloudflare DNS plan runs as a non-mutating **dry-run by
  default**; `--apply-dns` opts into writes). Both degrade gracefully: SEO is
  skipped without `--project`, DNS is skipped (with a clear message) when the zone
  isn't on Cloudflare or no token is present. This was the "wire e2e to invoke all
  sub-commands" finish-task.

### Tests added
- **`tests/playwright/fixtures.spec.ts`** (12 tests) + **`tests/playwright/helpers/
  mock-form.ts`**. Real Playwright tests that render a deterministic DOM built from
  each shipped fixture (betalist, foundrlist, indiehackers) and prove the contract
  the browser-operator agent relies on at runtime: every field/submit selector is a
  valid, resolvable Playwright selector and is fillable; the captcha failure
  assertions correctly detect an injected reCAPTCHA; and a success assertion matches
  a confirmation banner. No network, no auth — it guards the selector + assertion
  grammar from silently rotting. (The runtime form-fill itself is intentionally the
  agent's job via Playwright MCP, per `skills/06-directory-submissions/SKILL.md`, so
  I did not build a duplicate TS submission runner.)

### Release / ops
- **`package.json`** — bumped to `1.1.0` (matching the shipped v1.1 feature set);
  added `repository`, `homepage`, `bugs`, `publishConfig.access=public`, a
  `prepublishOnly` guard (lint → test → build), a `test:e2e` script, and relaxed
  `engines.node` from the over-strict `22.x` to `>=22`.
- **`.github/workflows/release.yml`** — new tag-driven release (`v*.*.*`): installs,
  verifies the tag matches `package.json` version, lint + test + build, then
  `npm publish --provenance`. The publish step is gated on an `NPM_TOKEN` secret, so
  tagging is safe before the package name is claimed.
- **`.github/workflows/ci.yml`** — added Chromium install + `pnpm test:e2e` so the
  Playwright suite runs in CI alongside lint/test/build.
- **`.env.example`** — documents `CLOUDFLARE_API_TOKEN` (the only external
  credential) and the exact token scopes (Zone:Read + DNS:Edit). Verified the real
  `.env` stays gitignored while `.env.example` is tracked.
- **`README.md`** — corrected the test counts (70 unit + 12 Playwright; it said 30),
  documented the new e2e flags and the release flow, and refreshed the `src/` +
  `tests/` file tree to reflect v1.1 (dns/, submissions/, lib/, tone-analyzer,
  playwright/).

### Verification artifacts
- Regenerated `examples/famshield/` via the compiled `e2e` — output was byte-for-byte
  identical (the cleanups were internal), confirming no behavior regression.
- Smoke-tested the compiled bin: `spec validate`, `seo inject` (5 head tags +
  3 public files written), and a full `e2e --project` run (schema checks landed in
  `status.db`).

## Current state

- **Builds?** Yes — clean `tsc -b` from a wiped `dist/` + tsbuildinfo.
- **Lint?** Clean — `tsc -b --noEmit`.
- **Runs?** Yes — the compiled `dist/cli/launchkit.js` runs every sub-command
  (`spec`, `brand`, `checklist`, `content`, `seo`, `domain`, `fixtures`, `status`,
  `e2e`). `npm pack` produces a valid `launchkit@1.1.0` tarball (89 files, 73 KB)
  with `dist/` + bin + skills + agents + spec template.
- **Tests?** 70 vitest unit tests + 12 Playwright tests — all passing. The
  `prepublishOnly` release guard (lint+test+build) passes end-to-end.

## How to run it locally

```bash
cd /Users/markksantos/Developer/launchkit
pnpm install
pnpm build                              # compile to dist/
pnpm test                               # 70 unit tests
pnpm exec playwright install chromium   # one-time
pnpm test:e2e                           # 12 Playwright fixture-contract tests

# End-to-end against the bundled FamShield fixture:
pnpm famshield:e2e
node dist/cli/launchkit.js status examples/famshield

# On your own product:
node dist/cli/launchkit.js spec validate path/to/product-spec.json
node dist/cli/launchkit.js e2e path/to/product-spec.json \
  --samples=path/to/writing-samples \
  --project=/path/to/your/website-repo \
  # --apply-dns   # writes Cloudflare records; omit for a dry-run plan
```

DNS automation needs `CLOUDFLARE_API_TOKEN` (copy `.env.example` → `.env`). Without
it, `domain setup` / `e2e` report the records you must add manually and continue.

## How to deploy (when ready)

This is a CLI library, not a hosted service — "deploy" = publish to npm.

1. Claim the `launchkit` name (see NEEDS FROM MARK) — `npm view launchkit` to check
   availability; pick a scope (`@markksantos/launchkit`) if it's taken.
2. Create an npm automation token with publish rights and add it as the repo secret
   `NPM_TOKEN`.
3. `npm version <patch|minor|major>` then `git push --follow-tags`.
4. `release.yml` verifies the tag, runs lint+test+build, and publishes with
   provenance. (Until `NPM_TOKEN` exists the publish step no-ops, so tagging is
   safe.)

I did **not** publish or push anything — local commits only.

## NEEDS FROM MARK

- **`CLOUDFLARE_API_TOKEN`** — not present in any sibling project (.env or
  KEYS_CATALOG). Needed only to live-test the Cloudflare DNS write path against a
  real zone. The DNS client + orchestrator are already fully covered by 16 unit
  tests using an injected `fetch` stub, and the no-token path degrades gracefully,
  so this is a verification nicety, not a blocker.
- **npm publish decision** — confirm the package name (`launchkit` vs a
  `@markksantos/` scope), then add the `NPM_TOKEN` repo secret. Publishing is the
  only irreversible step and is intentionally left to Mark.

## Honest completeness now: ~95%

Everything builds, lints, tests, runs, and is publish-shaped. The remaining ~5% is
not code I can write unattended:
- live Cloudflare DNS write verification (needs a real token + zone),
- the npm name/publish decision + secret,
- recording the other 12 directory fixtures (by design these are added on demand via
  `launchkit fixtures record <slug> <url>` against each authenticated form; the
  orchestration already handles them — only per-site selector lists need hand-editing,
  which requires a logged-in human session).
