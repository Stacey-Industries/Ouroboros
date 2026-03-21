/**
 * threadStoreSqlite.ts — SQLite-backed runtime for chat thread persistence.
 *
 * Drop-in replacement for AgentChatThreadStoreRuntime (threadStoreRuntimeSupport.ts).
 * Tables:  threads + messages (FK → threads.id ON DELETE CASCADE)
 */

import type BetterSqlite3 from 'better-sqlite3';
import path from 'path';

import type { Database } from '../storage/database';
import {
  closeDatabase,
  getSchemaVersion,
  openDatabase,
  runTransaction,
  setSchemaVersion,
} from '../storage/database';
import { normalizeThreadRecord } from './threadStoreSupport';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

const SCHEMA_VERSION = 1;
const TITLE_MAX_LENGTH = 60;

// ── Helpers ─────────────────────────────────────────────────────────

function isDecorativeLine(line: string): boolean {
  if (/^`[^`]*`$/.test(line) && /[─═━\-★]{3,}/.test(line)) return true;
  if (/^[─═━\-*★│┃|+\s]+$/.test(line) && line.length > 2) return true;
  if (/^```/.test(line)) return true;
  return false;
}

function findFirstMeaningfulLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const stripped = line.trim();
    if (stripped && !isDecorativeLine(stripped)) return stripped;
  }
  return text.trim();
}

function summarizeForTitle(assistantContent: string): string {
  const trimmed = assistantContent.trim();
  if (!trimmed) return '';

  const meaningful = findFirstMeaningfulLine(trimmed);
  const sentenceMatch = meaningful.match(/^(.+?[.!?])(?:\s|$)/);
  const firstSentence = sentenceMatch ? sentenceMatch[1].trim() : '';

  if (firstSentence && firstSentence.length <= TITLE_MAX_LENGTH) return firstSentence;

  const slice = meaningful.slice(0, TITLE_MAX_LENGTH).trimEnd();
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > TITLE_MAX_LENGTH * 0.5) return `${slice.slice(0, lastSpace)}\u2026`;
  return `${slice}\u2026`;
}

// ── Schema SQL ──────────────────────────────────────────────────────

const SCHEMA_SQL = `
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
    PRIMARY KEY (id, threadId)
  );
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(threadId, createdAt ASC);
`;

// ── Row types ───────────────────────────────────────────────────────

interface RawThreadRow {
  id: string;
  workspaceRoot: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  status: string;
  latestOrchestration: string | null;
  branchInfo: string | null;
}

interface RawMessageRow {
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
}

function parseJsonField<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('[threadStoreSqlite] corrupt JSON field, returning undefined:', error);
    return undefined;
  }
}

 
function rowToMessage(row: RawMessageRow): AgentChatMessageRecord {
  const base: AgentChatMessageRecord = {
    id: row.id,
    threadId: row.threadId,
    role: row.role as AgentChatMessageRecord['role'],
    content: row.content,
    createdAt: row.createdAt,
  };
  if (row.statusKind) base.statusKind = row.statusKind as AgentChatMessageRecord['statusKind'];
  if (row.orchestration) base.orchestration = parseJsonField(row.orchestration);
  if (row.contextSummary) base.contextSummary = parseJsonField(row.contextSummary);
  if (row.verificationPreview) base.verificationPreview = parseJsonField(row.verificationPreview);
  if (row.error) base.error = parseJsonField(row.error);
  if (row.toolsSummary) base.toolsSummary = row.toolsSummary;
  if (row.costSummary) base.costSummary = row.costSummary;
  if (row.durationSummary) base.durationSummary = row.durationSummary;
  if (row.tokenUsage) base.tokenUsage = parseJsonField(row.tokenUsage);
  if (row.blocks) base.blocks = parseJsonField(row.blocks);
  return base;
}

// ── SQLite Runtime ──────────────────────────────────────────────────

export interface ThreadStoreSqliteRuntimeOptions {
  maxThreads: number;
  now: () => number;
  threadsDir: string;
}

export class ThreadStoreSqliteRuntime {
  private db: Database | null = null;

  constructor(private readonly options: ThreadStoreSqliteRuntimeOptions) {}

  getStorageDirectory(): string {
    return this.options.threadsDir;
  }

  async readThread(threadId: string): Promise<AgentChatThreadRecord | null> {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId) as
      | RawThreadRow
      | undefined;
    if (!row) return null;
    return this.rowToThread(row, this.loadMessages(db, threadId));
  }

  async loadAllThreads(): Promise<AgentChatThreadRecord[]> {
    const db = this.getDb();
    const rows = db
      .prepare('SELECT * FROM threads ORDER BY updatedAt DESC, createdAt DESC, id ASC')
      .all() as RawThreadRow[];
    if (rows.length === 0) return [];

    const allMessages = db
      .prepare('SELECT * FROM messages ORDER BY createdAt ASC, id ASC')
      .all() as RawMessageRow[];
    const byThread = new Map<string, AgentChatMessageRecord[]>();
    for (const r of allMessages) {
      let arr = byThread.get(r.threadId);
      if (!arr) {
        arr = [];
        byThread.set(r.threadId, arr);
      }
      arr.push(rowToMessage(r));
    }
    return rows.map((row) => this.rowToThread(row, byThread.get(row.id) ?? []));
  }

  async writeThread(thread: AgentChatThreadRecord): Promise<AgentChatThreadRecord> {
    const normalized = normalizeThreadRecord(thread, this.options.now);
    const db = this.getDb();
    runTransaction(db, () => {
      this.upsertThreadRow(db, normalized);
      db.prepare('DELETE FROM messages WHERE threadId = ?').run(normalized.id);
      const stmt = this.prepareInsertMessage(db);
      for (const msg of normalized.messages) this.runInsertMessage(stmt, normalized.id, msg);
    });
    this.pruneOldThreads();
    return normalized;
  }

  async appendSingleMessage(
    thread: AgentChatThreadRecord,
    message: AgentChatMessageRecord,
  ): Promise<void> {
    const db = this.getDb();
    runTransaction(db, () => {
      this.upsertThreadRow(db, thread);
      this.runInsertMessage(this.prepareInsertMessage(db), thread.id, message);
    });
  }

  async requireThread(threadId: string): Promise<AgentChatThreadRecord> {
    const thread = await this.readThread(threadId);
    if (!thread) throw new Error(`Chat thread not found: ${threadId}`);
    return thread;
  }

  async deleteThread(threadId: string): Promise<boolean> {
    return this.getDb().prepare('DELETE FROM threads WHERE id = ?').run(threadId).changes > 0;
  }

  /**
   * Update only thread-level metadata (status, title, latestOrchestration)
   * WITHOUT rewriting the messages table. This eliminates the race condition
   * where a concurrent updateThread + appendMessage could lose messages.
   */
  async updateThreadMetadataOnly(
    threadId: string,
    patch: {
      title?: string;
      status?: string;
      latestOrchestration?: unknown;
      updatedAt: number;
    },
  ): Promise<AgentChatThreadRecord | null> {
    const db = this.getDb();
    const setClauses: string[] = ['updatedAt = ?'];
    const params: unknown[] = [patch.updatedAt];

    if (patch.title !== undefined) {
      setClauses.push('title = ?');
      params.push(patch.title);
    }
    if (patch.status !== undefined) {
      setClauses.push('status = ?');
      params.push(patch.status);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'latestOrchestration')) {
      setClauses.push('latestOrchestration = ?');
      params.push(patch.latestOrchestration ? JSON.stringify(patch.latestOrchestration) : null);
    }

    params.push(threadId);
    const changes = db
      .prepare(`UPDATE threads SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...params).changes;

    if (changes === 0) return null;
    return this.readThread(threadId);
  }

  async updateTitleFromResponse(
    threadId: string,
    assistantContent: string,
  ): Promise<AgentChatThreadRecord | null> {
    const thread = await this.readThread(threadId);
    if (!thread) return null;
    const first = thread.messages.find((m) => m.role === 'user');
    if (!first || !this.titleMatchesUserMessage(thread.title, first.content)) return null;
    const newTitle = summarizeForTitle(assistantContent);
    if (!newTitle || newTitle === thread.title) return null;
    return this.updateThreadMetadataOnly(threadId, { title: newTitle, updatedAt: this.options.now() });
  }

  // Serialize mutations to prevent concurrent read-modify-write races.
  // Without this, two concurrent updateThread calls can interleave their
  // reads and writes, causing one to overwrite the other's changes.
  private mutationQueue: Promise<unknown> = Promise.resolve();

  runMutation<T>(action: () => Promise<T>): Promise<T> {
    const chained = this.mutationQueue.then(
      () => action(),
      () => action(), // continue even if previous mutation failed
    );
    this.mutationQueue = chained.catch(() => {}); // prevent unhandled rejection
    return chained;
  }

  close(): void {
    closeDatabase(this.db);
    this.db = null;
  }

  // ── Private ───────────────────────────────────────────────────────

  private titleMatchesUserMessage(title: string, content: string): boolean {
    const trimmed = content.trim();
    const firstLine =
      trimmed
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? '';
    if (title === trimmed || title === firstLine) return true;
    return trimmed.length > 79 && title === `${firstLine.slice(0, 79).trimEnd()}\u2026`;
  }

  private getDb(): Database {
    if (!this.db) {
      this.db = openDatabase(path.join(this.options.threadsDir, 'threads.db'));
      if (getSchemaVersion(this.db) < SCHEMA_VERSION) {
        runTransaction(this.db, () => {
          this.db!.exec(SCHEMA_SQL);
          setSchemaVersion(this.db!, SCHEMA_VERSION);
        });
      }
    }
    return this.db;
  }

  private loadMessages(db: Database, threadId: string): AgentChatMessageRecord[] {
    const rows = db
      .prepare('SELECT * FROM messages WHERE threadId = ? ORDER BY createdAt ASC, id ASC')
      .all(threadId) as RawMessageRow[];
    return rows.map(rowToMessage);
  }

  private rowToThread(
    row: RawThreadRow,
    messages: AgentChatMessageRecord[],
  ): AgentChatThreadRecord {
    return {
      version: 1,
      id: row.id,
      workspaceRoot: row.workspaceRoot,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      title: row.title,
      status: row.status as AgentChatThreadRecord['status'],
      messages,
      latestOrchestration: parseJsonField(row.latestOrchestration),
      branchInfo: parseJsonField(row.branchInfo),
    };
  }

  private upsertThreadRow(db: Database, thread: AgentChatThreadRecord): void {
    // IMPORTANT: Use INSERT ... ON CONFLICT DO UPDATE instead of INSERT OR REPLACE.
    // INSERT OR REPLACE is implemented as DELETE + INSERT in SQLite, which triggers
    // ON DELETE CASCADE on the messages table and silently wipes all messages.
    db.prepare(
      `INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status, latestOrchestration, branchInfo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         workspaceRoot = excluded.workspaceRoot,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt,
         title = excluded.title,
         status = excluded.status,
         latestOrchestration = excluded.latestOrchestration,
         branchInfo = excluded.branchInfo`,
    ).run(
      thread.id,
      thread.workspaceRoot,
      thread.createdAt,
      thread.updatedAt,
      thread.title,
      thread.status,
      thread.latestOrchestration ? JSON.stringify(thread.latestOrchestration) : null,
      thread.branchInfo ? JSON.stringify(thread.branchInfo) : null,
    );
  }

  private prepareInsertMessage(db: Database): BetterSqlite3.Statement {
    return db.prepare(
      `INSERT OR REPLACE INTO messages (id, threadId, role, content, createdAt, statusKind, orchestration,
        contextSummary, verificationPreview, error, toolsSummary, costSummary, durationSummary, tokenUsage, blocks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
  }

  private runInsertMessage(
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
    );
  }

  private pruneOldThreads(): void {
    if (this.options.maxThreads <= 0) return;
    const db = this.getDb();
    const cnt = (db.prepare('SELECT COUNT(*) as cnt FROM threads').get() as { cnt: number }).cnt;
    if (cnt <= this.options.maxThreads) return;
    db.prepare(
      `DELETE FROM threads WHERE id IN (
      SELECT id FROM threads ORDER BY updatedAt DESC, createdAt DESC LIMIT -1 OFFSET ?)`,
    ).run(this.options.maxThreads);
  }
}
