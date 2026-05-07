---
name: launchkit-domain-setup
description: Register the domain, configure DNS records (A/AAAA/MX/SPF/DKIM/DMARC/CAA), and set up email forwarding. Cloudflare API preferred; Playwright fallback against the user's authenticated session.
triggers: ["/launch domain", "/launch dns"]
---

# 02 — Domain Setup

## Purpose

You configure the public-facing domain so visitors land on the hosting target and email is deliverable. You do NOT touch any registration that requires payment — you flag it for the human checklist. You DO configure DNS once a domain is registered.

## When to use

- Spec is validated and the domain is available / registered.
- DNS provider in spec is one we can drive (`Cloudflare` is fully supported; others fall back to documented manual steps).

## Inputs

- `product-spec.json` (must contain `domain`, `hosting`, `dnsProvider`).
- Optional: `CLOUDFLARE_API_TOKEN` env var. Without it, you halt for the human checklist instead of attempting Playwright on the registrar dashboard (too fragile to automate for v1).

## Outputs

- DNS records configured at the registrar:
  - `A` and/or `AAAA` pointing to the hosting target (Netlify load balancer for Netlify, etc.).
  - `MX` records for email forwarding (default: ImprovMX or Cloudflare Email Routing).
  - `TXT` for SPF, DKIM, and DMARC.
  - `CAA` for `letsencrypt.org` and the hosting provider's CA, locking issuance.
- `examples/<slug>/dns-status.md` reporting every record, expected vs actual values, and propagation status.

## How you proceed

1. Read the spec and the env. Halt if `dnsProvider` is unsupported.
2. If `CLOUDFLARE_API_TOKEN` is present:
   1. List existing zones; halt if domain not found (registrar step is human).
   2. List existing DNS records. Preserve everything that already exists.
   3. Add only the missing records, computed from the hosting provider's expected target.
3. If no token, write `examples/<slug>/dns-status.md` with the exact records the human needs to add and the rationale for each.
4. Run `dig +short <domain>`, `dig MX <domain>`, `dig TXT <domain>` and capture the propagation snapshot.

## Verification

- `dig +short <domain>` matches the hosting target.
- `dig MX <domain>` resolves to the forwarder.
- SPF `v=spf1 ...` includes the forwarder's `include:` directive.
- DMARC `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` (start lenient, the human can tighten later).
- Propagation: re-check after 60 seconds; if still empty, mark `partial` and write a remediation note.

## Failure modes

- **Domain not yet registered:** halt; route to account checklist with the registrar of record (Cloudflare / Namecheap / etc.).
- **Existing records present:** preserve and merge — never overwrite a record without explicit user confirmation.
- **Captcha on registrar dashboard:** halt with a `needs-human` signal. Do not attempt to solve.
- **DNS provider not Cloudflare AND no API token:** write the documented record list to `dns-status.md` for the user to paste; do not attempt Playwright on registrars whose dashboards we haven't recorded.

## Example invocation

```
/launch domain

You read examples/famshield/product-spec.json (domain: getfamshield.com).
With CLOUDFLARE_API_TOKEN set, you list the zone, see no A record, and add
A → 75.2.60.5 (Netlify ALB). Write dns-status.md with the propagation
snapshot.
```

## Implementation notes for the engineer

- v1 ships the Cloudflare API path and the documented-fallback path. Per-registrar Playwright recordings are deferred — captcha frequency makes them brittle.
- Always use `dig +short @1.1.1.1` for verification to avoid ISP DNS caching.
