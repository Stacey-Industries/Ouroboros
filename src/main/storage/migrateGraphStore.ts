/**
 * migrateGraphStore.ts — One-time JSON→SQLite migration for the graph store.
 *
 * Extracted from migrate.ts to keep that file under the ESLint max-lines limit.
 * Re-exported from migrate.ts so all consumer import paths remain unchanged.
 */

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
