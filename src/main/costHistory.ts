/**
 * costHistory.ts — SQLite-backed persistent cost history storage.
 *
 * Stores cost entries in a SQLite database in the user data directory.
 * Provides load/save/clear operations with a 10,000 entry cap and
 * upsert by session_id (ON CONFLICT DO UPDATE).
 */

import { app } from 'electron';
import path from 'path';

import type { Database } from './storage/database';
import {
  closeDatabase,
  getSchemaVersion,
  openDatabase,
  runTransaction,
  setSchemaVersion,
} from './storage/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CostEntry {
  date: string; // ISO date string (YYYY-MM-DD)
  sessionId: string;
  taskLabel: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number; // pre-computed USD amount
  timestamp: number; // ms timestamp for sorting
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_ENTRIES = 10_000;
const DB_NAME = 'cost-history.db';
const SCHEMA_VERSION = 1;

// ─── Singleton DB ───────────────────────────────────────────────────────────

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), DB_NAME);
    db = openDatabase(dbPath);
    ensureSchema(db);
  }
  return db;
}

function ensureSchema(database: Database): void {
  const version = getSchemaVersion(database);
  if (version >= SCHEMA_VERSION) return;

  runTransaction(database, () => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS cost_entries (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        date            TEXT NOT NULL,
        session_id      TEXT NOT NULL UNIQUE,
        task_label      TEXT NOT NULL DEFAULT '',
        model           TEXT NOT NULL DEFAULT '',
        input_tokens    INTEGER NOT NULL DEFAULT 0,
        output_tokens   INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost  REAL NOT NULL DEFAULT 0,
        timestamp       INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_entries(timestamp DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_session ON cost_entries(session_id);
    `);
    setSchemaVersion(database, SCHEMA_VERSION);
  });
}

// ─── Auto-prune ─────────────────────────────────────────────────────────────

function pruneIfNeeded(database: Database): void {
  const row = database.prepare('SELECT COUNT(*) as cnt FROM cost_entries').get() as { cnt: number };
  if (row.cnt <= MAX_ENTRIES) return;

  // Keep the newest MAX_ENTRIES rows
  database
    .prepare(
      `DELETE FROM cost_entries WHERE id NOT IN (
      SELECT id FROM cost_entries ORDER BY timestamp DESC LIMIT ?
    )`,
    )
    .run(MAX_ENTRIES);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function saveCostEntry(entry: CostEntry): Promise<void> {
  const database = getDb();
  // Upsert by session_id: insert new entries or update token counts for ongoing sessions
  database
    .prepare(
      `INSERT INTO cost_entries
     (date, session_id, task_label, model, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, estimated_cost, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       input_tokens = excluded.input_tokens,
       output_tokens = excluded.output_tokens,
       cache_read_tokens = excluded.cache_read_tokens,
       cache_write_tokens = excluded.cache_write_tokens,
       estimated_cost = excluded.estimated_cost,
       timestamp = excluded.timestamp`,
    )
    .run(
      entry.date,
      entry.sessionId,
      entry.taskLabel,
      entry.model,
      entry.inputTokens,
      entry.outputTokens,
      entry.cacheReadTokens,
      entry.cacheWriteTokens,
      entry.estimatedCost,
      entry.timestamp,
    );
  pruneIfNeeded(database);
}

export async function getCostHistory(): Promise<CostEntry[]> {
  const database = getDb();
  const rows = database
    .prepare('SELECT * FROM cost_entries ORDER BY timestamp DESC')
    .all() as RawCostRow[];
  return rows.map(rowToEntry);
}

export async function loadCostHistory(): Promise<{ entries: CostEntry[] }> {
  const entries = await getCostHistory();
  return { entries };
}

export async function clearCostHistory(): Promise<void> {
  const database = getDb();
  database.prepare('DELETE FROM cost_entries').run();
}

/**
 * Closes the cost history database. Call during app shutdown.
 */
export function closeCostHistoryDb(): void {
  closeDatabase(db);
  db = null;
}

// ─── Internal ───────────────────────────────────────────────────────────────

interface RawCostRow {
  id: number;
  date: string;
  session_id: string;
  task_label: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  estimated_cost: number;
  timestamp: number;
}

function rowToEntry(row: RawCostRow): CostEntry {
  return {
    date: row.date,
    sessionId: row.session_id,
    taskLabel: row.task_label,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    estimatedCost: row.estimated_cost,
    timestamp: row.timestamp,
  };
}
