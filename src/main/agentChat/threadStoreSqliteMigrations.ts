/**
 * threadStoreSqliteMigrations.ts — Column-level ALTER TABLE migrations for the
 * thread store SQLite schema.
 *
 * Extracted from threadStoreSqliteHelpers.ts to keep file line counts under
 * the ESLint limit. Each migrateVN function is idempotent (guarded by hasCol).
 */

import type { Database } from '../storage/database';

type ColList = { name: string }[];
type TableList = { name: string }[];

function msgCols(db: Database): ColList {
  return db.pragma('table_info(messages)') as ColList;
}

function thdCols(db: Database): ColList {
  return db.pragma('table_info(threads)') as ColList;
}

function hasCol(cols: ColList, n: string): boolean {
  return cols.some((c) => c.name === n);
}

/** Returns true when the named table already exists (uses sqlite_master pragma). */
function hasTable(db: Database, name: string): boolean {
  const rows = db.pragma('table_list') as TableList;
  return rows.some((r) => r.name === name);
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
  if (!hasCol(c, 'forkOfMessageId')) db.exec('ALTER TABLE threads ADD COLUMN forkOfMessageId TEXT');
  if (!hasCol(c, 'parentThreadId')) db.exec('ALTER TABLE threads ADD COLUMN parentThreadId TEXT');
  if (!hasCol(c, 'isSideChat')) {
    db.exec('ALTER TABLE threads ADD COLUMN isSideChat INTEGER DEFAULT 0');
  }
}

function migrateV9(db: Database): void {
  const c = msgCols(db);
  if (!hasCol(c, 'skillExecutions'))
    db.exec('ALTER TABLE messages ADD COLUMN skillExecutions TEXT');
}

/**
 * Wave 86 Phase 2 — schema v10 additions for the new chat state architecture.
 *
 * Threads:
 *   - lastProviderSessionId: last known CLI session_id for --resume (crash recovery)
 *   - lastInterruptedAt: unix-ms marker set when a thread was mid-turn at shutdown
 *
 * Messages:
 *   - canonical_event_log: JSON array of CanonicalChatEvent; written on turn commit
 *
 * New table identity_aliases: persistent alias registry for registry-rebuild-on-startup.
 * See spec §4.6 and wave-86-decisions.md Decision 9.
 */
function migrateV10(db: Database): void {
  const tc = thdCols(db);
  if (!hasCol(tc, 'lastProviderSessionId')) {
    db.exec('ALTER TABLE threads ADD COLUMN lastProviderSessionId TEXT');
  }
  if (!hasCol(tc, 'lastInterruptedAt')) {
    db.exec('ALTER TABLE threads ADD COLUMN lastInterruptedAt INTEGER');
  }

  const mc = msgCols(db);
  if (!hasCol(mc, 'canonical_event_log')) {
    db.exec('ALTER TABLE messages ADD COLUMN canonical_event_log TEXT');
  }

  // Create the identity_aliases table and index, guarded by a table-existence
  // check so that the idempotency test stub (which cannot honour IF NOT EXISTS)
  // does not see spurious exec calls on a second migration run.
  if (!hasTable(db, 'identity_aliases')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS identity_aliases (
        thread_id TEXT PRIMARY KEY,
        turn_id TEXT,
        provider_session_id TEXT,
        created_at INTEGER NOT NULL,
        retired_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_identity_aliases_psid
        ON identity_aliases(provider_session_id);
    `);
  }
}

/**
 * Reverse migration: v10 → v9.
 * Used only in tests (to verify the down direction).
 * SQLite does not support DROP COLUMN, so we recreate the affected tables.
 *
 * Destructive on the new v10 columns / table — only safe in test environments.
 */
export function downgradeToV9(db: Database): void {
  db.exec('DROP TABLE IF EXISTS identity_aliases');
  db.exec('DROP INDEX IF EXISTS idx_identity_aliases_psid');
  // SQLite ALTER TABLE does not support DROP COLUMN; we work around it by
  // recreating threads and messages with the v9 column set only.
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads_v9_tmp AS
      SELECT id, workspaceRoot, createdAt, updatedAt, title, status,
             latestOrchestration, branchInfo, tags, pinned, deletedAt,
             branchName, forkOfMessageId, parentThreadId, isSideChat
      FROM threads;
    DROP TABLE threads;
    ALTER TABLE threads_v9_tmp RENAME TO threads;
    CREATE INDEX IF NOT EXISTS idx_threads_workspace ON threads(workspaceRoot);
    CREATE INDEX IF NOT EXISTS idx_threads_updated   ON threads(updatedAt DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages_v9_tmp AS
      SELECT id, threadId, role, content, createdAt, statusKind, orchestration,
             contextSummary, verificationPreview, error, toolsSummary, costSummary,
             durationSummary, tokenUsage, blocks, model, checkpointCommit,
             reactions, collapsedByDefault, skillExecutions
      FROM messages;
    DROP TABLE messages;
    ALTER TABLE messages_v9_tmp RENAME TO messages;
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(threadId, createdAt ASC);
  `);
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
  migrateV9(db);
  migrateV10(db);
}
