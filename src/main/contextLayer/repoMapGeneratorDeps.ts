/**
 * repoMapGeneratorDeps.ts — Graph-derived cross-module dependencies (Wave 69 Phase B3).
 *
 * Replaces the file-walk import-resolution pipeline with the codebase-memory
 * graph as the source of truth. Aggregates IMPORTS + CALLS edges between
 * modules.
 *
 * Per-source-module batched queries (not single-query) because the
 * cypherEngine caps RETURN at 200 rows AND lacks GROUP BY in RETURN
 * (Wave 68b deferred). For each module we run two queries (one IMPORTS,
 * one CALLS) returning <=200 raw edge rows each, and aggregate target
 * file_paths to module ids in JS.
 *
 * Signature matches the file-walk path so generateRepoMap can soft-fall-back
 * to the file-walk function when the graph is not ready (Decision 7).
 */

import log from '../logger';
import type { ModuleIdentity } from './contextLayerTypes';
import { getQuerySource } from './repoMapGeneratorQuerySource';

const PER_QUERY_LIMIT = 200;

interface EdgeRow {
  caller: string | null;
  callee: string | null;
}

/**
 * Returns cross-module dependency tuples derived from the graph's CALLS and
 * IMPORTS edges. Returns empty array when the graph is not ready — caller
 * (`generateRepoMap`) falls back to the file-walk path.
 */
export async function buildCrossModuleDependenciesFromGraph(
  modules: ModuleIdentity[],
): Promise<Array<{ from: string; to: string; weight: number }>> {
  const ctrl = getQuerySource();
  if (!ctrl) return [];

  const sortedByPathDescending = sortByPathLengthDescending(modules);
  const counts = new Map<string, number>(); // key: `${from}>${to}` → weight

  for (const sourceMod of modules) {
    await accumulateForSource(sourceMod, sortedByPathDescending, counts);
  }

  return Array.from(counts.entries()).map(([key, weight]) => {
    const [from, to] = key.split('>');
    return { from, to, weight };
  });
}

async function accumulateForSource(
  sourceMod: ModuleIdentity,
  sortedModules: ModuleIdentity[],
  counts: Map<string, number>,
): Promise<void> {
  const callRows = await fetchEdgeRows('CALLS', sourceMod.rootPath);
  const importRows = await fetchEdgeRows('IMPORTS', sourceMod.rootPath);
  for (const row of [...callRows, ...importRows]) {
    if (!row.callee) continue;
    const targetModuleId = matchModuleByPath(row.callee, sortedModules);
    if (!targetModuleId || targetModuleId === sourceMod.id) continue;
    const key = `${sourceMod.id}>${targetModuleId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
}

async function fetchEdgeRows(
  edgeType: 'CALLS' | 'IMPORTS',
  sourcePath: string,
): Promise<EdgeRow[]> {
  const ctrl = getQuerySource();
  if (!ctrl) return [];
  const escapedPath = sourcePath.replace(/'/g, "''");
  const cypher =
    `MATCH (caller)-[r:${edgeType}]->(callee) ` +
    `WHERE caller.file_path STARTS WITH '${escapedPath}' ` +
    `RETURN caller.file_path, callee.file_path ` +
    `LIMIT ${PER_QUERY_LIMIT}`;
  try {
    const rows = await ctrl.queryGraph(cypher);
    return rows.map((row) => ({
      caller:
        typeof row['caller_file_path'] === 'string' ? (row['caller_file_path'] as string) : null,

      callee:
        typeof row['callee_file_path'] === 'string' ? (row['callee_file_path'] as string) : null,
    }));
  } catch (err) {
    log.warn('[context-layer] cross-module deps query failed for', sourcePath, edgeType, err);
    return [];
  }
}

/**
 * Sorts modules by rootPath length descending so prefix matching picks the
 * most-specific module (e.g., `src/main/codebaseGraph` wins over `src/main`).
 */
function sortByPathLengthDescending(modules: ModuleIdentity[]): ModuleIdentity[] {
  return [...modules].sort((a, b) => b.rootPath.length - a.rootPath.length);
}

function matchModuleByPath(filePath: string, sortedModules: ModuleIdentity[]): string | null {
  for (const mod of sortedModules) {
    if (filePath === mod.rootPath || filePath.startsWith(mod.rootPath + '/')) {
      return mod.id;
    }
  }
  return null;
}
