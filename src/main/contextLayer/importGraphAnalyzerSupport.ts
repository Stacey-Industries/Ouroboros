/**
 * importGraphAnalyzerSupport.ts — Extracted helpers for import graph analysis.
 * Contains the seed-based module refinement logic (Part 3) split from
 * importGraphAnalyzer.ts to stay under the max-lines limit.
 */

import path from 'path';

import type { ImportGraph } from './importGraphAnalyzer';

// ---------------------------------------------------------------------------
// Part 3: Seed-Based Module Refinement
// ---------------------------------------------------------------------------

/** Simplified module reference to avoid circular dependency on DetectedModule. */
interface ModuleRef {
  id: string;
  files: { relativePath: string }[];
}

export interface RefinementResult {
  /** Refined module assignments: moduleId -> set of file relative paths */
  assignments: Map<string, Set<string>>;
  /** Files that were moved from their directory-based module */
  movements: Array<{
    filePath: string;
    fromModuleId: string;
    toModuleId: string;
    affinityScore: number;
  }>;
  /** Number of iterations until convergence */
  iterations: number;
}

const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_MOVE_THRESHOLD = 0.65;
const MIN_CONNECTIONS_FOR_MOVE = 3;

function isBarrelFile(filePath: string): boolean {
  const base = path.basename(filePath);
  const name = base.replace(/\.[^.]+$/, '');
  return name === 'index';
}

function topLevelSegment(relPath: string): string {
  const first = relPath.split('/')[0];
  return first ?? '';
}

/** Seed initial assignments from directory-based modules. */
function seedAssignments(modules: ModuleRef[]): {
  assignments: Map<string, Set<string>>;
  fileToModule: Map<string, string>;
} {
  const assignments = new Map<string, Set<string>>();
  const fileToModule = new Map<string, string>();

  for (const mod of modules) {
    const fileSet = new Set<string>();
    for (const f of mod.files) {
      fileSet.add(f.relativePath);
      fileToModule.set(f.relativePath, mod.id);
    }
    assignments.set(mod.id, fileSet);
  }

  return { assignments, fileToModule };
}

/** Build top-level segment map for cross-directory move prevention. */
function buildModuleTopLevels(modules: ModuleRef[]): Map<string, string> {
  const moduleTopLevel = new Map<string, string>();
  for (const mod of modules) {
    if (mod.files.length > 0) {
      moduleTopLevel.set(mod.id, topLevelSegment(mod.files[0].relativePath));
    }
  }
  return moduleTopLevel;
}

/** Count connections from a file to each module (bidirectional). */
function countModuleConnections(
  filePath: string,
  graph: ImportGraph,
  fileToModule: Map<string, string>,
): { moduleConnections: Map<string, number>; totalConnections: number } {
  const outEdges = graph.outgoing.get(filePath) ?? new Set<string>();
  const inEdges = graph.incoming.get(filePath) ?? new Set<string>();
  const totalConnections = outEdges.size + inEdges.size;
  const moduleConnections = new Map<string, number>();

  for (const target of outEdges) {
    const targetModule = fileToModule.get(target);
    if (targetModule) {
      moduleConnections.set(targetModule, (moduleConnections.get(targetModule) ?? 0) + 1);
    }
  }

  for (const source of inEdges) {
    const sourceModule = fileToModule.get(source);
    if (sourceModule) {
      moduleConnections.set(sourceModule, (moduleConnections.get(sourceModule) ?? 0) + 1);
    }
  }

  return { moduleConnections, totalConnections };
}

/** Find the module with highest connection count. */
function findBestModule(moduleConnections: Map<string, number>): {
  bestModuleId: string;
  bestCount: number;
} {
  let bestModuleId = '';
  let bestCount = 0;
  for (const [moduleId, count] of moduleConnections) {
    if (count > bestCount) {
      bestCount = count;
      bestModuleId = moduleId;
    }
  }
  return { bestModuleId, bestCount };
}

interface FileMoveCandidate {
  bestModuleId: string;
  affinityScore: number;
  currentFiles: Set<string>;
}

/** Check eligibility for a file move. Returns candidate data if eligible, null otherwise. */
function checkFileMoveEligibility(opts: {
  filePath: string;
  currentModuleId: string;
  graph: ImportGraph;
  fileToModule: Map<string, string>;
  assignments: Map<string, Set<string>>;
  moduleTopLevel: Map<string, string>;
  moveThreshold: number;
}): FileMoveCandidate | null {
  const { moduleConnections, totalConnections } = countModuleConnections(
    opts.filePath,
    opts.graph,
    opts.fileToModule,
  );
  if (totalConnections < MIN_CONNECTIONS_FOR_MOVE) return null;

  const { bestModuleId, bestCount } = findBestModule(moduleConnections);
  if (!bestModuleId || bestModuleId === opts.currentModuleId) return null;

  const affinityScore = bestCount / totalConnections;
  if (affinityScore < opts.moveThreshold) return null;

  const fileTopLevel = topLevelSegment(opts.filePath);
  const targetTopLevel = opts.moduleTopLevel.get(bestModuleId) ?? '';
  if (fileTopLevel !== targetTopLevel) return null;

  const currentFiles = opts.assignments.get(opts.currentModuleId);
  if (!currentFiles || currentFiles.size <= 1) return null;

  return { bestModuleId, affinityScore, currentFiles };
}

/** Perform a file move within assignment maps. */
function performFileMove(
  filePath: string,
  candidate: FileMoveCandidate,
  assignments: Map<string, Set<string>>,
  fileToModule: Map<string, string>,
): void {
  candidate.currentFiles.delete(filePath);
  let targetFiles = assignments.get(candidate.bestModuleId);
  if (!targetFiles) {
    targetFiles = new Set();
    assignments.set(candidate.bestModuleId, targetFiles);
  }
  targetFiles.add(filePath);
  fileToModule.set(filePath, candidate.bestModuleId);
}

/** Evaluate whether a file should move and perform the move if warranted. */
function evaluateFileMove(opts: {
  filePath: string;
  currentModuleId: string;
  graph: ImportGraph;
  fileToModule: Map<string, string>;
  assignments: Map<string, Set<string>>;
  moduleTopLevel: Map<string, string>;
  moveThreshold: number;
}): RefinementResult['movements'][0] | null {
  const candidate = checkFileMoveEligibility(opts);
  if (!candidate) return null;

  performFileMove(opts.filePath, candidate, opts.assignments, opts.fileToModule);

  return {
    filePath: opts.filePath,
    fromModuleId: opts.currentModuleId,
    toModuleId: candidate.bestModuleId,
    affinityScore: candidate.affinityScore,
  };
}

function runRefinementIteration(opts: {
  assignments: Map<string, Set<string>>;
  fileToModule: Map<string, string>;
  graph: ImportGraph;
  moduleTopLevel: Map<string, string>;
  moveThreshold: number;
}): RefinementResult['movements'] {
  const allFiles: string[] = [];
  for (const fileSet of opts.assignments.values()) {
    for (const filePath of fileSet) allFiles.push(filePath);
  }

  const iterMovements: RefinementResult['movements'] = [];
  for (const filePath of allFiles) {
    if (isBarrelFile(filePath)) continue;
    const currentModuleId = opts.fileToModule.get(filePath);
    if (!currentModuleId) continue;

    const movement = evaluateFileMove({
      filePath,
      currentModuleId,
      graph: opts.graph,
      fileToModule: opts.fileToModule,
      assignments: opts.assignments,
      moduleTopLevel: opts.moduleTopLevel,
      moveThreshold: opts.moveThreshold,
    });
    if (movement) iterMovements.push(movement);
  }
  return iterMovements;
}

/**
 * Iteratively refine module assignments using import graph affinity.
 */
export function refineModuleAssignments(
  modules: ModuleRef[],
  graph: ImportGraph,
  opts?: { maxIterations?: number; moveThreshold?: number },
): RefinementResult {
  const maxIterations = opts?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const moveThreshold = opts?.moveThreshold ?? DEFAULT_MOVE_THRESHOLD;

  const { assignments, fileToModule } = seedAssignments(modules);
  const moduleTopLevel = buildModuleTopLevels(modules);
  const allMovements: RefinementResult['movements'] = [];
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    const iterMovements = runRefinementIteration({
      assignments,
      fileToModule,
      graph,
      moduleTopLevel,
      moveThreshold,
    });
    allMovements.push(...iterMovements);
    if (iterMovements.length === 0) break;
  }

  return { assignments, movements: allMovements, iterations };
}
