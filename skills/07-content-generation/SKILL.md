---
name: launchkit-content-generation
description: Generate launch content across formats — tweet thread, LinkedIn post, Show HN, Reddit (5 most relevant subs), Product Hunt, blog, newsletter pitches. Banned-words filter blocks AI slop.
triggers: ["/launch content"]
---

# 07 — Content Generation

## Purpose

You produce every piece of launch content the user will post on launch day, in human voice, paste-ready. The banned-words filter rejects any AI-giveaway phrase before the file is written.

## When to use

- After 01-product-spec is validated.
- Optionally after 04-brand-identity (so the canonical handle is consistent).
- A few days BEFORE launch — the user reviews and edits before posting.

## Inputs

- Validated `product-spec.json`.
- Optional: `--samples=<dir>` of past content for tone matching (e.g. user's prior tweets, blog posts).

## Outputs (under `<outDir>/content/`)

| File | Format | Limit |
|---|---|---|
| `launch-tweet-thread.md` | 5-tweet thread | 280 chars/tweet |
| `linkedin-launch.md` | Single post | 3000 chars |
| `show-hn.md` | Title + body | 80-char title, 2000-char body |
| `reddit-<subreddit>.md` × 5 | Per-sub post + rules summary | per-sub |
| `product-hunt.md` | 3 tagline variants + maker comment | 60-char taglines |
| `blog-launch.md` | Long-form, 600–1200 words | n/a |
| `newsletter-pitch.md` | TLDR + Indie Hackers + Makers' Box variants | n/a |

## How you proceed

1. Read the spec.
2. Decide subreddits: spec.subreddits if present, else CATEGORY_DEFAULT_SUBS lookup based on spec.category.
3. Run `pnpm content:generate <spec.json> --out=<dir>`.
4. Report the file count, total chars/words, and any platform-specific tightness.

## Verification

- Every piece under platform limits.
- Banned-words filter passes (the generator throws otherwise).
- Reddit drafts include the per-sub rules summary so the human checks before posting.
- All copy references the spec's name, tagline, audience, and use case (no invented details).

## Failure modes

- **Banned phrase:** generator throws `CONTENT_BANNED_PHRASE`. Find the offending sentence (usually in spec.descriptions), rewrite, re-run.
- **Tweet over 280:** generator truncates and warns. Edit the source description and re-run.
- **Subreddit not in known-rules list:** the per-sub rules block falls back to a generic warning. Add the sub to `REDDIT_RULES` in `src/content/generate.ts` for next time.

## Hard rules

- Banned phrases (case-insensitive): `delve`, `in today's fast-paced world`, `leverage`, `unlock`, `elevate`, `empower`, `navigate the landscape`, `game-changer`, `revolutionize`.
- Never invent product details. If a piece needs detail not in the spec, halt and ask.
- Never publish content automatically. This skill writes files; the human posts.

## Example invocation

```
/launch content

Generates 12 files in examples/famshield/content/. Reports the per-piece
metrics so the user knows where they're at the limit.
```
