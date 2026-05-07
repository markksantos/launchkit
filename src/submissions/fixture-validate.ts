import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { Result } from '../types.js';
import { err, ok } from '../types.js';
import type { DirectoryFixture } from './types.js';
import { fixtureSchema } from './types.js';

let validatorPromise: Promise<ReturnType<Ajv2020['compile']>> | null = null;

async function getValidator() {
  if (!validatorPromise) {
    validatorPromise = (async () => {
      const ajv = new Ajv2020({ allErrors: true, strict: false });
      addFormats.default(ajv);
      return ajv.compile(fixtureSchema as object);
    })();
  }
  return validatorPromise;
}

export async function validateFixtureFile(path: string): Promise<Result<DirectoryFixture>> {
  if (!existsSync(resolve(path))) {
    return err('FIXTURE_NOT_FOUND', `Fixture not found at ${path}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolve(path), 'utf-8'));
  } catch (cause) {
    return err('FIXTURE_INVALID_JSON', `Fixture at ${path} is not valid JSON.`, undefined, cause);
  }
  const validate = await getValidator();
  const valid = validate(parsed);
  if (!valid) {
    const detail = (validate.errors ?? []).map((e) => `${e.instancePath || '/'}: ${e.message}`).join('; ');
    return err('FIXTURE_SCHEMA_FAIL', `Fixture failed schema validation: ${detail}`);
  }
  return ok(parsed as DirectoryFixture);
}
