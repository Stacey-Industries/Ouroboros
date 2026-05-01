/**
 * contextLayerRefresher.ts — Helpers for refreshing dirty modules and
 * updating the module cache from a fresh repo index snapshot.
 *
 * Wave 69 Phase D: removed buildResolvedImportGraph / computeModuleCohesion /
 * applyGraphAnalysis dependencies — the codebase-memory graph is the source
 * of truth now. cohesion / graph-analysis seams are gone; the file-walk
 * caching logic remains and is still used for hash-based dirty tracking.
 */

import type { RepoIndexSnapshot } from '../orchestration/repoIndexer';
import type { RepoMapSummary } from '../orchestration/types';
import type { CachedModuleData, DetectedModule } from './contextLayerControllerHelpers';
import {
  buildRepoMap,
  buildSingleModuleSummary,
  computeModuleHash,
} from './contextLayerControllerSupport';

export interface ModuleCacheState {
  cachedModules: Map<string, CachedModuleData>;
  cachedRepoMap: RepoMapSummary | null;
  lastSnapshotCacheKey: string | null;
  dirtyModuleIds: Set<string>;
}

export function updateModuleCache(
  state: ModuleCacheState,
  modules: DetectedModule[],
  snapshot: RepoIndexSnapshot,
): void {
  for (const mod of modules) {
    const hash = computeModuleHash(mod);
    const existing = state.cachedModules.get(mod.id);
    if (existing && existing.stateHash === hash) continue;

    const summary = buildSingleModuleSummary(mod);
    state.cachedModules.set(mod.id, { module: mod, summary, stateHash: hash, aiEnriched: false });
  }

  const currentIds = new Set(modules.map((m) => m.id));
  for (const cachedId of state.cachedModules.keys()) {
    if (!currentIds.has(cachedId)) state.cachedModules.delete(cachedId);
  }

  state.cachedRepoMap = buildRepoMap(snapshot.roots, modules);
  state.lastSnapshotCacheKey = snapshot.cache.key;
  state.dirtyModuleIds.clear();
}

export function refreshDirtyModuleCache(
  state: ModuleCacheState,
  modules: DetectedModule[],
  snapshot: RepoIndexSnapshot,
): void {
  for (const mod of modules) {
    if (!state.dirtyModuleIds.has(mod.id)) continue;
    const hash = computeModuleHash(mod);
    const existing = state.cachedModules.get(mod.id);
    if (existing && existing.stateHash === hash) continue;

    const summary = buildSingleModuleSummary(mod);
    state.cachedModules.set(mod.id, { module: mod, summary, stateHash: hash, aiEnriched: false });
  }

  state.cachedRepoMap = buildRepoMap(snapshot.roots, modules);
  state.lastSnapshotCacheKey = snapshot.cache.key;
  state.dirtyModuleIds.clear();
}

// maybeRunGraphAnalysis removed in Wave 69 Phase D — graph analysis lives in
// the codebase-memory graph indexer now.

export function countRefreshedModules(
  modules: DetectedModule[],
  cachedModules: Map<string, CachedModuleData>,
): number {
  let count = 0;
  for (const mod of modules) {
    const cached = cachedModules.get(mod.id);
    if (cached && !cached.aiEnriched) count++;
  }
  return count;
}
