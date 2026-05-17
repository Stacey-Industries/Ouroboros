/**
 * repoMapWorkerQueryClient.ts — Worker-local read-only graph query shim.
 *
 * Opened once at worker bootstrap from `workerData.dbPath` (passed by the
 * main thread — see Risk #4 in the architecture plan: `new GraphDatabase(dbPath,
 * { readonly: true })` never calls `getDbPath()` internally, so Electron's
 * `app.getPath` is NOT invoked in the worker thread).
 *
 * Exposes only the `queryGraph` surface consumed by the three graph-consumer
 * files (repoMapGeneratorGraph, repoMapGeneratorRanking, repoMapGeneratorDeps).
 */

import { CypherEngine } from '../codebaseGraph/cypherEngine';
import { GraphDatabase } from '../codebaseGraph/graphDatabase';
import log from '../logger';

// ── Module-scope singletons ────────────────────────────────────────────────────

let _db: GraphDatabase | null = null;
let _engine: CypherEngine | null = null;

// ── WorkerQueryClient shape ────────────────────────────────────────────────────

export interface WorkerQueryClient {
  queryGraph(cypher: string): Array<Record<string, unknown>>;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

/**
 * Opens a read-only SQLite connection and wires a CypherEngine over it.
 * Call once at worker bootstrap before posting the 'ready' message.
 *
 * The projectName used here is a sentinel — queryGraph is projectName-scoped
 * inside CypherEngine, but the three graph-consumer files pass project-agnostic
 * file_path filters in their Cypher (STARTS WITH) so any non-empty name works.
 * The actual project-specific data lives in the DB rows; the name is only used
 * as a WHERE predicate in PROJECT-level queries which these consumers never run.
 */
export function initWorkerQueryClient(dbPath: string): void {
  if (_db) {
    log.warn('[repoMapWorkerQueryClient] initWorkerQueryClient called more than once — ignoring');
    return;
  }
  try {
    _db = new GraphDatabase(dbPath, { readonly: true });
    _engine = new CypherEngine(_db, '__worker__');
    log.info(`[repoMapWorkerQueryClient] opened read-only DB at ${dbPath}`);
  } catch (err) {
    log.warn('[repoMapWorkerQueryClient] failed to open DB:', err);
    _db = null;
    _engine = null;
  }
}

/**
 * Returns the worker-local query client, or null if not yet initialized or
 * init failed. Callers should treat null the same as a missing graph controller
 * (soft-fallback to empty array / zero score).
 */
export function getWorkerQueryClient(): WorkerQueryClient | null {
  if (!_engine) return null;
  const engine = _engine;
  return {
    queryGraph(cypher: string): Array<Record<string, unknown>> {
      const result = engine.execute(cypher);
      return result.rows;
    },
  };
}

/**
 * Closes the DB connection and clears module-scope singletons.
 * Used by tests and worker shutdown.
 */
export function disposeWorkerQueryClient(): void {
  try {
    _db?.close();
  } catch {
    /* best-effort */
  }
  _db = null;
  _engine = null;
}
