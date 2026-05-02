/**
 * threadStoreSqliteWriters.ts — SQL write helpers for the thread store SQLite runtime.
 *
 * Extracted from threadStoreSqliteHelpers.ts to keep file line counts under
 * the ESLint limit. Contains upsert/insert statements and param builders.
 */

import type BetterSqlite3 from 'better-sqlite3';

import type { Database } from '../storage/database';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ── Thread upsert ─────────────────────────────────────────────────────────────

const UPSERT_THREAD_SQL = `
  INSERT INTO threads
    (id, workspaceRoot, createdAt, updatedAt, title, status,
     latestOrchestration, branchInfo, tags, pinned, deletedAt,
     branchName, forkOfMessageId, parentThreadId, isSideChat)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    workspaceRoot = excluded.workspaceRoot,
    createdAt = excluded.createdAt,
    updatedAt = excluded.updatedAt,
    title = excluded.title,
    status = excluded.status,
    latestOrchestration = excluded.latestOrchestration,
    branchInfo = excluded.branchInfo,
    tags = excluded.tags,
    pinned = excluded.pinned,
    deletedAt = excluded.deletedAt,
    branchName = excluded.branchName,
    forkOfMessageId = excluded.forkOfMessageId,
    parentThreadId = excluded.parentThreadId,
    isSideChat = excluded.isSideChat`;

function threadRowJsonFields(t: AgentChatThreadRecord): unknown[] {
  return [
    t.latestOrchestration ? JSON.stringify(t.latestOrchestration) : null,
    t.branchInfo ? JSON.stringify(t.branchInfo) : null,
    t.tags && t.tags.length > 0 ? JSON.stringify(t.tags) : null,
  ];
}

function threadRowParams(t: AgentChatThreadRecord): unknown[] {
  return [
    t.id,
    t.workspaceRoot,
    t.createdAt,
    t.updatedAt,
    t.title,
    t.status,
    ...threadRowJsonFields(t),
    t.pinned ? 1 : 0,
    t.deletedAt ?? null,
    t.branchName ?? null,
    t.forkOfMessageId ?? null,
    t.parentThreadId ?? null,
    t.isSideChat ? 1 : 0,
  ];
}

export function upsertThreadRow(db: Database, thread: AgentChatThreadRecord): void {
  db.prepare(UPSERT_THREAD_SQL).run(...threadRowParams(thread));
}

// ── Message insert ────────────────────────────────────────────────────────────

const INSERT_MESSAGE_SQL = `
  INSERT OR REPLACE INTO messages
    (id, threadId, role, content, createdAt, statusKind, orchestration,
     contextSummary, verificationPreview, error, toolsSummary, costSummary,
     durationSummary, tokenUsage, blocks, model, checkpointCommit,
     reactions, collapsedByDefault, skillExecutions)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export function prepareInsertMessage(db: Database): BetterSqlite3.Statement {
  return db.prepare(INSERT_MESSAGE_SQL);
}

function serializeArray(arr: unknown[] | undefined): string | null {
  return arr && arr.length > 0 ? JSON.stringify(arr) : null;
}

export function runInsertMessage(
  stmt: BetterSqlite3.Statement,
  threadId: string,
  msg: AgentChatMessageRecord,
): void {
  const s = (v: unknown) => (v ? JSON.stringify(v) : null);
  stmt.run(
    msg.id,
    threadId,
    msg.role,
    msg.content,
    msg.createdAt,
    msg.statusKind ?? null,
    s(msg.orchestration),
    s(msg.contextSummary),
    s(msg.verificationPreview),
    s(msg.error),
    msg.toolsSummary ?? null,
    msg.costSummary ?? null,
    msg.durationSummary ?? null,
    s(msg.tokenUsage),
    s(msg.blocks),
    msg.model ?? null,
    msg.checkpointCommit ?? null,
    serializeArray(msg.reactions),
    msg.collapsedByDefault ? 1 : null,
    serializeArray(msg.skillExecutions),
  );
}
