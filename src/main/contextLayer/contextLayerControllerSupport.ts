/**
 * contextLayerControllerSupport.ts — Module detection, import analysis,
 * graph analysis, repo map building, and module summary helpers.
 */

import path from 'path';

import type { IndexedRepoFile, RootRepoIndexSnapshot } from '../orchestration/repoIndexer';
import type { RepoMapSummary } from '../orchestration/types';
import {
  buildDirTree,
  collectAllFiles,
  type DetectedModule,
  isCodeFile,
  makeModule,
} from './contextLayerControllerHelpers';
// Wave 69 Phase D: import-graph analysis is no longer needed; the contextLayer
// is now a graph consumer. The dependency on importGraphAnalyzer is gone.

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

// Wave 69 Phase D: applyImportAnalysis and applyGraphAnalysis removed.
// Module boundary signals (barrel/direct ratio, boundary strength) and
// cohesion metrics are no longer computed by the contextLayer — the
// codebase-memory graph supplies the signal directly via
// repoMapGeneratorRanking + repoMapGeneratorDeps.

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
        // File-walk path: no graph signatures available. Wrap names as ModuleExport
        // with signature: null so the type is compatible with the graph-backed shape.
        exports: mod.exports.slice(0, 10).map((name) => ({
          name,
          signature: null,
          kind: 'Function' as const,
        })),
        recentlyChanged: mod.recentlyChanged,
      })),
  };
}
