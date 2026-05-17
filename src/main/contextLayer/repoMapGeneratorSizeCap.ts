/**
 * repoMapGeneratorSizeCap.ts — model-aware byte-cap enforcement extracted
 * from repoMapGenerator.ts (Lane B fix wave 2026-05-16, bug
 * `roadmap/bugs/2026-05-16-main-thread-hang-on-context-rebuild.md`).
 *
 * Extraction reason: the parent file was at the 300-line ESLint cap, which
 * blocked the diagnostician from re-adding per-phase trace logging in
 * `generateRepoMap`. Pulling the size-cap logic — a self-contained unit
 * (constants + two pure functions) — out makes room without touching the
 * graph-fan-out hot path itself.
 */

import type { ModuleContextEntry, RepoMap } from './contextLayerTypes';
import { getRepoMapBudget } from './repoMapBudgets';
import { compareByHotspotThenFileCount } from './repoMapGeneratorRanking';

const TRUNCATED_EXPORTS_LIMIT = 5;
const MAX_MODULES_AFTER_TRUNCATION = 30;
const MIN_DEPENDENCY_WEIGHT_AFTER_TRUNCATION = 2;

export function enforceSizeCap(
  repoMap: RepoMap,
  hotspotScores: Map<string, number>,
  model?: string,
): RepoMap {
  const { rawCapBytes } = getRepoMapBudget(model);
  let serialized = JSON.stringify(repoMap);
  if (serialized.length <= rawCapBytes) return repoMap;

  // Step 1: truncate exports per module + drop imports.
  const trimmedModules = repoMap.modules.map((entry) => ({
    structural: {
      ...entry.structural,
      exports: entry.structural.exports.slice(0, TRUNCATED_EXPORTS_LIMIT),
      imports: [],
    },
    ai: entry.ai,
  }));
  // Step 2: drop low-weight cross-module dependencies.
  const trimmedDeps = repoMap.crossModuleDependencies.filter(
    (dep) => dep.weight >= MIN_DEPENDENCY_WEIGHT_AFTER_TRUNCATION,
  );

  const trimmed: RepoMap = {
    ...repoMap,
    modules: trimmedModules,
    crossModuleDependencies: trimmedDeps,
  };
  serialized = JSON.stringify(trimmed);
  if (serialized.length <= rawCapBytes) return trimmed;

  // Step 3: hotspot-ranked top-N truncation (Wave 69 Decision 3).
  return applyHotspotRankedTruncation(trimmed, trimmedModules, trimmedDeps, hotspotScores);
}

function applyHotspotRankedTruncation(
  trimmed: RepoMap,
  trimmedModules: ModuleContextEntry[],
  trimmedDeps: Array<{ from: string; to: string; weight: number }>,
  hotspotScores: Map<string, number>,
): RepoMap {
  const sortedModules = [...trimmedModules]
    .sort((left, right) =>
      compareByHotspotThenFileCount(
        hotspotScores,
        { id: left.structural.module.id, fileCount: left.structural.fileCount },
        { id: right.structural.module.id, fileCount: right.structural.fileCount },
      ),
    )
    .slice(0, MAX_MODULES_AFTER_TRUNCATION);

  const remainingModuleIds = new Set(sortedModules.map((entry) => entry.structural.module.id));
  const filteredDeps = trimmedDeps.filter(
    (dep) => remainingModuleIds.has(dep.from) && remainingModuleIds.has(dep.to),
  );
  return {
    ...trimmed,
    modules: sortedModules,
    moduleCount: sortedModules.length,
    crossModuleDependencies: filteredDeps,
  };
}
