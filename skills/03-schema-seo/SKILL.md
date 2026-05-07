---
name: launchkit-schema-seo
description: Inject Organization + Product JSON-LD, OG tags, Twitter card, sitemap.xml, robots.txt, and site.webmanifest into a target project. Idempotent — preserves existing schema.
triggers: ["/launch schema", "/launch seo"]
---

# 03 — Schema & SEO

## Purpose

You make the user's homepage look right to Google, Bing, and AI search engines. The only way these engines wire your brand to the Knowledge Graph is via correct on-page schema. You add it once, and you preserve any existing schema that's already there.

## When to use

- After the project codebase exists and has an `index.html` (or framework equivalent).
- Before the launch day. Indexing is the long-pole.

## Inputs

- Validated `product-spec.json`.
- Path to the project root (the one with `index.html` and a `public/` folder).

## Outputs

- `index.html` updated with: Organization JSON-LD, Product JSON-LD, OG tags, Twitter card, canonical link, manifest link, theme-color meta.
- `public/sitemap.xml`, `public/robots.txt`, `public/site.webmanifest` written.
- Commit message: `feat(seo): launchkit schema and metadata`.

## How you proceed

1. Read the spec and the target HTML.
2. Detect existing schema by string-matching `application/ld+json`, `og:title`, etc. Anything present is preserved.
3. Build the JSON-LD blocks from the spec (Organization sameAs uses `handle`; logo uses the brand's logoPath).
4. Inject only the missing blocks just before `</head>`.
5. Write `sitemap.xml` (root + any user-supplied extra routes), `robots.txt` (allow all + sitemap pointer), and `site.webmanifest` with the brand colors.
6. Run `pnpm seo:inject` via the CLI.
7. Validate via `validator.schema.org` (open the URL in a browser tab as a follow-up step the user clicks).

## Verification

- `validator.schema.org/?url=https://<domain>/` shows zero errors.
- Google Rich Results Test passes for Organization + Product types.
- Lighthouse SEO score ≥ 95 (the user runs Lighthouse — don't try to spawn Chrome from a skill).
- `opengraph.xyz` preview renders the OG image and title correctly.

## Failure modes

- **HTML has no `</head>`:** halt with a clear error.
- **Existing schema is malformed:** preserve it; surface a warning. Do not "fix" hand-written schema.
- **Logo or OG image path doesn't exist:** allow the inject; warn the user to add the asset before deploy.

## Example invocation

```
/launch seo --project=/Users/me/Developer/famshield

You read examples/famshield/product-spec.json, inject the four JSON-LD
blocks + meta tags into ../famshield/index.html, write the three public/
files, and report which ones were already present (so the user knows it's
idempotent).
```

## Implementation notes

- Use the CLI directly: `pnpm tsx src/cli/launchkit.ts seo inject <spec.json> --project=<dir>`.
- The injector returns a structured `injected: {jsonLd, openGraph, twitter, canonical, manifestLink}` so the caller knows which pieces were added vs preserved.
