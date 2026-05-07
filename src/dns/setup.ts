import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProductSpec, Result } from '../types.js';
import { err, ok } from '../types.js';
import { createCloudflareClient, type DnsRecord } from './cloudflare.js';
import { computeDesiredRecords, recordMatches, type DesiredRecord } from './desired-records.js';
import { renderDnsStatus } from './render.js';
import { readEnv } from '../lib/env.js';

export interface DnsSetupOptions {
  /** Output dir for dns-status.md; defaults to dirname of the spec file. */
  outDir: string;
  /** When true, only diff and report; never call create. */
  dryRun?: boolean;
  /** Allow injecting a custom token / fetch (used by tests). */
  token?: string;
  fetchImpl?: typeof fetch;
}

export interface DnsSetupResult {
  domain: string;
  zoneId: string;
  desired: DesiredRecord[];
  existing: DnsRecord[];
  toCreate: DesiredRecord[];
  alreadyPresent: DesiredRecord[];
  created: DnsRecord[];
  reportPath: string;
}

export async function setupDns(spec: ProductSpec, opts: DnsSetupOptions): Promise<Result<DnsSetupResult>> {
  if (spec.dnsProvider !== 'Cloudflare') {
    return err(
      'DNS_UNSUPPORTED_PROVIDER',
      `dnsProvider="${spec.dnsProvider}" is not supported by the Cloudflare integration.`,
      'Move the zone to Cloudflare or follow the documented manual records in dns-status.md.',
    );
  }

  const token = opts.token ?? readEnv('CLOUDFLARE_API_TOKEN');
  if (!token) {
    return err(
      'DNS_NO_TOKEN',
      'CLOUDFLARE_API_TOKEN not set in env or .env files.',
      'Create a token at https://dash.cloudflare.com/profile/api-tokens with Zone:Read + DNS:Edit scopes for the target zone.',
    );
  }

  const cf = createCloudflareClient({ token, ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) });

  const zoneRes = await cf.findZoneByName(spec.domain);
  if (!zoneRes.ok) return zoneRes;
  if (!zoneRes.value) {
    return err(
      'DNS_ZONE_NOT_FOUND',
      `Zone for ${spec.domain} not visible to this token.`,
      'Confirm the domain is on Cloudflare and the API token has access to it.',
    );
  }
  const zone = zoneRes.value;

  const recordsRes = await cf.listRecords(zone.id);
  if (!recordsRes.ok) return recordsRes;
  const existing = recordsRes.value;

  const desired = computeDesiredRecords(spec);
  const toCreate: DesiredRecord[] = [];
  const alreadyPresent: DesiredRecord[] = [];
  for (const d of desired) {
    if (existing.some((e) => recordMatches(d, e))) {
      alreadyPresent.push(d);
    } else {
      toCreate.push(d);
    }
  }

  const created: DnsRecord[] = [];
  if (!opts.dryRun) {
    for (const r of toCreate) {
      const cleaned: DnsRecord = {
        type: r.type,
        name: r.name,
        content: r.content,
        ttl: r.ttl,
        ...(r.priority !== undefined ? { priority: r.priority } : {}),
        comment: 'launchkit',
      };
      const cr = await cf.createRecord(zone.id, cleaned);
      if (!cr.ok) return cr;
      created.push(cr.value);
    }
  }

  // Re-fetch to capture the post-create state for the report.
  const finalRes = await cf.listRecords(zone.id);
  const finalRecords = finalRes.ok ? finalRes.value : existing;

  mkdirSync(resolve(opts.outDir), { recursive: true });
  const reportPath = resolve(opts.outDir, 'dns-status.md');
  writeFileSync(
    reportPath,
    renderDnsStatus({
      spec,
      zone,
      desired,
      finalRecords,
      toCreate,
      alreadyPresent,
      created,
      dryRun: Boolean(opts.dryRun),
    }),
    'utf-8',
  );

  return ok({
    domain: spec.domain,
    zoneId: zone.id,
    desired,
    existing,
    toCreate,
    alreadyPresent,
    created,
    reportPath,
  });
}
