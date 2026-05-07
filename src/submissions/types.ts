/**
 * Static fixture describing how to submit a product to a directory.
 *
 * Recorded once by the operator (publicly inspecting the submit page); used
 * by the browser-operator agent at runtime against the user's authenticated
 * Playwright MCP session to fill and submit the form.
 *
 * The fixture deliberately stores selectors as a list of fallbacks so a
 * single CSS selector change doesn't immediately break the run — the agent
 * tries selectors in order and uses the first that resolves.
 */

export interface FormFieldSpec {
  /** Logical key from the spec/brand-identity that fills this field. */
  source: SourceField;
  /** The label as the operator should see it on the page (used for human review). */
  label: string;
  /** Ordered selectors to try at runtime; first match wins. */
  selectors: string[];
  /** True for textarea / contenteditable inputs that accept newlines. */
  multiline?: boolean;
  /** Field is optional — runner skips silently if no selector resolves. */
  optional?: boolean;
}

export type SourceField =
  | 'name'
  | 'domain'
  | 'tagline'
  | 'descriptionFifty'
  | 'descriptionHundred'
  | 'descriptionTwoHundred'
  | 'category'
  | 'audience'
  | 'useCase'
  | 'founderName'
  | 'founderEmail'
  | 'handle'
  | 'githubRepoUrl'
  | 'logoPath'
  | 'firstScreenshotPath';

export interface DirectoryFixture {
  /** Directory slug used in submissions/<slug>.json. */
  directory: string;
  /** Display name. */
  name: string;
  /** The submit URL the browser opens. */
  submitUrl: string;
  /** True if the submission form is gated behind login (the agent must be on an authenticated session before opening submitUrl). */
  requiresAuth?: boolean;
  /** Form fields ordered the way they appear on the page. */
  formFields: FormFieldSpec[];
  /** Submit button selectors. */
  submitSelector: string;
  /** Markers that prove submission landed. */
  successAssertions: string[];
  /** Known failure markers (captcha, login wall, rate limit). */
  failureAssertions: { kind: 'captcha' | 'login' | 'rate-limit' | 'other'; selector: string; message: string }[];
  /** ETA / approval flow note. */
  approvalNote: string;
  /** When the fixture was last verified. */
  recordedAt: string;
  /** When the operator last re-checked the selectors against the live page. */
  verifiedAt?: string;
}

export const fixtureSchema = {
  type: 'object',
  required: ['directory', 'name', 'submitUrl', 'formFields', 'submitSelector', 'successAssertions', 'failureAssertions', 'approvalNote', 'recordedAt'],
  additionalProperties: false,
  properties: {
    directory: { type: 'string', pattern: '^[a-z0-9-]{2,40}$' },
    name: { type: 'string', minLength: 2 },
    submitUrl: { type: 'string', format: 'uri' },
    requiresAuth: { type: 'boolean' },
    formFields: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source', 'label', 'selectors'],
        additionalProperties: false,
        properties: {
          source: { type: 'string' },
          label: { type: 'string' },
          selectors: { type: 'array', items: { type: 'string' }, minItems: 1 },
          multiline: { type: 'boolean' },
          optional: { type: 'boolean' },
        },
      },
    },
    submitSelector: { type: 'string', minLength: 1 },
    successAssertions: { type: 'array', items: { type: 'string' }, minItems: 1 },
    failureAssertions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'selector', 'message'],
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['captcha', 'login', 'rate-limit', 'other'] },
          selector: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
    approvalNote: { type: 'string' },
    recordedAt: { type: 'string', format: 'date-time' },
    verifiedAt: { type: 'string', format: 'date-time' },
  },
} as const;
