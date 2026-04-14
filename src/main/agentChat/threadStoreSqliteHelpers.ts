/**
 * threadStoreSqliteHelpers.ts — Row types, schema SQL, and pure helpers
 * for the SQLite-backed thread store runtime.
 */

import log from '../logger';
import { findFirstMeaningfulLine, isDecorativeLine, summarizeForTitle } from './chatTitleDerivation';
import type { AgentChatMessageRecord } from './types';

// ── Constants ────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 3;

export { findFirstMeaningfulLine, isDecorativeLine, summarizeForTitle };

// ── Schema SQL ───────────────────────────────────────────────────────

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL,
    createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
    title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle',
    latestOrchestration TEXT, branchInfo TEXT
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
