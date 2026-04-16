/**
 * threadStoreSqliteFts.ts — FTS5 setup and maintenance helpers for ThreadStoreSqliteRuntime.
 *
 * Extracted to keep threadStoreSqlite.ts under the 300-line ESLint limit.
 * All functions are pure with respect to the runtime class — they take explicit
 * arguments rather than operating on `this`.
 */

import log from '../logger';
import type { Database } from '../storage/database';
import {
  backfillFts,
  extractFilePathsFromBlocks,
  FTS_SCHEMA_SQL,
  isFts5Available,
} from './threadStoreSqliteHelpers';
import type { AgentChatThreadRecord } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FtsRowData {
  threadId: string;
  content: string;
  tags: string;
  filePaths: string;
}

// ── Public helpers ────────────────────────────��──────────────────────���─────────

/**
 * Create the FTS5 virtual table if FTS5 is available.
 * Returns whether FTS5 is usable after this call.
 */
export function ensureFtsTable(db: Database): boolean {
  const available = isFts5Available(db);
  if (!available) {
    log.warn('[threadStore] FTS5 unavailable — full-text search will fall back to LIKE queries');
    return false;
  }
  try {
    db.exec(FTS_SCHEMA_SQL);
    return true;
  } catch (err) {
    log.warn('[threadStore] Failed to create FTS5 table:', err);
    return false;
  }
}

/**
 * v4→v5 migration: create the FTS5 table and backfill from existing data.
 * Must be called inside an existing transaction.
 */
export function applyFtsMigration(db: Database): void {
  if (!isFts5Available(db)) {
    log.warn('[threadStore] FTS5 unavailable — skipping v4→v5 FTS table creation');
    return;
  }
  try {
    db.exec(FTS_SCHEMA_SQL);
    backfillFts(db);
  } catch (err) {
    log.warn('[threadStore] FTS5 migration failed:', err);
  }
}

/**
 * Upsert a single FTS row. No-ops silently on any SQLite error so FTS failures
 * are never fatal to the main write path.
 */
export function upsertFtsRow(db: Database, row: FtsRowData): void {
  try {
    db.prepare('DELETE FROM thread_fts WHERE threadId = ?').run(row.threadId);
    db.prepare(
      'INSERT INTO thread_fts(threadId, content, tags, filePaths) VALUES (?, ?, ?, ?)',
    ).run(row.threadId, row.content, row.tags, row.filePaths);
  } catch {
    // FTS errors are non-fatal
  }
}

/**
 * Build the FTS row data from a thread record and upsert it.
 * Must be called inside a transaction alongside the message writes.
 */
export function refreshFtsForThread(db: Database, thread: AgentChatThreadRecord): void {
  const content = thread.messages.map((m) => m.content).filter(Boolean).join(' ');
  const tags = (thread.tags ?? []).join(' ');
  const filePaths = thread.messages
    .map((m) => extractFilePathsFromBlocks(m.blocks ? JSON.stringify(m.blocks) : null))
    .filter(Boolean)
    .join(' ');
  upsertFtsRow(db, { threadId: thread.id, content, tags, filePaths });
}
