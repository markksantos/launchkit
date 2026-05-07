import type { Result } from '../types.js';
import { err, ok } from '../types.js';

/**
 * Minimal Cloudflare API v4 client. Pure HTTP via fetch; no SDK needed.
 *
 * Token scopes required:
 *   - Zone → Read
 *   - DNS → Edit
 *
 * The client never mutates without diffing first — see `src/dns/setup.ts`.
 */

const API_BASE = 'https://api.cloudflare.com/client/v4';

export interface Zone {
  id: string;
  name: string;
  status: string;
}

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'CAA' | 'NS' | 'SRV';

export interface DnsRecord {
  id?: string;
  type: DnsRecordType;
  name: string;
  /** A: IPv4. AAAA: IPv6. CNAME: target. MX: target hostname. TXT: full value. CAA: tag-value. */
  content: string;
  ttl: number;
  /** MX-only. */
  priority?: number;
  proxied?: boolean;
  comment?: string;
}

export interface CloudflareClient {
  listZones(): Promise<Result<Zone[]>>;
  findZoneByName(name: string): Promise<Result<Zone | null>>;
  listRecords(zoneId: string): Promise<Result<DnsRecord[]>>;
  createRecord(zoneId: string, record: DnsRecord): Promise<Result<DnsRecord>>;
}

export interface ClientOptions {
  token: string;
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
}

interface CfEnvelope<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

export function createCloudflareClient(opts: ClientOptions): CloudflareClient {
  const f = opts.fetchImpl ?? fetch;

  async function call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
    let res: Response;
    try {
      res = await f(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${opts.token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? null : JSON.stringify(body),
      });
    } catch (cause) {
      return err('CF_NETWORK', `Cloudflare API request failed: ${(cause as Error).message}`, 'Check your network and the API token.', cause);
    }

    let parsed: CfEnvelope<T>;
    try {
      parsed = (await res.json()) as CfEnvelope<T>;
    } catch (cause) {
      return err('CF_BAD_JSON', `Cloudflare returned non-JSON ${res.status}.`, undefined, cause);
    }

    if (!res.ok || !parsed.success) {
      const detail = (parsed.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${res.status}`;
      return err('CF_API_ERROR', `Cloudflare API error: ${detail}`, 'Verify the token has Zone:Read + DNS:Edit scopes for this zone.');
    }
    return ok(parsed.result);
  }

  return {
    async listZones() {
      return call<Zone[]>('GET', '/zones?per_page=50');
    },
    async findZoneByName(name) {
      const r = await call<Zone[]>('GET', `/zones?name=${encodeURIComponent(name)}`);
      if (!r.ok) return r;
      return ok(r.value[0] ?? null);
    },
    async listRecords(zoneId) {
      return call<DnsRecord[]>('GET', `/zones/${zoneId}/dns_records?per_page=200`);
    },
    async createRecord(zoneId, record) {
      return call<DnsRecord>('POST', `/zones/${zoneId}/dns_records`, record);
    },
  };
}
