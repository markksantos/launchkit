import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseSpecFile } from '../src/spec/parse.js';

function tmpFile(name: string, contents: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'launchkit-spec-'));
  const path = resolve(dir, name);
  writeFileSync(path, contents);
  return path;
}

const VALID = {
  name: 'TestProduct',
  domain: 'testproduct.com',
  tagline: 'A simple tagline of six words',
  descriptions: {
    fifty: 'a'.repeat(80),
    hundred: 'b'.repeat(150),
    twoHundred: 'c'.repeat(300),
  },
  category: 'saas',
  audience: 'Indie hackers shipping side projects on weekends.',
  useCase: 'They want to launch in a weekend with an opinionated workflow.',
  founder: { name: 'Test User' },
  handle: 'testproduct',
  github: { org: 'testorg', repo: 'testproduct' },
  brand: { primaryHex: '#112233', accentHex: '#445566' },
  targetLaunchDate: '2026-12-31',
};

describe('parseSpecFile', () => {
  it('accepts a minimal valid spec', async () => {
    const path = tmpFile('spec.json', JSON.stringify(VALID));
    const r = await parseSpecFile(path);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe('TestProduct');
  });

  it('rejects a spec with a malformed tagline', async () => {
    const bad = { ...VALID, tagline: 'too short' };
    const path = tmpFile('spec.json', JSON.stringify(bad));
    const r = await parseSpecFile(path, { strictCrossField: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('TAGLINE_LENGTH');
  });

  it('rejects a spec missing required fields', async () => {
    const bad: Record<string, unknown> = { ...VALID };
    delete bad.handle;
    const path = tmpFile('spec.json', JSON.stringify(bad));
    const r = await parseSpecFile(path);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SPEC_SCHEMA_FAIL');
  });

  it('rejects a spec with an invalid handle', async () => {
    const bad = { ...VALID, handle: 'Has Spaces' };
    const path = tmpFile('spec.json', JSON.stringify(bad));
    const r = await parseSpecFile(path);
    expect(r.ok).toBe(false);
  });

  it('rejects a spec with a bad hex color', async () => {
    const bad = { ...VALID, brand: { primaryHex: 'red', accentHex: '#445566' } };
    const path = tmpFile('spec.json', JSON.stringify(bad));
    const r = await parseSpecFile(path);
    expect(r.ok).toBe(false);
  });

  it('rejects a non-existent file', async () => {
    const r = await parseSpecFile('/tmp/does-not-exist-launchkit.json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SPEC_NOT_FOUND');
  });

  it('rejects a malformed JSON file', async () => {
    const path = tmpFile('spec.json', '{not valid json');
    const r = await parseSpecFile(path);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SPEC_INVALID_JSON');
  });
});
