/**
 * threadStoreSqliteV10Migration.test.ts — Schema v9 → v10 round-trip tests.
 *
 * Wave 86 Phase 2: verifies the up/down migration pair for schema v10.
 *
 * Uses an in-memory better-sqlite3 database seeded with representative v9 rows
 * (one thread, two messages). No binary fixture file is checked into the repo —
 * the programmatic seeder is the "fixture" per the codebase pattern for DB tests.
 *
 * Coverage:
 *   up (v9 → v10):
 *     - threads table gains lastProviderSessionId and lastInterruptedAt columns
 *     - messages table gains canonical_event_log column
 *     - identity_aliases table is created with the correct schema
 *     - idx_identity_aliases_psid index is created
 *     - all pre-existing thread and message rows are preserved with correct values
 *     - new columns are NULL on pre-existing rows
 *     - identity_aliases is empty after migration (populated by turn registrations)
 *   down (v10 → v9):
 *     - threads table loses lastProviderSessionId and lastInterruptedAt
 *     - messages table loses canonical_event_log
 *     - identity_aliases table is dropped
 *     - all pre-existing thread and message rows are still present with correct values
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database as DbType } from '../storage/database';
import { applyColumnMigrations, downgradeToV9 } from './threadStoreSqliteMigrations';

// ─── v9 schema (baseline — no v10 columns) ────────────────────────────────────

const V9_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL,
    createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
    title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle',
    latestOrchestration TEXT, branchInfo TEXT, tags TEXT,
    pinned INTEGER DEFAULT 0, deletedAt INTEGER,
    branchName TEXT, forkOfMessageId TEXT, parentThreadId TEXT,
    isSideChat INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_threads_workspace ON threads(workspaceRoot);
  CREATE INDEX IF NOT EXISTS idx_threads_updated   ON threads(updatedAt DESC);
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT NOT NULL, threadId TEXT NOT NULL,
    role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL,
    statusKind TEXT, orchestration TEXT, contextSummary TEXT,
    verificationPreview TEXT, error TEXT, toolsSummary TEXT,
    costSummary TEXT, durationSummary TEXT, tokenUsage TEXT, blocks TEXT,
    model TEXT, checkpointCommit TEXT,
    reactions TEXT, collapsedByDefault INTEGER DEFAULT 0,
    skillExecutions TEXT,
    PRIMARY KEY (id, threadId)
  );
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(threadId, createdAt ASC);
`;

// ─── Seed data ────────────────────────────────────────────────────────────────

const THREAD_ID = 'thread-migration-test-1';
const MSG1_ID = 'msg-migration-1';
const MSG2_ID = 'msg-migration-2';

function seedV9(db: InstanceType<typeof Database>): void {
  db.exec(V9_SCHEMA_SQL);
  db.prepare(
    `INSERT INTO threads
       (id, workspaceRoot, createdAt, updatedAt, title, status, tags, pinned)
     VALUES (?, '/workspace', 1000, 2000, 'Migration test thread', 'idle', '["tag1"]', 1)`,
  ).run(THREAD_ID);
  db.prepare(
    `INSERT INTO messages
       (id, threadId, role, content, createdAt, model, skillExecutions)
     VALUES (?, ?, 'user', 'Hello migration', 1001, 'claude-opus-4', NULL)`,
  ).run(MSG1_ID, THREAD_ID);
  db.prepare(
    `INSERT INTO messages
       (id, threadId, role, content, createdAt, model)
     VALUES (?, ?, 'assistant', 'Hi there', 1002, 'claude-opus-4')`,
  ).run(MSG2_ID, THREAD_ID);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function colNames(db: InstanceType<typeof Database>, table: string): string[] {
  return (db.pragma(`table_info(${table})`) as { name: string }[]).map((r) => r.name);
}

function tableExists(db: InstanceType<typeof Database>, name: string): boolean {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return row !== undefined;
}

function indexExists(db: InstanceType<typeof Database>, name: string): boolean {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(name);
  return row !== undefined;
}

// ─── Test setup ────────────────────────────────────────────────────────────────

let db: InstanceType<typeof Database>;

beforeEach(() => {
  db = new Database(':memory:');
  seedV9(db);
});

afterEach(() => {
  db.close();
});

// ─── Up migration (v9 → v10) ──────────────────────────────────────────────────

describe('v9 → v10 up migration', () => {
  it('adds lastProviderSessionId column to threads', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    expect(colNames(db, 'threads')).toContain('lastProviderSessionId');
  });

  it('adds lastInterruptedAt column to threads', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    expect(colNames(db, 'threads')).toContain('lastInterruptedAt');
  });

  it('adds canonical_event_log column to messages', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    expect(colNames(db, 'messages')).toContain('canonical_event_log');
  });

  it('creates the identity_aliases table', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    expect(tableExists(db, 'identity_aliases')).toBe(true);
  });

  it('creates the idx_identity_aliases_psid index', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    expect(indexExists(db, 'idx_identity_aliases_psid')).toBe(true);
  });

  it('preserves the pre-existing thread row', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    const row = db.prepare('SELECT * FROM threads WHERE id = ?').get(THREAD_ID) as
      | Record<string, unknown>
      | undefined;
    expect(row).toBeDefined();
    expect(row!['workspaceRoot']).toBe('/workspace');
    expect(row!['title']).toBe('Migration test thread');
    expect(row!['status']).toBe('idle');
    expect(row!['pinned']).toBe(1);
  });

  it('preserves both pre-existing message rows', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    const rows = db
      .prepare('SELECT id, content FROM messages WHERE threadId = ? ORDER BY createdAt ASC')
      .all(THREAD_ID) as { id: string; content: string }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(MSG1_ID);
    expect(rows[0].content).toBe('Hello migration');
    expect(rows[1].id).toBe(MSG2_ID);
    expect(rows[1].content).toBe('Hi there');
  });

  it('new thread columns are NULL on pre-existing rows', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    const row = db
      .prepare('SELECT lastProviderSessionId, lastInterruptedAt FROM threads WHERE id = ?')
      .get(THREAD_ID) as { lastProviderSessionId: unknown; lastInterruptedAt: unknown };
    expect(row.lastProviderSessionId).toBeNull();
    expect(row.lastInterruptedAt).toBeNull();
  });

  it('new message column is NULL on pre-existing rows', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    const rows = db
      .prepare('SELECT canonical_event_log FROM messages WHERE threadId = ?')
      .all(THREAD_ID) as { canonical_event_log: unknown }[];
    for (const r of rows) {
      expect(r.canonical_event_log).toBeNull();
    }
  });

  it('identity_aliases is empty after migration (populated by turn registrations only)', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    const count = (
      db.prepare('SELECT COUNT(*) as cnt FROM identity_aliases').get() as {
        cnt: number;
      }
    ).cnt;
    expect(count).toBe(0);
  });

  it('is idempotent — running twice produces no error and same schema', () => {
    applyColumnMigrations(db as unknown as DbType, 9);
    expect(() => applyColumnMigrations(db as unknown as DbType, 10)).not.toThrow();
    expect(colNames(db, 'threads')).toContain('lastProviderSessionId');
  });
});

// ─── Down migration (v10 → v9) ────────────────────────────────────────────────

describe('v10 → v9 down migration', () => {
  beforeEach(() => {
    // Start from v10 by running up first.
    applyColumnMigrations(db as unknown as DbType, 9);
    // Insert an alias row to verify it's gone after downgrade.
    db.prepare(
      `INSERT INTO identity_aliases (thread_id, turn_id, created_at)
       VALUES ('thread-alias-test', 'turn-alias-test', 9999)`,
    ).run();
  });

  it('drops the identity_aliases table', () => {
    downgradeToV9(db as unknown as DbType);
    expect(tableExists(db, 'identity_aliases')).toBe(false);
  });

  it('removes lastProviderSessionId from threads', () => {
    downgradeToV9(db as unknown as DbType);
    expect(colNames(db, 'threads')).not.toContain('lastProviderSessionId');
  });

  it('removes lastInterruptedAt from threads', () => {
    downgradeToV9(db as unknown as DbType);
    expect(colNames(db, 'threads')).not.toContain('lastInterruptedAt');
  });

  it('removes canonical_event_log from messages', () => {
    downgradeToV9(db as unknown as DbType);
    expect(colNames(db, 'messages')).not.toContain('canonical_event_log');
  });

  it('preserves the pre-existing thread row after downgrade', () => {
    downgradeToV9(db as unknown as DbType);
    const row = db.prepare('SELECT * FROM threads WHERE id = ?').get(THREAD_ID) as
      | Record<string, unknown>
      | undefined;
    expect(row).toBeDefined();
    expect(row!['workspaceRoot']).toBe('/workspace');
    expect(row!['title']).toBe('Migration test thread');
    expect(row!['status']).toBe('idle');
  });

  it('preserves both pre-existing message rows after downgrade', () => {
    downgradeToV9(db as unknown as DbType);
    const rows = db
      .prepare('SELECT id, content FROM messages WHERE threadId = ? ORDER BY createdAt ASC')
      .all(THREAD_ID) as { id: string; content: string }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(MSG1_ID);
    expect(rows[1].id).toBe(MSG2_ID);
  });
});
