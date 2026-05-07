---
name: launchkit-brand-identity
description: Generate platform-consistent bios, taglines, and link sets for 12 platforms. Each output respects the platform's character limit, includes the canonical link, and notes platform-specific quirks.
triggers: ["/launch brand", "/launch identity"]
---

# 04 — Brand Identity

## Purpose

You produce one paste-ready bio for every platform the brand will live on. The same canonical handle, the same colors, length-validated copy. The user never has to write 12 different bios.

## When to use

- After 01-product-spec is validated.
- Whenever the spec changes (re-run; the file is a deterministic output).

## Inputs

- Validated `product-spec.json`.

## Outputs

- `<outDir>/brand-identity.md` containing one section per platform with:
  - Canonical URL using `spec.handle`.
  - Bio text + character count vs platform limit.
  - Platform-specific notes (e.g., "Threads inherits from Instagram", "Reddit posting from a fresh brand account triggers spam filters").

## Platforms covered (12)

LinkedIn (company), X / Twitter, Instagram, TikTok, YouTube, Threads, Facebook page, GitHub org, Crunchbase organization, Reddit user "About", Substack publication, Medium publication / user bio.

## How you proceed

1. Read the spec.
2. Run `pnpm brand:generate <spec.json> --out=<dir>`.
3. Show the resulting file path. Mention the canonical handle and the number of platforms generated.

## Verification

- Every bio fits inside the platform's character limit (the generator throws if not).
- No banned AI-giveaway phrases appear (banned-words filter throws).
- All URLs use the same canonical handle.
- The generated file is regenerable: re-running yields byte-identical output if the spec is unchanged.

## Failure modes

- **Bio over limit:** the generator returns `BRAND_BIO_OVER_LIMIT`. Edit the spec's `descriptions.fifty` to be shorter, then re-run.
- **Banned phrase in spec descriptions:** the filter halts. Rewrite the offending sentence in the spec.
- **Handle invalid:** the spec validator catches it before this skill runs.

## Example invocation

```
/launch brand

You run `pnpm tsx src/cli/launchkit.ts brand generate examples/famshield/product-spec.json`.
Output: examples/famshield/brand-identity.md (12 platforms, all fitted).
Report the canonical handle, the URL list, and any character-budget tightness
the user might want to know about.
```
