/**
 * migrate.ts — One-time data migration from JSON files to SQLite.
 *
 * Non-destructive: renames source .json files to .json.bak after successful
 * migration.  If the .bak already exists, the migration is skipped (already done).
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import log from '../logger';
import type { Database } from './database';
import {
  closeDatabase,
  getSchemaVersion,
  openDatabase,
  runTransaction,
  setSchemaVersion,
} from './database';

// ── Graph Store migration ──────────────────────────────────────────────────

interface GraphJsonData {
  nodes: Array<{
    id: string;
    type: string;
    name: string;
    filePath: string;
    line: number;
    endLine?: number;
    metadata?: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
    metadata?: Record<string, unknown>;
  }>;
}

function ensureGraphSchema(db: Database): void {
  if (getSchemaVersion(db) >= 1) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
      filePath TEXT NOT NULL, line INTEGER NOT NULL, endLine INTEGER, metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
    CREATE INDEX IF NOT EXISTS idx_nodes_filePath ON nodes(filePath);
    CREATE TABLE IF NOT EXISTS edges (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL,
      target TEXT NOT NULL, type TEXT NOT NULL, metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
  `);
  setSchemaVersion(db, 1);
}

function insertGraphData(db: Database, data: GraphJsonData): void {
  const insertNode = db.prepare(
    `INSERT OR REPLACE INTO nodes (id, type, name, filePath, line, endLine, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEdge = db.prepare(
    `INSERT INTO edges (source, target, type, metadata) VALUES (?, ?, ?, ?)`,
  );
  runTransaction(db, () => {
    for (const n of data.nodes) {
      insertNode.run(
        n.id,
        n.type,
        n.name,
        n.filePath,
        n.line,
        n.endLine ?? null,
        n.metadata ? JSON.stringify(n.metadata) : null,
      );
    }
    for (const e of data.edges ?? []) {
      insertEdge.run(e.source, e.target, e.type, e.metadata ? JSON.stringify(e.metadata) : null);
    }
  });
}

export function migrateGraphStore(projectRoot: string): void {
  const jsonPath = path.join(projectRoot, '.ouroboros', 'graph.json');
  const bakPath = jsonPath + '.bak';

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(jsonPath) || fs.existsSync(bakPath)) return;

  let data: GraphJsonData;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as GraphJsonData;
    if (!Array.isArray(data.nodes)) return;
  } catch {
    return;
  }

  let db: Database | null = null;
  try {
    db = openDatabase(path.join(projectRoot, '.ouroboros', 'graph.db'));
    ensureGraphSchema(db);
    insertGraphData(db, data);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.renameSync(jsonPath, bakPath);
    log.info(
      `Graph store: migrated ${data.nodes.length} nodes, ${(data.edges ?? []).length} edges`,
    );
  } catch (err) {
    log.warn('Graph store migration failed:', err);
  } finally {
    closeDatabase(db);
  }
}

// ── Thread Store migration ─────────────────────────────────────────────────

function ensureThreadSchema(db: Database): void {
  if (getSchemaVersion(db) >= 1) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL,
      createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle',
      latestOrchestration TEXT, branchInfo TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_threads_workspace ON threads(workspaceRoot);
    CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updatedAt DESC);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT NOT NULL, threadId TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL,
      statusKind TEXT, orchestration TEXT, contextSummary TEXT,
      verificationPreview TEXT, error TEXT, toolsSummary TEXT,
      costSummary TEXT, durationSummary TEXT, tokenUsage TEXT, blocks TEXT,
      PRIMARY KEY (id, threadId)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(threadId, createdAt ASC);
  `);
  setSchemaVersion(db, 1);
}

function insertThreadMessages(
  insertMsg: ReturnType<Database['prepare']>,
  threadId: unknown,
  msgs: Array<Record<string, unknown>>,
): void {
  const s = (v: unknown) => (v ? JSON.stringify(v) : null);
  for (const m of msgs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (insertMsg as any).run(
      m.id, threadId, m.role, (m.content as string) ?? '',
      (m.createdAt as number) ?? 0, (m.statusKind as string) ?? null,
      s(m.orchestration), s(m.contextSummary), s(m.verificationPreview),
      s(m.error), (m.toolsSummary as string) ?? null,
      (m.costSummary as string) ?? null, (m.durationSummary as string) ?? null,
      s(m.tokenUsage), s(m.blocks),
    );
  }
}

function migrateOneThreadFile(
  db: Database,
  insertThread: ReturnType<Database['prepare']>,
  insertMsg: ReturnType<Database['prepare']>,
  filePath: string,
): boolean {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const raw = fs.readFileSync(filePath, 'utf-8');
  const thread = JSON.parse(raw) as Record<string, unknown>;
  if (!thread.id) return false;

  const msgs = (thread.messages ?? []) as Array<Record<string, unknown>>;
  runTransaction(db, () => {
    const threadArgs = [
      thread.id,
      thread.workspaceRoot ?? '',
      thread.createdAt ?? 0,
      thread.updatedAt ?? 0,
      thread.title ?? 'New Chat',
      thread.status ?? 'idle',
      thread.latestOrchestration ? JSON.stringify(thread.latestOrchestration) : null,
      thread.branchInfo ? JSON.stringify(thread.branchInfo) : null,
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (insertThread as any).run(...threadArgs);
    insertThreadMessages(insertMsg, thread.id, msgs);
  });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.renameSync(filePath, filePath + '.bak');
  return true;
}

function migrateThreadFiles(
  opts: {
    db: Database;
    insertThread: ReturnType<Database['prepare']>;
    insertMsg: ReturnType<Database['prepare']>;
    dir: string;
  },
  jsonFiles: string[],
): number {
  const { db, insertThread, insertMsg, dir } = opts;
  let migrated = 0;
  for (const file of jsonFiles) {
    try {
      if (migrateOneThreadFile(db, insertThread, insertMsg, path.join(dir, file))) migrated++;
    } catch (err) {
      log.warn(`Failed to migrate thread file ${file}:`, err);
    }
  }
  return migrated;
}

export function migrateThreadStore(threadsDir?: string): void {
  const dir = threadsDir ?? path.join(app.getPath('userData'), 'agent-chat', 'threads');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(dir)) return;

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const jsonFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (jsonFiles.length === 0) return;

  let db: Database | null = null;
  try {
    db = openDatabase(path.join(dir, 'threads.db'));
    ensureThreadSchema(db);
    const insertThread = db.prepare(
      `INSERT OR IGNORE INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status, latestOrchestration, branchInfo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertMsg = db.prepare(
      `INSERT OR IGNORE INTO messages (id, threadId, role, content, createdAt, statusKind, orchestration, contextSummary, verificationPreview, error, toolsSummary, costSummary, durationSummary, tokenUsage, blocks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const migrated = migrateThreadFiles({ db, insertThread, insertMsg, dir }, jsonFiles);
    if (migrated > 0) log.info(`Thread store: migrated ${migrated} threads`);
  } catch (err) {
    log.warn('Thread store migration failed:', err);
  } finally {
    closeDatabase(db);
  }
}

// ── Cost History migration ─────────────────────────────────────────────────

function ensureCostSchema(db: Database): void {
  if (getSchemaVersion(db) >= 1) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS cost_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL, session_id TEXT NOT NULL UNIQUE,
      task_label TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL NOT NULL DEFAULT 0, timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_entries(timestamp DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_session ON cost_entries(session_id);
  `);
  setSchemaVersion(db, 1);
}

function readCostEntries(jsonPath: string): Array<Record<string, unknown>> | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    return Array.isArray(data.entries) ? (data.entries as Array<Record<string, unknown>>) : null;
  } catch { return null; }
}

const COST_INSERT_SQL = `INSERT OR IGNORE INTO cost_entries
  (date, session_id, task_label, model, input_tokens, output_tokens,
   cache_read_tokens, cache_write_tokens, estimated_cost, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function insertCostEntries(db: Database, entries: Array<Record<string, unknown>>): void {
  const insert = db.prepare(COST_INSERT_SQL);
  runTransaction(db, () => {
    for (const e of entries) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (insert as any).run(e.date, e.sessionId, e.taskLabel, e.model,
        e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheWriteTokens,
        e.estimatedCost, e.timestamp);
    }
  });
}

export function migrateCostHistory(): void {
  const jsonPath = path.join(app.getPath('userData'), 'cost-history.json');
  const bakPath = jsonPath + '.bak';

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(jsonPath) || fs.existsSync(bakPath)) return;

  const entries = readCostEntries(jsonPath);
  if (!entries) return;

  let db: Database | null = null;
  try {
    db = openDatabase(path.join(app.getPath('userData'), 'cost-history.db'));
    ensureCostSchema(db);
    insertCostEntries(db, entries);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.renameSync(jsonPath, bakPath);
    log.info(`Cost history: migrated ${entries.length} entries`);
  } catch (err) {
    log.warn('Cost history migration failed:', err);
  } finally {
    closeDatabase(db);
  }
}

// ── Background Jobs table ──────────────────────────────────────────────────

/**
 * ensureBackgroundJobsTable — creates the background_jobs table in the
 * given database if it doesn't already exist.
 *
 * Called by jobStore.ts via its own ensureSchema(), but also exposed here
 * so the shared storage layer can guarantee the table exists before any
 * consumer opens the database.
 *
 * Non-destructive: guarded by IF NOT EXISTS; safe to call repeatedly.
 */
export function ensureBackgroundJobsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS background_jobs (
      id TEXT PRIMARY KEY,
      projectRoot TEXT NOT NULL,
      prompt TEXT NOT NULL,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      createdAt TEXT NOT NULL,
      startedAt TEXT,
      completedAt TEXT,
      exitCode INTEGER,
      sessionId TEXT,
      resultSummary TEXT,
      errorMessage TEXT,
      costUsd REAL
    );
    CREATE INDEX IF NOT EXISTS idx_bgjobs_status ON background_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_bgjobs_root ON background_jobs(projectRoot);
    CREATE INDEX IF NOT EXISTS idx_bgjobs_created ON background_jobs(createdAt DESC);
  `);
}

// ── Run all migrations ─────────────────────────────────────────────────────

export function runAllMigrations(projectRoot?: string): void {
  log.info('Running SQLite data migrations...');
  try {
    if (projectRoot) migrateGraphStore(projectRoot);
    migrateThreadStore();
    migrateCostHistory();
    log.info('All migrations complete');
  } catch (err) {
    log.warn('Migration runner encountered an error:', err);
  }
}
