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
import {
  parseJsonField,
  type RawMessageRow,
  type RawThreadRow,
  rowToMessage,
  SCHEMA_SQL,
  SCHEMA_VERSION,
  summarizeForTitle,
  titleMatchesUserMessage,
} from './threadStoreSqliteHelpers';
import { normalizeThreadRecord } from './threadStoreSupport';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

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

  async updateThreadMetadataOnly(
    threadId: string,
    patch: {
      title?: string;
      status?: string;
      latestOrchestration?: unknown;
      updatedAt: number;
    },
  ): Promise<AgentChatThreadRecord | null> {
    const { setClauses, params } = buildMetadataPatchQuery(patch);
    params.push(threadId);
    const db = this.getDb();
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
    if (!first || !titleMatchesUserMessage(thread.title, first.content)) return null;
    const newTitle = summarizeForTitle(assistantContent);
    if (!newTitle || newTitle === thread.title) return null;
    return this.updateThreadMetadataOnly(threadId, {
      title: newTitle,
      updatedAt: this.options.now(),
    });
  }

  private mutationQueue: Promise<unknown> = Promise.resolve();

  runMutation<T>(action: () => Promise<T>): Promise<T> {
    const chained = this.mutationQueue.then(
      () => action(),
      () => action(),
    );
    this.mutationQueue = chained.catch(() => {});
    return chained;
  }

  close(): void {
    closeDatabase(this.db);
    this.db = null;
  }

  // ── Private ───────────────────────────────────────────────────────

  private getDb(): Database {
    if (!this.db) {
      this.db = openDatabase(path.join(this.options.threadsDir, 'threads.db'));
      const currentVersion = getSchemaVersion(this.db);
      if (currentVersion < SCHEMA_VERSION) {
        runTransaction(this.db, () => {
          this.db!.exec(SCHEMA_SQL);
          if (currentVersion >= 1) {
            // v1→v2: add model column to existing messages table
            const cols = this.db!.pragma('table_info(messages)') as { name: string }[];
            if (!cols.some((c) => c.name === 'model')) {
              this.db!.exec('ALTER TABLE messages ADD COLUMN model TEXT');
            }
          }
          if (currentVersion >= 2) {
            // v2→v3: add checkpointCommit column to existing messages table
            const cols = this.db!.pragma('table_info(messages)') as { name: string }[];
            if (!cols.some((c) => c.name === 'checkpointCommit')) {
              this.db!.exec('ALTER TABLE messages ADD COLUMN checkpointCommit TEXT');
            }
          }
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
        contextSummary, verificationPreview, error, toolsSummary, costSummary, durationSummary, tokenUsage,
        blocks, model, checkpointCommit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      msg.model ?? null,
      msg.checkpointCommit ?? null,
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

// ── Helpers ─────────────────────────────────────────────────────────

function buildMetadataPatchQuery(patch: {
  title?: string;
  status?: string;
  latestOrchestration?: unknown;
  updatedAt: number;
}): { setClauses: string[]; params: unknown[] } {
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

  return { setClauses, params };
}
