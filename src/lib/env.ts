import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Read environment variables from process.env first, then fall back to
 * `.env`, `.env.local`, `.env.production`, `.env.production.local` in the
 * given root (default: process.cwd()). The first match wins. We intentionally
 * do NOT mutate process.env — values are returned to the caller, who decides
 * what to do with them.
 */
export function readEnv(name: string, root: string = process.cwd()): string | undefined {
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.trim().length > 0) return fromProcess;

  const candidates = ['.env', '.env.local', '.env.production', '.env.production.local'];
  for (const file of candidates) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf-8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (key !== name) continue;
      let value = line.slice(eq + 1).trim();
      // Strip surrounding quotes.
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value.length > 0) return value;
    }
  }
  return undefined;
}
