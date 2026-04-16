/**
 * threadStoreSqliteHelpers.ts — Row types, schema SQL, and pure helpers
 * for the SQLite-backed thread store runtime.
 */

import type BetterSqlite3 from 'better-sqlite3';

import log from '../logger';
import type { Database } from '../storage/database';
import { findFirstMeaningfulLine, isDecorativeLine, summarizeForTitle } from './chatTitleDerivation';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ── Constants ────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 5;

export { findFirstMeaningfulLine, isDecorativeLine, summarizeForTitle };

// ── Schema SQL ───────────────────────────────────────────────────────

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL,
    createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
    title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle',
    latestOrchestration TEXT, branchInfo TEXT, tags TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_threads_workspace ON threads(workspaceRoot);
  CREATE INDEX IF NOT EXISTS idx_threads_updated   ON threads(updatedAt DESC);
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT NOT NULL, threadId TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL,
    statusKind TEXT, orchestration TEXT, contextSummary TEXT,
    verificationPreview TEXT, error TEXT, toolsSummary TEXT,
    costSummary TEXT, durationSummary TEXT, tokenUsage TEXT, blocks TEXT,
    model TEXT, checkpointCommit TEXT,
    PRIMARY KEY (id, threadId)
  );
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(threadId, createdAt ASC);
`;

/**
 * FTS5 virtual table DDL, kept separate so callers can skip it gracefully
 * when the SQLite build lacks ENABLE_FTS5 (e.g. some Linux system packages).
 */
export const FTS_SCHEMA_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS thread_fts USING fts5(
    threadId UNINDEXED,
    content,
    tags,
    filePaths,
    tokenize = 'porter unicode61'
  );
`;

// ── Row types ────────────────────────────────────────────────────────

export interface RawThreadRow {
  id: string;
  workspaceRoot: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  status: string;
  latestOrchestration: string | null;
  branchInfo: string | null;
  tags: string | null;
}

export interface RawMessageRow {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: number;
  statusKind: string | null;
  orchestration: string | null;
  contextSummary: string | null;
  verificationPreview: string | null;
  error: string | null;
  toolsSummary: string | null;
  costSummary: string | null;
  durationSummary: string | null;
  tokenUsage: string | null;
  blocks: string | null;
  model: string | null;
  checkpointCommit: string | null;
}

// ── Parse / convert helpers ──────────────────────────────────────────

export function parseTagsField(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function parseJsonField<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    log.warn('corrupt JSON field, returning undefined:', error);
    return undefined;
  }
}

function applyOptionalJsonFields(base: AgentChatMessageRecord, row: RawMessageRow): void {
  if (row.statusKind) base.statusKind = row.statusKind as AgentChatMessageRecord['statusKind'];
  if (row.orchestration) base.orchestration = parseJsonField(row.orchestration);
  if (row.contextSummary) base.contextSummary = parseJsonField(row.contextSummary);
  if (row.verificationPreview) base.verificationPreview = parseJsonField(row.verificationPreview);
  if (row.error) base.error = parseJsonField(row.error);
  if (row.tokenUsage) base.tokenUsage = parseJsonField(row.tokenUsage);
  if (row.blocks) base.blocks = parseJsonField(row.blocks);
}

function applyOptionalStringFields(base: AgentChatMessageRecord, row: RawMessageRow): void {
  if (row.toolsSummary) base.toolsSummary = row.toolsSummary;
  if (row.costSummary) base.costSummary = row.costSummary;
  if (row.durationSummary) base.durationSummary = row.durationSummary;
  if (row.model) base.model = row.model;
  if (row.checkpointCommit) base.checkpointCommit = row.checkpointCommit;
}

export function rowToMessage(row: RawMessageRow): AgentChatMessageRecord {
  const base: AgentChatMessageRecord = {
    id: row.id,
    threadId: row.threadId,
    role: row.role as AgentChatMessageRecord['role'],
    content: row.content,
    createdAt: row.createdAt,
  };
  applyOptionalJsonFields(base, row);
  applyOptionalStringFields(base, row);
  return base;
}

// ── FTS helpers ──────────────────────────────────────────────────────

type Db = import('../storage/database').Database;

/**
 * Check whether the SQLite build supports FTS5 by inspecting compile options.
 * Returns false gracefully if the PRAGMA itself fails.
 */
export function isFts5Available(db: Db): boolean {
  try {
    const rows = db.pragma('compile_options') as { compile_options: string }[];
    return rows.some((r) => r.compile_options === 'ENABLE_FTS5');
  } catch {
    return false;
  }
}

/**
 * Extract plain-text file paths from a message's blocks JSON field.
 * Returns a space-separated string suitable for FTS5 indexing.
 */
export function extractFilePathsFromBlocks(blocksJson: string | null): string {
  if (!blocksJson) return '';
  try {
    const blocks = JSON.parse(blocksJson) as unknown[];
    const paths: string[] = [];
    for (const block of blocks) {
      if (
        block !== null &&
        typeof block === 'object' &&
        'filePath' in block &&
        typeof (block as Record<string, unknown>).filePath === 'string'
      ) {
        paths.push((block as Record<string, unknown>).filePath as string);
      }
    }
    return paths.join(' ');
  } catch {
    return '';
  }
}

/**
 * Backfill the thread_fts table from all existing threads + messages.
 * Called inside the v4→v5 migration transaction.
 */
export function backfillFts(db: Db): void {
  const threads = db.prepare('SELECT id, tags FROM threads').all() as {
    id: string;
    tags: string | null;
  }[];
  const insertFts = db.prepare(
    'INSERT INTO thread_fts(threadId, content, tags, filePaths) VALUES (?, ?, ?, ?)',
  );
  for (const thread of threads) {
    const messages = db
      .prepare('SELECT content, blocks FROM messages WHERE threadId = ?')
      .all(thread.id) as { content: string; blocks: string | null }[];
    const content = messages.map((m) => m.content).join(' ');
    const tagsText = thread.tags ? (JSON.parse(thread.tags) as string[]).join(' ') : '';
    const filePaths = messages
      .map((m) => extractFilePathsFromBlocks(m.blocks))
      .filter(Boolean)
      .join(' ');
    insertFts.run(thread.id, content, tagsText, filePaths);
  }
}

// ── Title helpers ────────────────────────────────────────────────────

export function titleMatchesUserMessage(title: string, content: string): boolean {
  const trimmed = content.trim();
  const firstLine =
    trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? '';
  if (title === trimmed || title === firstLine) return true;
  return trimmed.length > 79 && title === `${firstLine.slice(0, 79).trimEnd()}\u2026`;
}

// ── Write helpers (used by ThreadStoreSqliteRuntime) ─────────────────────────

const UPSERT_THREAD_SQL = `
  INSERT INTO threads
    (id, workspaceRoot, createdAt, updatedAt, title, status, latestOrchestration, branchInfo, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    workspaceRoot = excluded.workspaceRoot,
    createdAt = excluded.createdAt,
    updatedAt = excluded.updatedAt,
    title = excluded.title,
    status = excluded.status,
    latestOrchestration = excluded.latestOrchestration,
    branchInfo = excluded.branchInfo,
    tags = excluded.tags`;

export function upsertThreadRow(db: Database, thread: AgentChatThreadRecord): void {
  db.prepare(UPSERT_THREAD_SQL).run(
    thread.id,
    thread.workspaceRoot,
    thread.createdAt,
    thread.updatedAt,
    thread.title,
    thread.status,
    thread.latestOrchestration ? JSON.stringify(thread.latestOrchestration) : null,
    thread.branchInfo ? JSON.stringify(thread.branchInfo) : null,
    thread.tags && thread.tags.length > 0 ? JSON.stringify(thread.tags) : null,
  );
}

const INSERT_MESSAGE_SQL = `
  INSERT OR REPLACE INTO messages
    (id, threadId, role, content, createdAt, statusKind, orchestration,
     contextSummary, verificationPreview, error, toolsSummary, costSummary,
     durationSummary, tokenUsage, blocks, model, checkpointCommit)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export function prepareInsertMessage(db: Database): BetterSqlite3.Statement {
  return db.prepare(INSERT_MESSAGE_SQL);
}

export function runInsertMessage(
  stmt: BetterSqlite3.Statement,
  threadId: string,
  msg: AgentChatMessageRecord,
): void {
  const s = (v: unknown) => (v ? JSON.stringify(v) : null);
  stmt.run(
    msg.id, threadId, msg.role, msg.content, msg.createdAt,
    msg.statusKind ?? null, s(msg.orchestration), s(msg.contextSummary),
    s(msg.verificationPreview), s(msg.error),
    msg.toolsSummary ?? null, msg.costSummary ?? null, msg.durationSummary ?? null,
    s(msg.tokenUsage), s(msg.blocks), msg.model ?? null, msg.checkpointCommit ?? null,
  );
}
