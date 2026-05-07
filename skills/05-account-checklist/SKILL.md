---
name: launchkit-account-checklist
description: Generate a tiered, paste-ready checklist of accounts that require human verification (SMS / email / ID / captcha). Each item is 3–5 minutes, ordered by impact.
triggers: ["/launch checklist", "/launch accounts"]
---

# 05 — Account Checklist

## Purpose

You produce the human-in-loop list of accounts launchkit cannot create itself (because they require SMS or fresh-account captchas). Each item has paste-ready copy so the human's only job is click + verify + paste.

## When to use

- After 04-brand-identity has produced bios — those bios are what gets pasted.
- Before 06-directory-submissions (some directories require accounts that this checklist creates).

## Inputs

- Validated `product-spec.json`.
- The output of 04-brand-identity (brand-identity.md). The checklist references the same canonical handle and bios.

## Outputs

- `<outDir>/account-checklist.md` ordered by tier:
  - **Tier 1** — entity / Knowledge-Graph (LinkedIn Company, Crunchbase, Google Business Profile).
  - **Tier 2** — public social (X, Instagram, TikTok, Threads, Facebook, YouTube).
  - **Tier 3** — content + community (GitHub org, Substack, Medium, Reddit user, Product Hunt maker).

Each item includes URL, paste-ready copy, expected verification (SMS / email / ID / manual review), and ETA.

## How you proceed

1. Read the spec.
2. Run `pnpm checklist:generate <spec.json> --out=<dir>`.
3. Print the tier breakdown so the user knows the order to attack the list.

## Verification

- Every URL returns 200 (or a known-good 30x) when probed.
- Every paste-block respects the platform's character limit.
- No `<placeholder>` markers remain.
- Tier 1 items are explicitly flagged as "highest entity-recognition value" — that's why they go first.

## Failure modes

- **Spec field missing:** halt; route back to 01-product-spec.
- **Bio length violation:** the generator throws — fix the spec's `descriptions.fifty` so all platforms fit.

## Hard rule

You NEVER create accounts. You only generate the checklist. Account creation is exclusively a human task.

## Example invocation

```
/launch checklist

You run `pnpm tsx src/cli/launchkit.ts checklist generate examples/famshield/product-spec.json`.
Output: examples/famshield/account-checklist.md (3 tiers, ~13 items).
Tell the user to start at Tier 1 — those drive the most measurable SEO/AI
visibility per minute spent.
```
