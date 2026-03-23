/**
 * importGraphAnalyzer.ts — Option C of the module detection system.
 *
 * Uses the actual import graph to validate and refine module assignments
 * that were initially derived from directory structure (Option A) and
 * annotated with barrel/import signals (Option B).
 *
 * Three capabilities:
 *   1. Import resolution — resolves relative imports to indexed files
 *   2. Cohesion analysis — measures how self-contained each module is
 *   3. Seed-based refinement — (in importGraphAnalyzerSupport.ts)
 */

import path from 'path';

import type { RootRepoIndexSnapshot } from '../orchestration/repoIndexer';
import { getStrategyForExtension } from './languageStrategies';

// Re-export Part 3 from support file
export { type RefinementResult, refineModuleAssignments } from './importGraphAnalyzerSupport';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.pyi',
  '.java',
  '.kt',
  '.kts',
  '.go',
  '.rs',
  '.c',
  '.cpp',
  '.cc',
  '.cxx',
  '.h',
  '.hpp',
  '.hxx',
  '.rb',
  '.php',
  '.cs',
]);
function isCodeFile(ext: string): boolean {
  return CODE_EXTENSIONS.has(ext);
}

/** Simplified module reference to avoid circular dependency on DetectedModule. */
interface ModuleRef {
  id: string;
  files: { relativePath: string }[];
}

// ---------------------------------------------------------------------------
// Part 1: Import Resolution
// ---------------------------------------------------------------------------

export interface ResolvedImport {
  fromFile: string; // relative path of importing file
  toFile: string; // relative path of imported file
  specifier: string; // original import string
}

export interface ImportGraph {
  /** All resolved import edges */
  edges: ResolvedImport[];
  /** Adjacency list: file relPath -> set of file relPaths it imports */
  outgoing: Map<string, Set<string>>;
  /** Reverse adjacency: file relPath -> set of file relPaths that import it */
  incoming: Map<string, Set<string>>;
  /** Count of relative imports that couldn't be resolved */
  unresolvedCount: number;
  /** Total relative imports processed */
  totalRelativeImports: number;
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

function registerFileWithoutExt(relPath: string, pathWithoutExt: Map<string, string>): void {
  const ext = path.extname(relPath);
  if (!ext) return;
  const stem = relPath.slice(0, -ext.length);
  if (!pathWithoutExt.has(stem)) pathWithoutExt.set(stem, relPath);
}

/** Build known path sets for O(1) lookup during import resolution. */
function buildPathLookups(roots: RootRepoIndexSnapshot[]): {
  knownPaths: Set<string>;
  pathWithoutExt: Map<string, string>;
} {
  const knownPaths = new Set<string>();
  const pathWithoutExt = new Map<string, string>();

  for (const root of roots) {
    for (const file of root.files) {
      knownPaths.add(file.relativePath);
      registerFileWithoutExt(file.relativePath, pathWithoutExt);
    }
  }

  return { knownPaths, pathWithoutExt };
}

const EXTENSION_SUFFIXES = ['.ts', '.tsx', '.js', '.jsx'];
const INDEX_SUFFIXES = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

/** Try to resolve a path to an actual indexed file. */
function tryResolve(resolvedPath: string, knownPaths: Set<string>): string | null {
  if (knownPaths.has(resolvedPath)) return resolvedPath;
  for (const suffix of EXTENSION_SUFFIXES) {
    const candidate = resolvedPath + suffix;
    if (knownPaths.has(candidate)) return candidate;
  }
  for (const suffix of INDEX_SUFFIXES) {
    const candidate = resolvedPath + suffix;
    if (knownPaths.has(candidate)) return candidate;
  }
  return null;
}

/** Resolve a single import using language strategy or JS/TS fallback. */
function resolveOneImport(
  imp: string,
  fileRelPath: string,
  fileExt: string,
  knownPaths: Set<string>,
): string | null {
  const strategy = getStrategyForExtension(fileExt);
  if (strategy) {
    return strategy.resolveImport(imp, fileRelPath, knownPaths);
  }
  // Fallback: JS/TS-style resolution for relative imports only
  if (!imp.startsWith('.')) return null;
  const resolvedPath = resolveRelativeImport(fileRelPath, imp);
  return tryResolve(resolvedPath, knownPaths);
}

/** Add an edge to the outgoing/incoming adjacency maps. */
function addGraphEdge(
  fromFile: string,
  toFile: string,
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>,
): void {
  let outSet = outgoing.get(fromFile);
  if (!outSet) {
    outSet = new Set();
    outgoing.set(fromFile, outSet);
  }
  outSet.add(toFile);

  let inSet = incoming.get(toFile);
  if (!inSet) {
    inSet = new Set();
    incoming.set(toFile, inSet);
  }
  inSet.add(fromFile);
}

/**
 * Build a fully resolved import graph from the repo index snapshots.
 */
export function buildResolvedImportGraph(roots: RootRepoIndexSnapshot[]): ImportGraph {
  const { knownPaths } = buildPathLookups(roots);
  const acc: GraphAccumulator = {
    edges: [],
    outgoing: new Map(),
    incoming: new Map(),
    unresolvedCount: 0,
    totalRelativeImports: 0,
  };

  for (const root of roots) {
    for (const file of root.files) {
      if (!isCodeFile(file.extension)) continue;
      processFileImports(file, knownPaths, acc);
    }
  }

  return { ...acc };
}

interface GraphAccumulator {
  edges: ResolvedImport[];
  outgoing: Map<string, Set<string>>;
  incoming: Map<string, Set<string>>;
  unresolvedCount: number;
  totalRelativeImports: number;
}

function processFileImports(
  file: { relativePath: string; extension: string; imports: string[] },
  knownPaths: Set<string>,
  acc: GraphAccumulator,
): void {
  for (const imp of file.imports) {
    acc.totalRelativeImports++;
    const matchedFile = resolveOneImport(imp, file.relativePath, file.extension, knownPaths);
    if (!matchedFile) {
      acc.unresolvedCount++;
      continue;
    }
    if (matchedFile === file.relativePath) continue;
    acc.edges.push({ fromFile: file.relativePath, toFile: matchedFile, specifier: imp });
    addGraphEdge(file.relativePath, matchedFile, acc.outgoing, acc.incoming);
  }
}

// ---------------------------------------------------------------------------
// Part 2: Cohesion Analysis
// ---------------------------------------------------------------------------

export interface ModuleCohesionMetrics {
  moduleId: string;
  internalCohesion: number;
  totalImports: number;
  internalImports: number;
  topDependencies: Array<{ moduleId: string; importCount: number }>;
  misplacedFiles: Array<{
    filePath: string;
    currentModuleId: string;
    bestModuleId: string;
    affinityScore: number;
  }>;
}

/** Build file -> module ID mapping. */
function buildFileToModuleMap(modules: ModuleRef[]): Map<string, string> {
  const fileToModule = new Map<string, string>();
  for (const mod of modules) {
    for (const f of mod.files) {
      fileToModule.set(f.relativePath, mod.id);
    }
  }
  return fileToModule;
}

type MisplacedFile = ModuleCohesionMetrics['misplacedFiles'][0];

function detectMisplacement(
  fileModuleHits: Map<string, number>,
  totalHits: number,
  moduleId: string,
  fileRelPath: string,
): MisplacedFile | null {
  if (totalHits === 0) return null;
  let bestModuleId = moduleId;
  let bestCount = 0;
  for (const [mid, count] of fileModuleHits) {
    if (count > bestCount) {
      bestCount = count;
      bestModuleId = mid;
    }
  }
  const affinityScore = bestCount / totalHits;
  if (bestModuleId !== moduleId && affinityScore > 0.6) {
    return { filePath: fileRelPath, currentModuleId: moduleId, bestModuleId, affinityScore };
  }
  return null;
}

/** Compute per-file affinity and detect misplaced files. */
function analyzeFileAffinity(
  outEdges: Set<string>,
  moduleId: string,
  fileRelPath: string,
  fileToModule: Map<string, string>,
): {
  internalHits: number;
  totalHits: number;
  externalCounts: Map<string, number>;
  misplaced: MisplacedFile | null;
} {
  const fileModuleHits = new Map<string, number>();
  const externalCounts = new Map<string, number>();
  let internalHits = 0;
  let totalHits = 0;

  for (const target of outEdges) {
    const targetModule = fileToModule.get(target);
    if (!targetModule) continue;
    totalHits++;
    if (targetModule === moduleId) {
      internalHits++;
    } else {
      externalCounts.set(targetModule, (externalCounts.get(targetModule) ?? 0) + 1);
    }
    fileModuleHits.set(targetModule, (fileModuleHits.get(targetModule) ?? 0) + 1);
  }

  return {
    internalHits,
    totalHits,
    externalCounts,
    misplaced: detectMisplacement(fileModuleHits, totalHits, moduleId, fileRelPath),
  };
}

/**
 * Compute cohesion metrics for each module based on the import graph.
 */
export function computeModuleCohesion(
  modules: ModuleRef[],
  graph: ImportGraph,
): ModuleCohesionMetrics[] {
  const fileToModule = buildFileToModuleMap(modules);
  const results: ModuleCohesionMetrics[] = [];

  for (const mod of modules) {
    let internalImports = 0;
    let totalImports = 0;
    const externalModuleCounts = new Map<string, number>();
    const misplacedFiles: ModuleCohesionMetrics['misplacedFiles'] = [];

    for (const file of mod.files) {
      const outEdges = graph.outgoing.get(file.relativePath);
      if (!outEdges || outEdges.size === 0) continue;

      const result = analyzeFileAffinity(outEdges, mod.id, file.relativePath, fileToModule);
      internalImports += result.internalHits;
      totalImports += result.totalHits;

      for (const [extMod, count] of result.externalCounts) {
        externalModuleCounts.set(extMod, (externalModuleCounts.get(extMod) ?? 0) + count);
      }
      if (result.misplaced) misplacedFiles.push(result.misplaced);
    }

    const topDependencies = Array.from(externalModuleCounts.entries())
      .map(([moduleId, importCount]) => ({ moduleId, importCount }))
      .sort((a, b) => b.importCount - a.importCount);

    const internalCohesion = totalImports > 0 ? internalImports / totalImports : 0;

    results.push({
      moduleId: mod.id,
      internalCohesion,
      totalImports,
      internalImports,
      topDependencies,
      misplacedFiles,
    });
  }

  return results;
}
