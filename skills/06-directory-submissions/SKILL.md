---
name: launchkit-directory-submissions
description: Submit the product to indie/SaaS directories that allow logged-in form fill. Spawn one browser-operator subagent per directory (cap 5 concurrent). Halt on captcha, never create accounts.
triggers: ["/launch submissions", "/launch directories"]
---

# 06 — Directory Submissions

## Purpose

You drive the user's authenticated browser session via Playwright MCP to submit the product to indie / SaaS directories. You do NOT create accounts. You DO halt on captcha. You verify success by reading the resulting DOM, not by lack of error.

## When to use

- After 04-brand-identity (paste copy comes from there) and the user has accounts on at least the Tier 2 directories.
- When the product is publicly accessible (the directories require a working URL).

## Inputs

- Validated `product-spec.json` (with `directories` field if the user wants a subset).
- Generated `brand-identity.md` (bios, links).
- A live Playwright MCP session attached to the user's authenticated browser.

## Default directory list (v1)

BetaList, FoundrList, Microlaunch, There's An AI For That, Toolify.ai, Futurepedia, StackShare, AlternativeTo, SaaSHub, Indie Hackers, F6S, Launching Next, Startup Buffer, Betapage, PeerPush.

## Outputs

- `<outDir>/submissions/<directory-slug>.json` per directory, containing:
  - `status`: `success | failed | needs-human`.
  - `screenshotPath`: post-submit screenshot.
  - `submittedUrl`: the URL of the submission's pending/preview page.
  - `followUp`: e.g. "verification email sent to support@…", "moderation queue, 1–7 days".
  - `errorDetail` when status ≠ success.
- `status.db` updated via 09-status-tracker.

## How you proceed

1. Load the spec + brand-identity.md.
2. For each directory in the spec's list:
   1. Spawn `agents/browser-operator.md` with the directory's slug and the paste copy.
   2. The operator opens the directory's submit URL in the existing authenticated session.
   3. Fill the form fields from the brand identity copy.
   4. Take a screenshot, click submit, take a screenshot.
   5. Verify success by DOM read — look for explicit confirmation text or the submission's pending page.
   6. Write the per-directory JSON.
3. Throttle to 5 concurrent subagents max (Claude rate limits + UI fragility).

## Verification

- Post-submit screenshot shows confirmation copy or a "your submission is pending" page.
- 24-hour follow-up: re-check by visiting the directory's pending queue or submission URL.
- DOM read confirms the title/URL the operator submitted matches the form values.

## Failure modes

- **Captcha hit:** mark `needs-human`, save the screenshot, move on. NEVER try to solve.
- **Login expired:** halt the entire skill, prompt the user to re-auth, do not partial-submit.
- **Site UI changed (selectors fail):** mark `failed`, save a DOM diff log, continue with the rest.
- **Account required but missing:** route to 05-account-checklist; do not create.

## Hard rules

- Always operate on the user's existing authenticated browser session.
- Never type passwords. Never interact with auth flows.
- Never bypass or solve captchas.
- Verify after acting (DOM read), not just absence of error.

## Implementation notes

- v1: ship the orchestration + browser-operator agent + 1 fully-tested directory (BetaList) as a reference. Other 14 directories are stubs in `submissions/` with clearly documented selectors and TODOs — fill them in as you encounter each one live.
- Recording fixtures: capture a single successful submission via Playwright Codegen, store the selector list under `tests/playwright/fixtures/<directory>.json`.
