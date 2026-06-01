# launchkit

Opinionated SaaS launch operator. A Claude Code skill library that automates the boring 70% of launching a product so a launch takes 4 hours instead of 4 days.

> The remaining 30% — captchas, SMS verification, new-account creation — is delivered as a structured checklist with all assets pre-generated and paste-ready.

[![CI](https://github.com/markksantos/launchkit/actions/workflows/ci.yml/badge.svg)](https://github.com/markksantos/launchkit/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## What it does

Run `/launch` in Claude Code on a fresh project. By the end of the session the project has:

- ✅ A validated `product-spec.json` (the canonical product description).
- ✅ DNS configured + email forwarding live (when a Cloudflare API token is available).
- ✅ JSON-LD Organization + Product schemas, OG tags, Twitter card, sitemap, robots, manifest — injected into your project.
- ✅ Platform-consistent bios for **12 platforms** (LinkedIn, X, Instagram, TikTok, YouTube, Threads, Facebook, GitHub, Crunchbase, Reddit, Substack, Medium), paste-ready.
- ✅ A tiered checklist of accounts you still need to create (with paste copy for each).
- ✅ Launch content: tweet thread, LinkedIn, Show HN, Reddit (5 most-relevant subs), Product Hunt, blog, newsletter pitches — all in **human voice** with the banned-words filter blocking AI slop.
- ✅ A SQLite status tracker that survives session restart.

## What it doesn't do

- ❌ Create new accounts on any platform. New-account creation requires SMS / email / ID verification or fresh-account captchas — that's a human task. launchkit hands you paste-ready copy + the exact URL.
- ❌ Solve captchas. Ever. Halts on captcha and signals `needs-human`.
- ❌ Type passwords. Operates only on your existing authenticated browser session.
- ❌ Generate content with AI-giveaway phrases. Banned list (case-insensitive): `delve`, `in today's fast-paced world`, `leverage`, `unlock`, `elevate`, `empower`, `navigate the landscape`, `game-changer`, `revolutionize`.

---

## Installation

```bash
git clone https://github.com/markksantos/launchkit.git
cd launchkit
pnpm install
```

Requires Node 22.x and pnpm.

---

## Quick start with the FamShield example

`examples/famshield/` is the working test fixture. Run the end-to-end pipeline against it:

```bash
pnpm tsx src/cli/launchkit.ts spec validate examples/famshield/product-spec.json
pnpm tsx src/cli/launchkit.ts e2e examples/famshield/product-spec.json
pnpm tsx src/cli/launchkit.ts status examples/famshield
```

After running:

```
examples/famshield/
├── product-spec.json         # input
├── brand-identity.md         # 12 platforms × paste-ready bios
├── account-checklist.md      # 13 items × paste copy + verification + ETA
├── content/
│   ├── launch-tweet-thread.md
│   ├── linkedin-launch.md
│   ├── show-hn.md
│   ├── reddit-sideproject.md
│   ├── reddit-indiedev.md
│   ├── reddit-entrepreneur.md
│   ├── reddit-personalfinance.md
│   ├── reddit-legaladvice.md
│   ├── product-hunt.md
│   ├── blog-launch.md
│   └── newsletter-pitch.md
├── submissions/              # filled in by 06-directory-submissions
└── status.db                 # SQLite status tracker
```

---

## Using launchkit on your own project

### 1. Capture your product spec

Either:

- Hand-write `product-spec.json` following [`product-spec.template.json`](./product-spec.template.json), **or**
- Run `/launch product-spec` in Claude Code and answer the interview.

### 2. Validate

```bash
pnpm tsx src/cli/launchkit.ts spec validate path/to/product-spec.json
```

### 3. Run end-to-end

```bash
pnpm tsx src/cli/launchkit.ts e2e path/to/product-spec.json
```

This generates brand identity, account checklist, all content pieces, and initialises `status.db`. It also injects SEO into a target website repo (`--project=<dir>`) and produces a Cloudflare DNS plan (dry-run by default; pass `--apply-dns` to write) when the zone is on Cloudflare and a token is available:

```bash
pnpm tsx src/cli/launchkit.ts e2e path/to/product-spec.json \
  --samples=path/to/writing-samples \
  --project=/path/to/your/website-repo
```

Run individually if you only want one skill:

```bash
pnpm brand:generate path/to/product-spec.json
pnpm checklist:generate path/to/product-spec.json
pnpm content:generate path/to/product-spec.json
pnpm seo:inject path/to/product-spec.json --project=/path/to/your/website-repo
```

### 4. Work the human checklist

Open `account-checklist.md` and create the accounts in tier order. Tier 1 (LinkedIn Company, Crunchbase, Google Business Profile) drives the most measurable AI/SEO visibility per minute spent.

### 5. Submit to directories (Claude Code skill, requires Playwright MCP)

```
/launch submissions
```

Drives your existing authenticated browser session. Halts on captcha. Records every result in `status.db`.

### 6. Check status anytime

```bash
pnpm tsx src/cli/launchkit.ts status path/to/your/launch-project-dir
```

---

## Architecture

```
launchkit/
├── SKILL.md                      # the /launch master skill
├── product-spec.template.json    # JSON Schema (source of truth)
├── skills/                       # 9 skill specs (Claude Code SKILL.md)
│   ├── 01-product-spec/
│   ├── 02-domain-setup/
│   ├── 03-schema-seo/
│   ├── 04-brand-identity/
│   ├── 05-account-checklist/
│   ├── 06-directory-submissions/
│   ├── 07-content-generation/
│   ├── 08-launch-orchestrator/
│   └── 09-status-tracker/
├── agents/                       # 3 subagent specs
│   ├── browser-operator.md
│   ├── content-writer.md
│   └── verification-runner.md
├── src/                          # working code (TypeScript)
│   ├── types.ts
│   ├── lib/env.ts                # process.env + .env reader (no mutation)
│   ├── spec/parse.ts
│   ├── brand/generate.ts
│   ├── checklist/generate.ts
│   ├── content/generate.ts
│   ├── content/banned-words.ts
│   ├── content/tone-analyzer.ts  # --samples voice matching
│   ├── seo/inject.ts
│   ├── dns/                      # Cloudflare DNS automation
│   │   ├── cloudflare.ts         # API v4 client (fetch-based)
│   │   ├── desired-records.ts    # hosting + email + CAA record plan
│   │   ├── render.ts             # dns-status.md report
│   │   └── setup.ts              # diff-and-add orchestrator
│   ├── submissions/             # directory-submission fixtures
│   │   ├── types.ts              # DirectoryFixture + JSON schema
│   │   ├── fixture-recorder.ts   # inspect a public submit page
│   │   └── fixture-validate.ts   # ajv validation of a fixture
│   ├── status/db.ts
│   └── cli/launchkit.ts
├── tests/                        # vitest unit tests
│   ├── spec.test.ts
│   ├── banned-words.test.ts
│   ├── brand.test.ts
│   ├── content.test.ts
│   ├── dns.test.ts
│   ├── fixtures.test.ts
│   ├── tone.test.ts
│   ├── seo.test.ts
│   └── playwright/               # Playwright fixture-contract tests
│       ├── fixtures.spec.ts
│       ├── helpers/mock-form.ts
│       └── fixtures/*.json        # BetaList, FoundrList, Indie Hackers
└── examples/famshield/           # the working end-to-end test fixture
```

### Hard rules baked into the library

1. **Never create new accounts.** Account creation always routes to the human checklist.
2. **Never type passwords.** Never interact with auth flows.
3. **Never bypass or solve captchas.** Halt → `needs-human`.
4. **Never invent product details.** Halt and ask.
5. **Always operate on the user's authenticated browser session** via Playwright MCP.
6. **Always verify after acting** — DOM read, not just absence of error.
7. **Banned AI-giveaway phrases** are blocked at generation time.

### Result type

Every operation that touches the network (or runs validation) returns `Result<T, LaunchkitError>` rather than throwing. Callers decide whether to surface, retry, or halt:

```ts
const r = await parseSpecFile('product-spec.json', { strictCrossField: true });
if (!r.ok) {
  console.error(r.error.message);
  if (r.error.hint) console.error(`hint: ${r.error.hint}`);
  process.exit(1);
}
```

---

## What ships in v1 vs what's next

### Shipped in v1

- Full skill specs (9 SKILL.md files) following Anthropic's Claude Code skill format.
- 3 subagent specs.
- TypeScript working code for: spec validation, brand-identity generation, account-checklist generation, content generation (with banned-words filter), SEO injector, status DB + CLI status command.
- 70 vitest unit tests + 12 Playwright fixture-contract tests, all passing.
- End-to-end test fixture in `examples/famshield/`.
- MIT license, conventional commit history, GitHub Actions CI + tag-driven npm release workflow.

### Shipped in v1.1

- **Cloudflare DNS automation** (`src/dns/`). Real API client + diff-and-add orchestrator. `launchkit domain setup <spec.json> [--dry-run]`. Token read from `process.env` or `.env*` files; existing records preserved.
- **Playwright fixture recorder + 3 hand-curated fixtures** (`src/submissions/`, `tests/playwright/fixtures/`). `launchkit fixtures record <slug> <submit-url>` inspects the public submit page; BetaList, FoundrList, Indie Hackers ship as reference fixtures.
- **`--samples` tone matching** (`src/content/tone-analyzer.ts`). Analyses a corpus of `.md`/`.txt` writing samples and applies the voice profile (contractions, emoji density, semicolons, sentence length, first-person dominance) to every generated draft. Falls back to a neutral indie-hacker voice when no samples directory is provided.

### Still deferred

- **Other 12 directory fixtures** are added on demand via `launchkit fixtures record <slug> <url>`. The orchestration handles them; only the per-site selector list needs hand-editing.

---

## Development

```bash
pnpm install
pnpm test                  # vitest, 70 unit tests
pnpm exec playwright install chromium  # one-time, for the e2e suite
pnpm test:e2e              # Playwright fixture-contract tests, 12 tests
pnpm lint                  # tsc --noEmit
pnpm build                 # compile to dist/
pnpm famshield:e2e         # end-to-end run against the FamShield fixture
```

### Releasing

Publishing to npm is driven by a semver tag and the `release.yml` workflow:

```bash
npm version <patch|minor|major>   # bumps package.json + creates the tag
git push --follow-tags            # CI builds, tests, and publishes (needs NPM_TOKEN secret)
```

Pull requests welcome. Follow conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).

---

## License

[MIT](./LICENSE).
