/**
 * Strong types for the launchkit product-spec. Mirrors product-spec.template.json
 * (the JSON Schema is the source of truth at runtime via ajv; these types let
 * TypeScript catch mistakes at compile time).
 */

export type ProductCategory =
  | 'saas'
  | 'consumer'
  | 'developer-tool'
  | 'mobile-app'
  | 'ai-tool'
  | 'marketplace'
  | 'browser-extension'
  | 'open-source'
  | 'other';

export type DirectorySlug =
  | 'betalist'
  | 'foundrlist'
  | 'microlaunch'
  | 'theresanaiforthat'
  | 'toolify'
  | 'futurepedia'
  | 'stackshare'
  | 'alternativeto'
  | 'saashub'
  | 'indiehackers'
  | 'f6s'
  | 'launchingnext'
  | 'startupbuffer'
  | 'betapage'
  | 'peerpush';

export interface ProductSpec {
  name: string;
  domain: string;
  tagline: string;
  descriptions: {
    fifty: string;
    hundred: string;
    twoHundred: string;
  };
  category: ProductCategory;
  audience: string;
  useCase: string;
  founder: {
    name: string;
    linkedin?: string;
    x?: string;
    email?: string;
  };
  handle: string;
  github: {
    org: string;
    repo: string;
  };
  brand: {
    primaryHex: string;
    accentHex: string;
    logoPath?: string;
    screenshotPaths?: string[];
  };
  support?: {
    email?: string;
    url?: string;
  };
  pricing?: {
    model?: 'one-time' | 'subscription' | 'freemium' | 'free' | 'usage-based';
    startingPriceUsd?: number;
    freeTrial?: boolean;
  };
  hosting?: string;
  dnsProvider?: string;
  targetLaunchDate: string;
  directories?: DirectorySlug[];
  subreddits?: string[];
  competitors?: string[];
}

/**
 * Result type used at every IO boundary. No throws across the library;
 * callers decide whether to surface, retry, or halt.
 */
export type Result<T, E = LaunchkitError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface LaunchkitError {
  code: string;
  message: string;
  /** Human-readable remediation hint. */
  hint?: string;
  /** Underlying cause for debugging — never shown to end users. */
  cause?: unknown;
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(code: string, message: string, hint?: string, cause?: unknown): Result<never> {
  return { ok: false, error: { code, message, ...(hint ? { hint } : {}), ...(cause !== undefined ? { cause } : {}) } };
}
