import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * SQLite-backed status tracker. One file per project (e.g.
 * examples/famshield/status.db). Survives session restart so a paused launch
 * can be resumed without losing context.
 */
export interface StatusDB {
  recordSubmission(row: SubmissionRow): void;
  recordAccount(row: AccountRow): void;
  recordContent(row: ContentRow): void;
  recordSchemaCheck(row: SchemaCheckRow): void;
  listSubmissions(): SubmissionRow[];
  listAccounts(): AccountRow[];
  listContent(): ContentRow[];
  listSchemaChecks(): SchemaCheckRow[];
  close(): void;
}

export type SubmissionStatus = 'success' | 'failed' | 'needs-human' | 'pending';
export type AccountStatus = 'created' | 'pending-verification' | 'needs-human' | 'not-started';
export type ContentStatus = 'drafted' | 'published' | 'pending';
export type SchemaCheckStatus = 'passed' | 'failed' | 'partial';

export interface SubmissionRow {
  directory: string;
  status: SubmissionStatus;
  url?: string;
  screenshotPath?: string;
  followUp?: string;
  errorDetail?: string;
  recordedAt?: string;
}

export interface AccountRow {
  platform: string;
  url: string;
  status: AccountStatus;
  handle?: string;
  notes?: string;
  recordedAt?: string;
}

export interface ContentRow {
  filename: string;
  channel: string;
  status: ContentStatus;
  publishedUrl?: string;
  charsOrWords?: number;
  recordedAt?: string;
}

export interface SchemaCheckRow {
  name: string;
  status: SchemaCheckStatus;
  detail?: string;
  recordedAt?: string;
}

export function openStatusDB(path: string): StatusDB {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      directory      TEXT PRIMARY KEY,
      status         TEXT NOT NULL,
      url            TEXT,
      screenshotPath TEXT,
      followUp       TEXT,
      errorDetail    TEXT,
      recordedAt     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS accounts (
      platform   TEXT PRIMARY KEY,
      url        TEXT NOT NULL,
      status     TEXT NOT NULL,
      handle     TEXT,
      notes      TEXT,
      recordedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS content (
      filename     TEXT PRIMARY KEY,
      channel      TEXT NOT NULL,
      status       TEXT NOT NULL,
      publishedUrl TEXT,
      charsOrWords INTEGER,
      recordedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS schema_checks (
      name       TEXT PRIMARY KEY,
      status     TEXT NOT NULL,
      detail     TEXT,
      recordedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const upsertSubmission = db.prepare(`
    INSERT INTO submissions (directory, status, url, screenshotPath, followUp, errorDetail)
    VALUES (@directory, @status, @url, @screenshotPath, @followUp, @errorDetail)
    ON CONFLICT(directory) DO UPDATE SET
      status         = excluded.status,
      url            = excluded.url,
      screenshotPath = excluded.screenshotPath,
      followUp       = excluded.followUp,
      errorDetail    = excluded.errorDetail,
      recordedAt     = datetime('now')
  `);

  const upsertAccount = db.prepare(`
    INSERT INTO accounts (platform, url, status, handle, notes)
    VALUES (@platform, @url, @status, @handle, @notes)
    ON CONFLICT(platform) DO UPDATE SET
      url        = excluded.url,
      status     = excluded.status,
      handle     = excluded.handle,
      notes      = excluded.notes,
      recordedAt = datetime('now')
  `);

  const upsertContent = db.prepare(`
    INSERT INTO content (filename, channel, status, publishedUrl, charsOrWords)
    VALUES (@filename, @channel, @status, @publishedUrl, @charsOrWords)
    ON CONFLICT(filename) DO UPDATE SET
      channel      = excluded.channel,
      status       = excluded.status,
      publishedUrl = excluded.publishedUrl,
      charsOrWords = excluded.charsOrWords,
      recordedAt   = datetime('now')
  `);

  const upsertSchemaCheck = db.prepare(`
    INSERT INTO schema_checks (name, status, detail)
    VALUES (@name, @status, @detail)
    ON CONFLICT(name) DO UPDATE SET
      status     = excluded.status,
      detail     = excluded.detail,
      recordedAt = datetime('now')
  `);

  return {
    recordSubmission(row) {
      upsertSubmission.run({
        url: null,
        screenshotPath: null,
        followUp: null,
        errorDetail: null,
        ...row,
      });
    },
    recordAccount(row) {
      upsertAccount.run({ handle: null, notes: null, ...row });
    },
    recordContent(row) {
      upsertContent.run({ publishedUrl: null, charsOrWords: null, ...row });
    },
    recordSchemaCheck(row) {
      upsertSchemaCheck.run({ detail: null, ...row });
    },
    listSubmissions: () => db.prepare('SELECT * FROM submissions ORDER BY directory').all() as SubmissionRow[],
    listAccounts: () => db.prepare('SELECT * FROM accounts ORDER BY platform').all() as AccountRow[],
    listContent: () => db.prepare('SELECT * FROM content ORDER BY channel, filename').all() as ContentRow[],
    listSchemaChecks: () => db.prepare('SELECT * FROM schema_checks ORDER BY name').all() as SchemaCheckRow[],
    close() {
      db.close();
    },
  };
}
