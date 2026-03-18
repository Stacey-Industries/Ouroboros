/**
 * database.ts — SQLite database foundation using better-sqlite3.
 *
 * Provides helpers to open databases with WAL mode, run transactions,
 * and manage schema versions.  Every database opened through this module
 * uses the same pragmas:
 *   - WAL journal mode  (concurrent reads, non-blocking writes)
 *   - synchronous = NORMAL  (safe with WAL, much faster than FULL)
 *   - busy_timeout = 5000   (wait up to 5 s instead of throwing SQLITE_BUSY)
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type { DatabaseType as Database };

/**
 * Opens (or creates) a SQLite database at `dbPath` with sensible defaults.
 * Parent directories are created automatically.
 */
export function openDatabase(dbPath: string): DatabaseType {
  const dir = path.dirname(dbPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(dir)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Performance & reliability pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Closes a database connection gracefully.
 * Silently ignores errors (e.g. already-closed handles).
 */
export function closeDatabase(db: DatabaseType | null | undefined): void {
  try {
    db?.close();
  } catch {
    // Already closed or invalid — nothing to do.
  }
}

/**
 * Runs `fn` inside a single SQLite transaction.
 * If `fn` throws, the transaction is rolled back and the error is re-thrown.
 */
export function runTransaction<T>(db: DatabaseType, fn: () => T): T {
  const run = db.transaction(fn);
  return run();
}

/**
 * Returns `true` if `tableName` exists in the database.
 */
export function tableExists(db: DatabaseType, tableName: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName) as { '1': number } | undefined;
  return row !== undefined;
}

/**
 * Reads the user_version pragma (used as a schema version tracker).
 */
export function getSchemaVersion(db: DatabaseType): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

/**
 * Sets the user_version pragma to `version`.
 */
export function setSchemaVersion(db: DatabaseType, version: number): void {
  // PRAGMA doesn't support parameters, so we inline the number safely.
  db.pragma(`user_version = ${Math.trunc(version)}`);
}
