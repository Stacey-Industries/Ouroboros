/**
 * repoMapGeneratorRanking.ts — Hotspot-derived module ranking (Wave 69 Phase B2).
 *
 * Replaces the file-count proxy in `enforceSizeCap` Step 3 with a graph-derived
 * importance score: for each module, sum the inbound CALLS edges into all
 * Function and Method nodes whose file_path starts with the module's rootPath.
 *
 * Per-module COUNT(*) instead of a single global aggregation because the
 * cypherEngine doesn't support GROUP BY in RETURN (Wave 68b deferred). One
 * query per module × 1 label-set filter ≈ N queries per generateRepoMap call.
 * Bounded; results cached in the score map for the duration of the call.
 */

import { getGraphController } from '../codebaseGraph/graphControllerSupport';
import log from '../logger';
import type { ModuleIdentity } from './contextLayerTypes';

interface HotspotEntry {
  id: string;
  fileCount: number;
}

/**
 * Computes a hotspot score for each module by counting inbound CALLS edges
 * to Function/Method nodes whose file_path starts with the module's rootPath.
 *
 * Returns a Map keyed by `ModuleIdentity.id`. Modules with no graph hits
 * (graph not ready, no functions, etc.) are absent from the map — callers
 * should treat absence as score 0 and fall back to file-count tiebreaker.
 */
export async function computeAllModuleHotspotScores(
  modules: ModuleIdentity[],
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  const ctrl = getGraphController();
  if (!ctrl) {
    // Graph not ready: empty map signals soft-fallback (Decision 7).
    return scores;
  }

  for (const mod of modules) {
    try {
      const score = await queryModuleHotspotScore(mod.rootPath);
      scores.set(mod.id, score);
    } catch (err) {
      log.warn('[context-layer] hotspot query failed for', mod.id, err);
    }
  }
  return scores;
}

async function queryModuleHotspotScore(modulePath: string): Promise<number> {
  const ctrl = getGraphController();
  if (!ctrl) return 0;
  const escapedPath = modulePath.replace(/'/g, "''");
  const cypher =
    `MATCH ()-[r:CALLS]->(callee) ` +
    `WHERE callee.file_path STARTS WITH '${escapedPath}' ` +
    `AND labels(callee) IN ['Function', 'Method'] ` +
    `RETURN COUNT(*)`;
  const rows = await ctrl.queryGraph(cypher);
  const row = rows?.[0];
  if (!row) return 0;
  // The cypherEngine returns COUNT(*) under the key 'count' (the parser
  // assigns the function name as the column when no AS alias is given).
  // eslint-disable-next-line security/detect-object-injection -- 'count' is a literal key
  const value = row['count'];
  return typeof value === 'number' ? value : 0;
}

/**
 * Compares two modules using hotspot score (descending) with file count as a
 * tiebreaker. Used as the comparator for `enforceSizeCap` Step 3 (Wave 69
 * Decision 3): hotspot beats file count, but file count breaks ties.
 */
export function compareByHotspotThenFileCount(
  scores: Map<string, number>,
  left: HotspotEntry,
  right: HotspotEntry,
): number {
  const leftScore = scores.get(left.id) ?? 0;
  const rightScore = scores.get(right.id) ?? 0;
  if (leftScore !== rightScore) return rightScore - leftScore;
  return right.fileCount - left.fileCount;
}
