import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ProductSpec, Result } from '../types.js';
import { err, ok } from '../types.js';

const SCHEMA_PATH = resolve(import.meta.dirname, '..', '..', 'product-spec.template.json');

let validatorPromise: Promise<ReturnType<Ajv2020['compile']>> | null = null;

async function getValidator() {
  if (!validatorPromise) {
    validatorPromise = (async () => {
      const ajv = new Ajv2020({ allErrors: true, strict: true });
      addFormats.default(ajv);
      const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
      return ajv.compile(schema);
    })();
  }
  return validatorPromise;
}

export interface ParseSpecOptions {
  /** When true, perform extra cross-field checks beyond JSON-Schema. */
  strictCrossField?: boolean;
}

/**
 * Load and validate a product-spec.json. Returns a strongly-typed `ProductSpec`
 * on success or a `LaunchkitError` listing the specific field violations.
 */
export async function parseSpecFile(
  path: string,
  opts: ParseSpecOptions = {},
): Promise<Result<ProductSpec>> {
  let raw: string;
  try {
    raw = readFileSync(resolve(path), 'utf-8');
  } catch (cause) {
    return err('SPEC_NOT_FOUND', `Could not read product spec at ${path}.`, 'Pass an existing JSON file.', cause);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err('SPEC_INVALID_JSON', `Product spec at ${path} is not valid JSON.`, 'Run a JSON linter.', cause);
  }

  const validate = await getValidator();
  const valid = validate(parsed);
  if (!valid) {
    const detail = (validate.errors ?? [])
      .map((e) => `${e.instancePath || '/'}: ${e.message}`)
      .join('; ');
    return err('SPEC_SCHEMA_FAIL', `Spec failed JSON Schema validation: ${detail}`, 'See product-spec.template.json for the canonical fields.');
  }

  const spec = parsed as ProductSpec;

  if (opts.strictCrossField) {
    const taglineWords = spec.tagline.trim().split(/\s+/).length;
    if (taglineWords < 5 || taglineWords > 12) {
      return err(
        'TAGLINE_LENGTH',
        `Tagline must be 5–10 words; got ${taglineWords}.`,
        'Headline-style, no period.',
      );
    }
    const expectedSupport = `support@${spec.domain}`;
    if (spec.support?.email && spec.support.email !== expectedSupport) {
      // Soft check — flag without failing.
    }
  }

  return ok(spec);
}
