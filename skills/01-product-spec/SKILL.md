---
name: launchkit-product-spec
description: Capture canonical product description once, reuse everywhere. Interview the user via structured prompts or load existing spec. Output is a validated product-spec.json.
triggers: ["/launch product-spec", "/launch spec", "/product-spec"]
---

# 01 — Product Spec

## Purpose

You produce a single validated `product-spec.json` that every other launchkit skill consumes. If you skip this skill, every downstream skill will halt asking for fields. So always run this first on a new launch.

## When to use

- The user is starting a new launch and has nothing structured yet.
- An existing `product-spec.json` exists but the schema validator is failing.
- The user mentions a brand name + domain and wants to "start".

## Inputs

- (Preferred) An existing `examples/<name>/product-spec.json` to validate.
- (Otherwise) Interview the user. Ask in this order, one question at a time, never more than three at once:
  1. Brand name + apex domain.
  2. Tagline (5–10 words, no period).
  3. Three description lengths: 50-, 100-, and 200-word.
  4. Category (`saas | consumer | developer-tool | mobile-app | ai-tool | marketplace | browser-extension | open-source | other`).
  5. Primary audience and primary use case (1–2 sentences each).
  6. Founder name + LinkedIn + X handle + email.
  7. Single canonical handle for all platforms (lowercase, no @).
  8. GitHub org + repo.
  9. Brand primary + accent hex colors.
  10. Logo + screenshot paths (if available).
  11. Hosting and DNS provider.
  12. Target launch date.
  13. (Optional) Five most relevant subreddits.
  14. (Optional) Two or three known competitors.

## Outputs

- Validated `product-spec.json` at the project root or `examples/<slug>/product-spec.json`.
- A single-line confirmation: `✓ Spec valid: <name> → https://<domain> (launch <date>)`.

## How you proceed

1. Look for an existing spec at the path the user mentions, or at `product-spec.json` in the current working directory.
2. If found, run `pnpm spec:validate <path>` (or `pnpm tsx src/cli/launchkit.ts spec validate <path>`). Report errors verbatim.
3. If missing, interview the user (above). Convert each answer into the corresponding JSON field as you go. Don't accept dummy values — if a field's missing, halt and ask.
4. Write the JSON file.
5. Re-run validation. Show the success line.

## Verification

- JSON Schema validation passes (ajv).
- Tagline word count between 5 and 12.
- Every URL field returns 200 OR is flagged "needs registration" (don't fail the run for a 404 on the homepage URL — the product may not be deployed yet).
- All required fields present.

## Failure modes

- **Tagline too short/long:** ask the user to rewrite. Do not invent.
- **Domain unparseable:** halt and ask the user to confirm the apex domain.
- **Missing required field:** halt and ask. Do not fabricate.
- **Existing spec present but malformed:** show the validator output and ask the user whether to regenerate or fix in place.

## Example invocation

```
/launch product-spec

User: "I want to launch FamShield. Domain is getfamshield.com."

You ask the remaining questions, build the JSON, validate, and write it to
examples/famshield/product-spec.json.
```
