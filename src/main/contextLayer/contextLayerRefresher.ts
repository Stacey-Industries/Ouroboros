/**
 * contextLayerRefresher.ts — Helpers for refreshing dirty modules and
 * updating the module cache from a fresh repo index snapshot.
 * Extracted from contextLayerController.ts to stay under the max-lines limit.
 */

import type {
  IndexedRepoFile,
  RepoIndexSnapshot,
  RootRepoIndexSnapshot,
} from '../orchestration/repoIndexer';
import type { RepoMapSummary } from '../orchestration/types';
import type { CachedModuleData, DetectedModule } from './contextLayerControllerHelpers';
import {
  applyGraphAnalysis,
  buildRepoMap,
  buildSingleModuleSummary,
  computeModuleHash,
} from './contextLayerControllerSupport';
import { buildResolvedImportGraph, computeModuleCohesion } from './importGraphAnalyzer';

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
  const graph = buildResolvedImportGraph(snapshot.roots);
  const cohesionMetrics = computeModuleCohesion(modules, graph);
  const cohesionById = new Map(cohesionMetrics.map((c) => [c.moduleId, c]));

  for (const mod of modules) {
    const hash = computeModuleHash(mod);
    const existing = state.cachedModules.get(mod.id);
    if (existing && existing.stateHash === hash) continue;

    const summary = buildSingleModuleSummary(mod, cohesionById.get(mod.id));
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
  const graph = buildResolvedImportGraph(snapshot.roots);
  const cohesionMetrics = computeModuleCohesion(modules, graph);
  const cohesionById = new Map(cohesionMetrics.map((c) => [c.moduleId, c]));

  for (const mod of modules) {
    if (!state.dirtyModuleIds.has(mod.id)) continue;
    const hash = computeModuleHash(mod);
    const existing = state.cachedModules.get(mod.id);
    if (existing && existing.stateHash === hash) continue;

    const summary = buildSingleModuleSummary(mod, cohesionById.get(mod.id));
    state.cachedModules.set(mod.id, { module: mod, summary, stateHash: hash, aiEnriched: false });
  }

  state.cachedRepoMap = buildRepoMap(snapshot.roots, modules);
  state.lastSnapshotCacheKey = snapshot.cache.key;
  state.dirtyModuleIds.clear();
}

export function maybeRunGraphAnalysis(
  modules: DetectedModule[],
  roots: RootRepoIndexSnapshot[],
  dirtyCount: number,
  allFiles: IndexedRepoFile[],
): void {
  const threshold = Math.max(5, Math.floor(modules.length * 0.1));
  if (dirtyCount >= threshold) {
    applyGraphAnalysis(modules, roots, allFiles);
  }
}

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

