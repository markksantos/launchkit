import type { ProductSpec } from '../types.js';
import type { DnsRecord, Zone } from './cloudflare.js';
import type { DesiredRecord } from './desired-records.js';

export interface RenderArgs {
  spec: ProductSpec;
  zone: Zone;
  desired: DesiredRecord[];
  finalRecords: DnsRecord[];
  toCreate: DesiredRecord[];
  alreadyPresent: DesiredRecord[];
  created: DnsRecord[];
  dryRun: boolean;
}

export function renderDnsStatus(args: RenderArgs): string {
  const { spec, zone, desired, toCreate, alreadyPresent, created, dryRun } = args;
  const lines: string[] = [];

  lines.push(`# ${spec.name} — DNS status`);
  lines.push('');
  lines.push(`Zone: \`${zone.name}\` (id \`${zone.id}\`, status \`${zone.status}\`).`);
  lines.push(`Hosting: \`${spec.hosting ?? 'unknown'}\`.`);
  lines.push(`Mode: \`${dryRun ? 'dry-run' : 'apply'}\`.`);
  lines.push('');

  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- Desired records:    **${desired.length}**`);
  lines.push(`- Already present:    **${alreadyPresent.length}**`);
  lines.push(`- To create:          **${toCreate.length}**`);
  lines.push(`- Created this run:   **${created.length}**${dryRun ? ' (dry-run, none created)' : ''}`);
  lines.push('');

  lines.push(`## Desired records`);
  lines.push('');
  lines.push(renderTable(desired));
  lines.push('');

  if (toCreate.length > 0) {
    lines.push(`## Records to create${dryRun ? ' (dry-run — apply by re-running without --dry-run)' : ''}`);
    lines.push('');
    lines.push(renderTable(toCreate));
    lines.push('');
  }

  if (alreadyPresent.length > 0) {
    lines.push(`## Already present (preserved)`);
    lines.push('');
    lines.push(renderTable(alreadyPresent));
    lines.push('');
  }

  lines.push(`## Verification commands`);
  lines.push('');
  lines.push('```bash');
  lines.push(`dig +short @1.1.1.1 ${spec.domain}`);
  lines.push(`dig +short MX @1.1.1.1 ${spec.domain}`);
  lines.push(`dig +short TXT @1.1.1.1 ${spec.domain}`);
  lines.push(`dig +short TXT @1.1.1.1 _dmarc.${spec.domain}`);
  lines.push(`dig +short CAA @1.1.1.1 ${spec.domain}`);
  lines.push('```');
  lines.push('');
  lines.push(`Propagation can take up to a few minutes after a Cloudflare API write. Re-run \`launchkit domain setup\` to refresh the status.`);

  return lines.join('\n');
}

function renderTable(records: DesiredRecord[]): string {
  const out: string[] = [];
  out.push('| Type | Name | Content | Priority | Why |');
  out.push('|---|---|---|---|---|');
  for (const r of records) {
    out.push(`| ${r.type} | \`${r.name}\` | \`${escapePipes(r.content)}\` | ${r.priority ?? ''} | ${r.rationale} |`);
  }
  return out.join('\n');
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, '\\|');
}
