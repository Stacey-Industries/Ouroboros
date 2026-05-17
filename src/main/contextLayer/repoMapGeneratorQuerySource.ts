/**
 * repoMapGeneratorQuerySource.ts — Unified query-source selector for the
 * repo-map graph-consumer phases.
 *
 * Returns the worker-local read-only query client when running inside a worker
 * thread (Phase 2+), or the main-thread graph controller otherwise.
 *
 * The returned interface exposes only `queryGraph`, which is the sole method
 * used by repoMapGeneratorGraph, repoMapGeneratorRanking, and
 * repoMapGeneratorDeps. This is intentional — it keeps the worker shim minimal
 * and avoids coupling to the full GraphControllerLike surface.
 */

import { isMainThread } from 'worker_threads';

import { getGraphController } from '../codebaseGraph/graphControllerSupport';
import { getWorkerQueryClient } from './repoMapWorkerQueryClient';

export interface QuerySource {
  queryGraph(cypher: string): Array<Record<string, unknown>>;
}

/**
 * Returns the active query source for the current thread context, or null if
 * neither is available. Callers must treat null as "graph not ready" and apply
 * their existing soft-fallback (return [] / return 0 / return empty map).
 */
export function getQuerySource(): QuerySource | null {
  if (!isMainThread) {
    return getWorkerQueryClient();
  }
  return getGraphController();
}
