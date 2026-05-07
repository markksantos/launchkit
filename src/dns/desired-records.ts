import type { ProductSpec } from '../types.js';
import type { DnsRecord } from './cloudflare.js';

/**
 * Compute the DNS records launchkit wants to see for a given product spec.
 *
 * Hosting target lookup is intentionally simple — when the host isn't known,
 * we fall back to leaving an apex CNAME instruction in the dns-status.md
 * rather than silently picking a wrong target.
 */

export interface HostingTarget {
  /** Apex (root domain) record(s) — can be A, AAAA, or ALIAS/CNAME-flattening. */
  apex: { type: 'A' | 'AAAA' | 'CNAME'; content: string }[];
  /** Optional www CNAME. */
  www?: { type: 'CNAME'; content: string };
}

export const HOSTING_TARGETS: Record<string, HostingTarget> = {
  Netlify: {
    apex: [{ type: 'A', content: '75.2.60.5' }],
    www: { type: 'CNAME', content: 'apex-loadbalancer.netlify.com' },
  },
  Vercel: {
    apex: [{ type: 'A', content: '76.76.21.21' }],
    www: { type: 'CNAME', content: 'cname.vercel-dns.com' },
  },
  'Cloudflare Pages': {
    apex: [{ type: 'CNAME', content: 'pages.dev' }],
    www: { type: 'CNAME', content: 'pages.dev' },
  },
  'GitHub Pages': {
    apex: [
      { type: 'A', content: '185.199.108.153' },
      { type: 'A', content: '185.199.109.153' },
      { type: 'A', content: '185.199.110.153' },
      { type: 'A', content: '185.199.111.153' },
    ],
  },
};

export interface EmailForwardingTarget {
  mx: Array<{ priority: number; content: string }>;
  spfInclude: string;
  /** Plain-text DMARC record. */
  dmarc: string;
}

/** Default forwarder: ImprovMX. Reasonable starting point; user can swap to Cloudflare Email Routing or Google Workspace later. */
export const DEFAULT_EMAIL_FORWARDER: EmailForwardingTarget = {
  mx: [
    { priority: 10, content: 'mx1.improvmx.com' },
    { priority: 20, content: 'mx2.improvmx.com' },
  ],
  spfInclude: 'spf.improvmx.com',
  dmarc: 'v=DMARC1; p=none; sp=none; aspf=r; adkim=r;',
};

export interface DesiredRecord extends DnsRecord {
  /** Why launchkit wants this record, surfaced in dns-status.md. */
  rationale: string;
}

export function computeDesiredRecords(spec: ProductSpec): DesiredRecord[] {
  const records: DesiredRecord[] = [];
  const apex = spec.domain;
  const www = `www.${apex}`;
  const hosting = spec.hosting && HOSTING_TARGETS[spec.hosting];

  if (hosting) {
    for (const a of hosting.apex) {
      records.push({
        type: a.type,
        name: apex,
        content: a.content,
        ttl: 1,
        rationale: `Apex points to ${spec.hosting} load balancer.`,
      });
    }
    if (hosting.www) {
      records.push({
        type: hosting.www.type,
        name: www,
        content: hosting.www.content,
        ttl: 1,
        rationale: `www subdomain → ${spec.hosting}.`,
      });
    }
  }

  // Email forwarding (MX + SPF + DMARC).
  for (const mx of DEFAULT_EMAIL_FORWARDER.mx) {
    records.push({
      type: 'MX',
      name: apex,
      content: mx.content,
      priority: mx.priority,
      ttl: 1,
      rationale: 'Email forwarding via ImprovMX.',
    });
  }
  records.push({
    type: 'TXT',
    name: apex,
    content: `v=spf1 include:${DEFAULT_EMAIL_FORWARDER.spfInclude} ~all`,
    ttl: 1,
    rationale: 'SPF — authorise the forwarder to send mail for the apex.',
  });
  records.push({
    type: 'TXT',
    name: `_dmarc.${apex}`,
    content: DEFAULT_EMAIL_FORWARDER.dmarc,
    ttl: 1,
    rationale: 'DMARC — start lenient (p=none) so reports flow without bouncing legit mail.',
  });

  // CAA — lock CA issuance to Let's Encrypt + the hosting CA (if known).
  records.push({
    type: 'CAA',
    name: apex,
    content: '0 issue "letsencrypt.org"',
    ttl: 1,
    rationale: "CAA — restrict cert issuance to Let's Encrypt.",
  });

  return records;
}

/**
 * A record from Cloudflare matches a desired record when type+name+content
 * align. We deliberately do NOT compare TTL or priority strictly — a CF
 * "automatic" TTL of 1 is functionally identical to any small TTL we'd ask
 * for, and an MX with the same target is a duplicate even at a different
 * priority (the operator can adjust later).
 */
export function recordMatches(desired: DnsRecord, existing: DnsRecord): boolean {
  if (desired.type !== existing.type) return false;
  if (normalizeName(desired.name) !== normalizeName(existing.name)) return false;
  if (normalizeContent(desired.type, desired.content) !== normalizeContent(existing.type, existing.content)) {
    return false;
  }
  return true;
}

function normalizeName(name: string): string {
  return name.replace(/\.$/, '').toLowerCase();
}

function normalizeContent(type: DnsRecord['type'], content: string): string {
  if (type === 'TXT') {
    return content.replace(/^"|"$/g, '').trim();
  }
  return content.replace(/\.$/, '').trim().toLowerCase();
}
