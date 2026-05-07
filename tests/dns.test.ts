import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createCloudflareClient } from '../src/dns/cloudflare.js';
import { computeDesiredRecords, recordMatches, HOSTING_TARGETS } from '../src/dns/desired-records.js';
import { setupDns } from '../src/dns/setup.js';
import type { ProductSpec } from '../src/types.js';

const SPEC: ProductSpec = {
  name: 'TestProduct',
  domain: 'testproduct.com',
  tagline: 'A simple tagline of six words',
  descriptions: { fifty: 'a'.repeat(60), hundred: 'b'.repeat(120), twoHundred: 'c'.repeat(220) },
  category: 'saas',
  audience: 'Indie hackers.',
  useCase: 'A weekend launch.',
  founder: { name: 'Test User' },
  handle: 'testproduct',
  github: { org: 'testorg', repo: 'testproduct' },
  brand: { primaryHex: '#112233', accentHex: '#445566' },
  hosting: 'Netlify',
  dnsProvider: 'Cloudflare',
  targetLaunchDate: '2026-12-31',
};

describe('computeDesiredRecords', () => {
  it('emits Netlify A record at the apex', () => {
    const records = computeDesiredRecords(SPEC);
    const apexA = records.find((r) => r.type === 'A' && r.name === 'testproduct.com');
    expect(apexA?.content).toBe(HOSTING_TARGETS.Netlify!.apex[0]!.content);
  });

  it('emits a CNAME for www', () => {
    const records = computeDesiredRecords(SPEC);
    const www = records.find((r) => r.type === 'CNAME' && r.name === 'www.testproduct.com');
    expect(www?.content).toBe('apex-loadbalancer.netlify.com');
  });

  it('emits MX records for ImprovMX with both priorities', () => {
    const records = computeDesiredRecords(SPEC);
    const mx = records.filter((r) => r.type === 'MX');
    expect(mx).toHaveLength(2);
    expect(mx.map((r) => r.priority).sort()).toEqual([10, 20]);
  });

  it('emits SPF and DMARC TXT records', () => {
    const records = computeDesiredRecords(SPEC);
    const spf = records.find((r) => r.type === 'TXT' && r.content.includes('v=spf1'));
    const dmarc = records.find((r) => r.type === 'TXT' && r.name.startsWith('_dmarc'));
    expect(spf).toBeDefined();
    expect(dmarc).toBeDefined();
  });

  it('emits a CAA record locking issuance to letsencrypt.org', () => {
    const records = computeDesiredRecords(SPEC);
    const caa = records.find((r) => r.type === 'CAA');
    expect(caa?.content).toContain('letsencrypt.org');
  });

  it('omits hosting records when hosting field is unknown', () => {
    const noHost = { ...SPEC, hosting: 'Some Random Host' };
    const records = computeDesiredRecords(noHost);
    expect(records.find((r) => r.type === 'A')).toBeUndefined();
    // Email + CAA still emitted.
    expect(records.find((r) => r.type === 'MX')).toBeDefined();
    expect(records.find((r) => r.type === 'CAA')).toBeDefined();
  });
});

describe('recordMatches', () => {
  it('matches identical records', () => {
    expect(
      recordMatches(
        { type: 'A', name: 'foo.com', content: '1.2.3.4', ttl: 1 },
        { type: 'A', name: 'foo.com', content: '1.2.3.4', ttl: 300 },
      ),
    ).toBe(true);
  });

  it('treats trailing dot in CNAME as equivalent', () => {
    expect(
      recordMatches(
        { type: 'CNAME', name: 'www.foo.com', content: 'apex-loadbalancer.netlify.com', ttl: 1 },
        { type: 'CNAME', name: 'www.foo.com', content: 'apex-loadbalancer.netlify.com.', ttl: 1 },
      ),
    ).toBe(true);
  });

  it('treats quoted vs unquoted TXT content as equivalent', () => {
    expect(
      recordMatches(
        { type: 'TXT', name: 'foo.com', content: 'v=spf1 include:spf.improvmx.com ~all', ttl: 1 },
        { type: 'TXT', name: 'foo.com', content: '"v=spf1 include:spf.improvmx.com ~all"', ttl: 1 },
      ),
    ).toBe(true);
  });

  it('rejects different content', () => {
    expect(
      recordMatches(
        { type: 'A', name: 'foo.com', content: '1.2.3.4', ttl: 1 },
        { type: 'A', name: 'foo.com', content: '5.6.7.8', ttl: 1 },
      ),
    ).toBe(false);
  });
});

describe('CloudflareClient (mocked fetch)', () => {
  function fakeFetch(map: Record<string, { ok: boolean; body: unknown }>): typeof fetch {
    return (async (input: string | Request | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = url.replace('https://api.cloudflare.com/client/v4', '');
      const stub = map[path] ?? map['*'];
      if (!stub) throw new Error(`unexpected fetch ${path}`);
      return new Response(JSON.stringify(stub.body), { status: stub.ok ? 200 : 400 });
    }) as unknown as typeof fetch;
  }

  it('listZones unwraps the envelope', async () => {
    const cf = createCloudflareClient({
      token: 'x',
      fetchImpl: fakeFetch({
        '/zones?per_page=50': { ok: true, body: { success: true, errors: [], result: [{ id: 'z1', name: 'foo.com', status: 'active' }] } },
      }),
    });
    const r = await cf.listZones();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value[0]?.name).toBe('foo.com');
  });

  it('surfaces Cloudflare API errors', async () => {
    const cf = createCloudflareClient({
      token: 'x',
      fetchImpl: fakeFetch({
        '/zones?per_page=50': { ok: false, body: { success: false, errors: [{ code: 7003, message: 'forbidden' }], result: null } },
      }),
    });
    const r = await cf.listZones();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('CF_API_ERROR');
      expect(r.error.message).toContain('7003');
    }
  });
});

describe('setupDns end-to-end (mocked Cloudflare)', () => {
  it('plans creates for missing records and preserves existing ones (dry-run)', async () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-dns-'));
    const fakeFetch = (async (input: string | Request | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = url.replace('https://api.cloudflare.com/client/v4', '');
      if (path.startsWith('/zones?name=')) {
        return new Response(JSON.stringify({ success: true, errors: [], result: [{ id: 'z1', name: 'testproduct.com', status: 'active' }] }), { status: 200 });
      }
      if (path === '/zones/z1/dns_records?per_page=200') {
        // Pre-existing: an apex A record matching what we want — so it should be preserved, not duplicated.
        return new Response(JSON.stringify({ success: true, errors: [], result: [
          { id: 'r1', type: 'A', name: 'testproduct.com', content: '75.2.60.5', ttl: 300 },
        ] }), { status: 200 });
      }
      throw new Error(`unexpected ${path}`);
    }) as unknown as typeof fetch;

    const r = await setupDns(SPEC, { outDir: out, dryRun: true, token: 'x', fetchImpl: fakeFetch });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const apex = r.value.alreadyPresent.find((d) => d.type === 'A' && d.name === 'testproduct.com');
      expect(apex).toBeDefined();
      expect(r.value.created).toHaveLength(0); // dry run
      const report = readFileSync(r.value.reportPath, 'utf-8');
      expect(report).toContain('# TestProduct — DNS status');
      expect(report).toContain('Already present');
    }
  });

  it('fails clearly when the zone is missing', async () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-dns-'));
    const fakeFetch = (async (input: string | Request | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/zones?name=')) {
        return new Response(JSON.stringify({ success: true, errors: [], result: [] }), { status: 200 });
      }
      throw new Error('unexpected');
    }) as unknown as typeof fetch;
    const r = await setupDns(SPEC, { outDir: out, dryRun: true, token: 'x', fetchImpl: fakeFetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('DNS_ZONE_NOT_FOUND');
  });

  it('fails clearly when no token is available', async () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-dns-'));
    const r = await setupDns(SPEC, { outDir: out, dryRun: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('DNS_NO_TOKEN');
  });

  it('rejects non-Cloudflare dnsProvider', async () => {
    const out = mkdtempSync(resolve(tmpdir(), 'launchkit-dns-'));
    const r = await setupDns({ ...SPEC, dnsProvider: 'Namecheap' }, { outDir: out, token: 'x', dryRun: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('DNS_UNSUPPORTED_PROVIDER');
  });
});
