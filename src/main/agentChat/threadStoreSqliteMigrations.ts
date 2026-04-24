/**
 * threadStoreSqliteMigrations.ts — Column-level ALTER TABLE migrations for the
 * thread store SQLite schema.
 *
 * Extracted from threadStoreSqliteHelpers.ts to keep file line counts under
 * the ESLint limit. Each migrateVN function is idempotent (guarded by hasCol).
 */

import type { Database } from '../storage/database';

type ColList = { name: string }[];

function msgCols(db: Database): ColList {
  return db.pragma('table_info(messages)') as ColList;
}

function thdCols(db: Database): ColList {
  return db.pragma('table_info(threads)') as ColList;
}

function hasCol(cols: ColList, n: string): boolean {
  return cols.some((c) => c.name === n);
}

function migrateV1(db: Database): void {
  const c = msgCols(db);
  if (!hasCol(c, 'model')) db.exec('ALTER TABLE messages ADD COLUMN model TEXT');
}

function migrateV2(db: Database): void {
  const c = msgCols(db);
  if (!hasCol(c, 'checkpointCommit'))
    db.exec('ALTER TABLE messages ADD COLUMN checkpointCommit TEXT');
}

function migrateV3(db: Database): void {
  const c = thdCols(db);
  if (!hasCol(c, 'tags')) db.exec('ALTER TABLE threads ADD COLUMN tags TEXT');
}

function migrateV5(db: Database): void {
  const c = thdCols(db);
  if (!hasCol(c, 'pinned')) db.exec('ALTER TABLE threads ADD COLUMN pinned INTEGER DEFAULT 0');
  if (!hasCol(c, 'deletedAt')) db.exec('ALTER TABLE threads ADD COLUMN deletedAt INTEGER');
}

function migrateV6(db: Database): void {
  const c = msgCols(db);
  if (!hasCol(c, 'reactions')) db.exec('ALTER TABLE messages ADD COLUMN reactions TEXT');
  if (!hasCol(c, 'collapsedByDefault')) {
    db.exec('ALTER TABLE messages ADD COLUMN collapsedByDefault INTEGER DEFAULT 0');
  }
}

function migrateV8(db: Database): void {
  const c = thdCols(db);
  if (!hasCol(c, 'branchName')) db.exec('ALTER TABLE threads ADD COLUMN branchName TEXT');
  if (!hasCol(c, 'forkOfMessageId'))
    db.exec('ALTER TABLE threads ADD COLUMN forkOfMessageId TEXT');
  if (!hasCol(c, 'parentThreadId'))
    db.exec('ALTER TABLE threads ADD COLUMN parentThreadId TEXT');
  if (!hasCol(c, 'isSideChat')) {
    db.exec('ALTER TABLE threads ADD COLUMN isSideChat INTEGER DEFAULT 0');
  }
}

/**
 * Apply all stepwise ALTER TABLE migrations. Version-gating is intentionally
 * omitted — every `migrateVN` is idempotent (guarded internally by `hasCol`),
 * and we cannot trust `currentVersion` because an earlier buggy release used
 * inverted conditions that stamped DBs as v8 without actually applying the
 * v5/v6/v8 ALTERs. Running every migration every boot is cheap and self-healing.
 *
 * The `currentVersion` parameter is kept for call-site compatibility and future
 * use (e.g. data backfills that truly must only run once).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function applyColumnMigrations(db: Database, _currentVersion: number): void {
  migrateV1(db);
  migrateV2(db);
  migrateV3(db);
  migrateV5(db);
  migrateV6(db);
  migrateV8(db);
}
