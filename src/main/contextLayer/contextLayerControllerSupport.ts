/**
 * contextLayerControllerSupport.ts — Module detection, import analysis,
 * graph analysis, repo map building, and module summary helpers.
 */

import path from 'path';

import type { IndexedRepoFile, RootRepoIndexSnapshot } from '../orchestration/repoIndexer';
import type { RepoMapSummary } from '../orchestration/types';
import {
  buildDirTree,
  buildExportsFromFiles,
  collectAllFiles,
  type DetectedModule,
  isCodeFile,
  makeModule,
  type ModuleBoundarySignals,
} from './contextLayerControllerHelpers';
import {
  buildResolvedImportGraph,
  computeModuleCohesion,
  refineModuleAssignments,
} from './importGraphAnalyzer';

// Re-export types needed by the controller
export type { CachedModuleData, DetectedModule } from './contextLayerControllerHelpers';
export {
  computeModuleHash,
  normalizePath,
  selectRepresentativeFiles,
} from './contextLayerControllerHelpers';
export {
  buildSingleModuleSummary,
  selectModuleSummariesForGoal,
} from './contextLayerModuleSummary';

export const DEFAULT_MODULE_DEPTH_LIMIT = 6;

// ---------------------------------------------------------------------------
// Adaptive module detection
// ---------------------------------------------------------------------------

interface CollectModulesOpts {
  node: import('./contextLayerControllerHelpers').DirNode;
  changedFiles: Set<string>;
  result: DetectedModule[];
  depth: number;
  maxDepth: number;
}

export function collectModulesFromTree(opts: CollectModulesOpts): void {
  const { node, changedFiles, result, depth, maxDepth } = opts;

  if (depth >= maxDepth) {
    const allFiles = collectAllFiles(node);
    if (allFiles.some((f) => isCodeFile(f.extension))) {
      result.push(makeModule(node, allFiles, changedFiles));
    }
    return;
  }

  if (node.children.size === 0) {
    if (node.directFiles.some((f) => isCodeFile(f.extension))) {
      result.push(makeModule(node, node.directFiles, changedFiles));
    }
    return;
  }

  for (const child of node.children.values()) {
    collectModulesFromTree({ node: child, changedFiles, result, depth: depth + 1, maxDepth });
  }

  if (node.directFiles.some((f) => isCodeFile(f.extension))) {
    result.push(makeModule(node, node.directFiles, changedFiles));
  }
}

export function detectModules(
  roots: RootRepoIndexSnapshot[],
  changedFiles: Set<string>,
  depthLimit: number = DEFAULT_MODULE_DEPTH_LIMIT,
): DetectedModule[] {
  const modules: DetectedModule[] = [];
  for (const root of roots) {
    const tree = buildDirTree(root.files, root.rootPath);
    for (const child of tree.children.values()) {
      collectModulesFromTree({
        node: child,
        changedFiles,
        result: modules,
        depth: 1,
        maxDepth: depthLimit,
      });
    }
    if (tree.directFiles.some((f) => isCodeFile(f.extension))) {
      modules.push(makeModule(tree, tree.directFiles, changedFiles));
    }
  }
  return modules;
}

// ---------------------------------------------------------------------------
// Import analysis
// ---------------------------------------------------------------------------

interface ModuleImportCounts {
  barrelImportCount: number;
  directImportCount: number;
}

function resolveRelativeImport(fileRelPath: string, importSpec: string): string {
  const dirParts = fileRelPath.split('/').slice(0, -1);
  const importParts = importSpec.split('/');
  const resolved: string[] = [...dirParts];
  for (const part of importParts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join('/');
}

function classifyImport(
  resolved: string,
  sourceModuleId: string | undefined,
  sortedModuleIds: string[],
  counts: Map<string, ModuleImportCounts>,
): void {
  for (const moduleId of sortedModuleIds) {
    if (moduleId === sourceModuleId) continue;
    if (resolved === moduleId) {
      const entry = counts.get(moduleId);
      if (entry) entry.barrelImportCount++;
      break;
    }
    if (resolved.startsWith(moduleId + '/')) {
      const entry = counts.get(moduleId);
      if (entry) entry.directImportCount++;
      break;
    }
  }
}

function analyzeModuleImportPatterns(
  modules: DetectedModule[],
  roots: RootRepoIndexSnapshot[],
): Map<string, ModuleImportCounts> {
  const counts = new Map<string, ModuleImportCounts>();
  for (const mod of modules) {
    counts.set(mod.id, { barrelImportCount: 0, directImportCount: 0 });
  }

  const sortedModuleIds = modules.map((m) => m.id).sort((a, b) => b.length - a.length);
  const fileToModuleId = new Map<string, string>();
  for (const mod of modules) {
    for (const f of mod.files) fileToModuleId.set(f.relativePath, mod.id);
  }

  for (const root of roots) {
    for (const file of root.files) {
      if (!isCodeFile(file.extension)) continue;
      const srcMod = fileToModuleId.get(file.relativePath);
      classifyFileImports(file, srcMod, sortedModuleIds, counts);
    }
  }
  return counts;
}

function classifyFileImports(
  file: { relativePath: string; extension: string; imports: string[] },
  srcMod: string | undefined,
  sortedModuleIds: string[],
  counts: Map<string, ModuleImportCounts>,
): void {
  for (const imp of file.imports) {
    if (!imp.startsWith('.')) continue;
    classifyImport(resolveRelativeImport(file.relativePath, imp), srcMod, sortedModuleIds, counts);
  }
}

function computeBoundaryStrength(signals: ModuleBoundarySignals): 'strong' | 'moderate' | 'weak' {
  const total = signals.barrelImportCount + signals.directImportCount;
  const ratio = total > 0 ? signals.barrelImportCount / total : 0;
  if (signals.hasBarrel && (ratio >= 0.5 || total === 0)) return 'strong';
  if (signals.hasBarrel || total >= 3) return 'moderate';
  return 'weak';
}

export function applyImportAnalysis(
  modules: DetectedModule[],
  roots: RootRepoIndexSnapshot[],
): void {
  const counts = analyzeModuleImportPatterns(modules, roots);
  for (const mod of modules) {
    const entry = counts.get(mod.id);
    if (entry) {
      mod.boundarySignals.barrelImportCount = entry.barrelImportCount;
      mod.boundarySignals.directImportCount = entry.directImportCount;
    }
    mod.boundarySignals.boundaryStrength = computeBoundaryStrength(mod.boundarySignals);
  }
}

// ---------------------------------------------------------------------------
// Graph analysis application
// ---------------------------------------------------------------------------

function applyFileMovements(
  movements: Array<{ filePath: string; fromModuleId: string; toModuleId: string }>,
  modules: DetectedModule[],
  allFiles: IndexedRepoFile[],
): void {
  const fileByPath = new Map(allFiles.map((f) => [f.relativePath, f]));
  const moduleById = new Map(modules.map((m) => [m.id, m]));

  for (const move of movements) {
    const src = moduleById.get(move.fromModuleId);
    const tgt = moduleById.get(move.toModuleId);
    const fileObj = fileByPath.get(move.filePath);
    if (!src || !tgt || !fileObj) continue;
    src.files = src.files.filter((f) => f.relativePath !== move.filePath);
    tgt.files.push(fileObj);
  }

  const affected = new Set(movements.flatMap((m) => [m.fromModuleId, m.toModuleId]));
  for (const id of affected) {
    const mod = moduleById.get(id);
    if (mod) mod.exports = buildExportsFromFiles(mod.files);
  }
}

export function applyGraphAnalysis(
  modules: DetectedModule[],
  roots: RootRepoIndexSnapshot[],
  allFiles: IndexedRepoFile[],
): { movements: number } {
  const graph = buildResolvedImportGraph(roots);
  const cohesionMetrics = computeModuleCohesion(modules, graph);
  const cohesionById = new Map(cohesionMetrics.map((c) => [c.moduleId, c]));

  for (const mod of modules) {
    const metrics = cohesionById.get(mod.id);
    if (metrics) mod.cohesion = metrics.internalCohesion;
  }

  const refinement = refineModuleAssignments(modules, graph);
  if (refinement.movements.length > 0) {
    applyFileMovements(refinement.movements, modules, allFiles);
  }

  logGraphResults(graph, refinement.movements, refinement.iterations);
  return { movements: refinement.movements.length };
}

function logGraphResults(
  graph: { edges: { length: number }; unresolvedCount: number; totalRelativeImports: number },
  movements: Array<{
    filePath: string;
    fromModuleId: string;
    toModuleId: string;
    affinityScore: number;
  }>,
  iterations: number,
): void {
  console.log(
    `[context-layer] Import graph: ${graph.edges.length} edges resolved, ` +
      `${graph.unresolvedCount} unresolved of ${graph.totalRelativeImports} relative imports`,
  );
  if (movements.length === 0) return;
  console.log(
    `[context-layer] Refinement: ${movements.length} file(s) moved in ${iterations} iteration(s)`,
  );
  for (const move of movements) {
    console.log(
      `[context-layer]   ${path.basename(move.filePath)}: ${move.fromModuleId} → ${move.toModuleId} (affinity ${(move.affinityScore * 100).toFixed(0)}%)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Repo map builder
// ---------------------------------------------------------------------------

const FRAMEWORK_MAP: Record<string, string> = {
  'next.config.js': 'next.js',
  'next.config.mjs': 'next.js',
  'next.config.ts': 'next.js',
  'vite.config.ts': 'vite',
  'vite.config.js': 'vite',
  'electron-builder.yml': 'electron',
  'electron-builder.json5': 'electron',
  'tailwind.config.js': 'tailwind',
  'tailwind.config.ts': 'tailwind',
  'tsconfig.json': 'typescript',
};

function detectFrameworks(files: IndexedRepoFile[], frameworks: Set<string>): void {
  for (const file of files) {
    const name = path.basename(file.path);
    const fw = FRAMEWORK_MAP[name]; // eslint-disable-line security/detect-object-injection -- key is from path.basename, not user input
    if (fw) frameworks.add(fw);
    if (file.imports.some((i) => i.includes('react'))) frameworks.add('react');
    if (file.imports.some((i) => i.includes('express'))) frameworks.add('express');
  }
}

export function buildRepoMap(
  roots: RootRepoIndexSnapshot[],
  modules: DetectedModule[],
): RepoMapSummary {
  const allLanguages = new Set<string>();
  const frameworks = new Set<string>();

  for (const root of roots) {
    for (const lang of root.workspaceFact.languages) allLanguages.add(lang);
    detectFrameworks(root.files, frameworks);
  }

  return {
    projectName: roots.length > 0 ? path.basename(roots[0].rootPath) : 'unknown',
    languages: Array.from(allLanguages),
    frameworks: Array.from(frameworks),
    moduleCount: modules.length,
    modules: modules
      .sort((a, b) => b.files.length - a.files.length)
      .slice(0, 30)
      .map((mod) => ({
        id: mod.id,
        label: mod.label,
        rootPath: mod.rootPath,
        fileCount: mod.files.length,
        exports: mod.exports.slice(0, 10),
        recentlyChanged: mod.recentlyChanged,
      })),
  };
}
