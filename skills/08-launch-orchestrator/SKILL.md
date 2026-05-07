---
name: launchkit-launch-orchestrator
description: Sequence everything across T-7 → T+30. Composes 01..07 plus 09-status-tracker. Outputs a day-by-day plan, runs the deterministic skills, and queues the human-required tasks.
triggers: ["/launch", "/launch orchestrator", "/launch run"]
---

# 08 — Launch Orchestrator

## Purpose

You run the launch end-to-end with a single command. You orchestrate all prior skills, sequence them in the correct order, and never repeat work that's already done (you check status.db first).

## When to use

- The user types `/launch` on a fresh project, or to resume a paused launch.
- A spec already exists (you'll halt and route to 01-product-spec if not).

## Inputs

- `product-spec.json` (path or default `./product-spec.json`).
- Optional `--target-launch-date=<YYYY-MM-DD>` (overrides the spec's `targetLaunchDate`).

## Outputs

- A day-by-day plan in `<outDir>/launch-plan.md` covering T-7 → T+30.
- All skill outputs (brand identity, account checklist, content, schema, sitemap, robots, manifest).
- `status.db` populated with rows for every account, content piece, and submission.
- Final report telling the user which steps are done and which are queued for the human.

## Day-by-day plan template

| Day | Tasks |
|---|---|
| T-7 | 01 spec validation; 03 schema/SEO inject; 04 brand identity; 05 account checklist; 02 domain setup if not done |
| T-6 to T-3 | Human creates Tier 1 accounts (LinkedIn Company, Crunchbase, GBP). Generates content (07). |
| T-2 | Tier 2 social account creation. Schedule the launch tweet thread. Pre-write Reddit drafts. |
| T-1 | Stage Show HN. Schedule LinkedIn post. Pre-load Product Hunt page (don't publish yet). |
| T-0 | 12:01 AM PT: PH publish. 6 AM ET: Show HN submit. Mid-morning ET: LinkedIn + X thread. Reddit: stagger 3 hours apart, don't burst. |
| T+1 | Reply to every comment within 30 min for the first 12 hours. Newsletter pitches go out. |
| T+2 to T+7 | Directory submissions (06). Follow-up on PH leaderboard. |
| T+7 to T+30 | Weekly status review. Re-check schema validators. Double down on whichever channel converted best. |

## How you proceed

1. Read or generate the spec (calls 01).
2. Open `status.db`. Skip steps already marked completed.
3. Run 03-schema-seo, 04-brand-identity, 05-account-checklist, 07-content-generation.
4. Run 02-domain-setup if Cloudflare API token present, else flag for human.
5. Write `launch-plan.md`.
6. Print the report: deterministic outputs done; human-required tasks listed with links.

## Verification

- Every prior skill's verification block passes before this orchestrator marks itself done.
- `status.db` reflects every artifact's actual state (re-checked, not assumed).
- Plan dates align with the spec's `targetLaunchDate` (T-0 = launch day).

## Failure modes

- **Spec missing or invalid:** halt, route to 01.
- **Any prior skill fails:** report the specific skill + error, do not continue.
- **status.db locked:** halt with a clear message; the user has another process holding it.
