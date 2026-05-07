---
name: launchkit-status-tracker
description: Persistent status across the launch. SQLite-backed; survives session restart. Re-checks live state instead of trusting last write.
triggers: ["/launch status", "/launchkit status"]
---

# 09 — Status Tracker

## Purpose

You give the user a one-shot view of where the launch stands. What accounts exist; what content's drafted vs posted; which directories are submitted, pending, failed, or need a human; whether the schema validators are passing.

## When to use

- Anytime during or after a launch.
- Before re-running the orchestrator (so it knows what to skip).

## Inputs

- A project directory containing a `status.db`.

## Outputs

- A printed table grouped by:
  - Accounts (platform / status / URL).
  - Directory submissions (directory / status / URL).
  - Content (filename / channel / status).
  - Schema checks (name / status / detail).

## How you proceed

1. Open `<projectDir>/status.db` (creates it if missing — empty tables count as "nothing started").
2. Print the four sections via the CLI (`launchkit status <projectDir>`).
3. For each account / submission / schema check, optionally re-verify against the world (DNS, schema validator, directory pending page) — defer expensive re-checks behind a `--refresh` flag so the default `status` is fast.

## Verification

- DB survives session restart (WAL mode + atomic writes).
- Status reflects truth — re-checks live state when `--refresh` is passed instead of trusting cached values.
- No row gets stale: every write updates `recordedAt`.

## Failure modes

- **DB locked:** another launchkit process is holding it. Halt with a clear message.
- **DB corrupt:** rare; `better-sqlite3` will throw. Recovery is to delete the file and re-run the orchestrator (which rebuilds from the world).

## Schema

```sql
submissions     (directory PK, status, url, screenshotPath, followUp, errorDetail, recordedAt)
accounts        (platform PK, url, status, handle, notes, recordedAt)
content         (filename PK, channel, status, publishedUrl, charsOrWords, recordedAt)
schema_checks   (name PK, status, detail, recordedAt)
```

## Example

```
$ launchkit status examples/famshield

launchkit status — examples/famshield

Accounts (12):
  linkedin                     not-started               https://www.linkedin.com/company/getfamshield
  x                            not-started               https://x.com/getfamshield
  instagram                    not-started               https://www.instagram.com/getfamshield/
  …

Directory submissions (0):
Content (12):
  launch-tweet-thread.md       x              drafted
  …
Schema checks (0):
```
