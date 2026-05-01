import { readFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import type { IndexedRepoFile, RepoIndexSnapshot } from '../orchestration/repoIndexer';
import type { RepoFacts } from '../orchestration/types';
import type {
  ModuleContextEntry,
  ModuleExport,
  ModuleIdentity,
  ModuleStructuralSummary,
  RepoMap,
  RepoMapSummary,
} from './contextLayerTypes';
import {
  buildCrossModuleDependencies,
  buildModuleStructuralSummaries,
  detectModules,
} from './moduleDetector';
import { buildCrossModuleDependenciesFromGraph } from './repoMapGeneratorDeps';
import { detectFrameworks } from './repoMapGeneratorFrameworks';
import { queryModuleExports } from './repoMapGeneratorGraph';
import {
  compareByHotspotThenFileCount,
  computeAllModuleHotspotScores,
} from './repoMapGeneratorRanking';

const REPO_MAP_SIZE_CAP_BYTES = 8192;
const TRUNCATED_EXPORTS_LIMIT = 5;
const MAX_MODULES_AFTER_TRUNCATION = 30;
const MIN_DEPENDENCY_WEIGHT_AFTER_TRUNCATION = 2;
const COMPRESSED_EXPORTS_LIMIT = 5;

export interface GenerateRepoMapOptions {
  repoFacts: RepoFacts;
  repoIndex: RepoIndexSnapshot;
  workspaceRoot: string;
}

function buildRepoMapFromSummaries(options: {
  workspaceRoot: string;
  repoIndex: RepoIndexSnapshot;
  allFiles: IndexedRepoFile[];
  moduleEntries: ModuleContextEntry[];
  crossModuleDeps: Array<{ from: string; to: string; weight: number }>;
}): RepoMap {
  const { workspaceRoot, repoIndex, allFiles, moduleEntries, crossModuleDeps } = options;
  return {
    version: 1,
    generatedAt: Date.now(),
    workspaceRoot,
    projectName: detectProjectName(workspaceRoot, repoIndex),
    languages: aggregateLanguages(repoIndex),
    frameworks: detectFrameworks(repoIndex),
    moduleCount: moduleEntries.length,
    totalFileCount: allFiles.length,
    modules: moduleEntries,
    crossModuleDependencies: crossModuleDeps,
  };
}

/**
 * Enriches a structural summary's exports with graph-backed signatures.
 * If the graph returns results, they replace the file-walk fallback exports.
 * If the graph is unavailable or returns nothing, the file-walk exports (with
 * signature: null) are kept as-is — soft-fallback per Decision 7.
 */
async function enrichExportsFromGraph(summary: ModuleStructuralSummary): Promise<ModuleExport[]> {
  const graphExports = await queryModuleExports(summary.module.rootPath);
  return graphExports.length > 0 ? graphExports : summary.exports;
}

/**
 * Phase B3: prefer graph-derived deps; soft-fallback to file-walk path
 * when the graph is unavailable or returns no edges (Decision 7).
 */
async function resolveCrossModuleDeps(options: {
  modules: ModuleIdentity[];
  structuralSummaries: ModuleStructuralSummary[];
  allFiles: IndexedRepoFile[];
  workspaceRoot: string;
}): Promise<Array<{ from: string; to: string; weight: number }>> {
  const { modules, structuralSummaries, allFiles, workspaceRoot } = options;
  const graphDeps = await buildCrossModuleDependenciesFromGraph(modules);
  if (graphDeps.length > 0) return graphDeps;
  return buildCrossModuleDependencies({
    modules,
    summaries: structuralSummaries,
    files: allFiles,
    workspaceRoot,
  });
}

export async function generateRepoMap(options: GenerateRepoMapOptions): Promise<RepoMap> {
  const { repoFacts, repoIndex, workspaceRoot } = options;

  const allFiles = collectAllFiles(repoIndex);
  if (allFiles.length === 0) return buildEmptyRepoMap(workspaceRoot);

  const isMultiRoot = repoIndex.roots.length > 1;
  const modules = detectModulesFromRoots(repoIndex, isMultiRoot);
  const gitDiffFiles = new Set(repoFacts.gitDiff.changedFiles.map((entry) => entry.filePath));
  const structuralSummaries = buildModuleStructuralSummaries({
    modules,
    files: allFiles,
    workspaceRoot,
    gitDiffFiles,
  });
  const crossModuleDeps = await resolveCrossModuleDeps({
    modules,
    structuralSummaries,
    allFiles,
    workspaceRoot,
  });
  const enrichedSummaries = await Promise.all(
    structuralSummaries.map(async (s) => ({ ...s, exports: await enrichExportsFromGraph(s) })),
  );
  const moduleEntries: ModuleContextEntry[] = enrichedSummaries.map((summary) => ({
    structural: summary,
  }));
  // Phase B2: hotspot scores feed enforceSizeCap Step 3.
  const hotspotScores = await computeAllModuleHotspotScores(modules);

  return enforceSizeCap(
    buildRepoMapFromSummaries({
      workspaceRoot,
      repoIndex,
      allFiles,
      moduleEntries,
      crossModuleDeps,
    }),
    hotspotScores,
  );
}

export function compressRepoMap(repoMap: RepoMap): RepoMapSummary {
  return {
    projectName: repoMap.projectName,
    languages: repoMap.languages,
    frameworks: repoMap.frameworks,
    moduleCount: repoMap.moduleCount,
    modules: repoMap.modules.map((entry) => ({
      id: entry.structural.module.id,
      label: entry.structural.module.label,
      rootPath: entry.structural.module.rootPath,
      fileCount: entry.structural.fileCount,
      exports: entry.structural.exports.slice(0, COMPRESSED_EXPORTS_LIMIT),
      recentlyChanged: entry.structural.recentlyChanged,
    })),
  };
}

// Framework detection moved to repoMapGeneratorFrameworks.ts in Wave 69 B1.
export { detectFrameworks } from './repoMapGeneratorFrameworks';

export function detectProjectName(workspaceRoot: string, repoIndex: RepoIndexSnapshot): string {
  for (const root of repoIndex.roots) {
    const pj = root.files.find((f) => f.relativePath === 'package.json');
    const name = pj ? readPackageJsonNameSync(pj.path) : null;
    if (name) return name;
  }
  return path.basename(workspaceRoot);
}

async function readPackageJsonNameAsync(filePath: string): Promise<string | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from repoIndexer's trusted file listing
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Record<string, unknown>;
    if (typeof parsed.name === 'string' && parsed.name.trim() !== '') return parsed.name.trim();
  } catch {
    /* ignore */
  }
  return null;
}

export async function detectProjectNameAsync(
  workspaceRoot: string,
  repoIndex: RepoIndexSnapshot,
): Promise<string> {
  for (const root of repoIndex.roots) {
    const pj = root.files.find((f) => f.relativePath === 'package.json');
    const name = pj ? await readPackageJsonNameAsync(pj.path) : null;
    if (name) return name;
  }
  return path.basename(workspaceRoot);
}

function readPackageJsonNameSync(filePath: string): string | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from repoIndexer's trusted file listing
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (typeof parsed.name === 'string' && parsed.name.trim() !== '') {
      return parsed.name.trim();
    }
  } catch {
    // Ignore read/parse errors
  }
  return null;
}

function collectAllFiles(repoIndex: RepoIndexSnapshot): IndexedRepoFile[] {
  return repoIndex.roots.flatMap((root) => root.files);
}

function detectModulesFromRoots(
  repoIndex: RepoIndexSnapshot,
  isMultiRoot: boolean,
): ModuleIdentity[] {
  if (!isMultiRoot) {
    const root = repoIndex.roots[0];
    return root ? detectModules(root.files, root.rootPath) : [];
  }

  const allModules: ModuleIdentity[] = [];
  for (const root of repoIndex.roots) {
    const rootBasename = path.basename(root.rootPath);
    const rootModules = detectModules(root.files, root.rootPath);
    for (const mod of rootModules) {
      allModules.push({
        ...mod,
        id: `${rootBasename}/${mod.id}`,
        label: `${rootBasename}: ${mod.label}`,
      });
    }
  }

  return allModules.sort((left, right) => left.id.localeCompare(right.id));
}

function aggregateLanguages(repoIndex: RepoIndexSnapshot): string[] {
  const counts = new Map<string, number>();
  for (const root of repoIndex.roots) {
    for (const language of root.workspaceFact.languages) {
      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([language]) => language);
}

function buildEmptyRepoMap(workspaceRoot: string): RepoMap {
  return {
    version: 1,
    generatedAt: Date.now(),
    workspaceRoot,
    projectName: path.basename(workspaceRoot),
    languages: [],
    frameworks: [],
    moduleCount: 0,
    totalFileCount: 0,
    modules: [],
    crossModuleDependencies: [],
  };
}

function enforceSizeCap(repoMap: RepoMap, hotspotScores: Map<string, number>): RepoMap {
  let serialized = JSON.stringify(repoMap);
  if (serialized.length <= REPO_MAP_SIZE_CAP_BYTES) return repoMap;

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
  if (serialized.length <= REPO_MAP_SIZE_CAP_BYTES) return trimmed;

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

// matchesAnyPattern / matchesAnyGlob moved to repoMapGeneratorFrameworks.ts.
