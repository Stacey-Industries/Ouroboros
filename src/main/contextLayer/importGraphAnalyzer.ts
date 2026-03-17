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
 *   3. Seed-based refinement — iteratively moves files to better-fitting modules
 */

import path from 'path'
import type { RootRepoIndexSnapshot } from '../orchestration/repoIndexer'
import { getStrategyForExtension } from './languageStrategies'

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi',
  '.java',
  '.kt', '.kts',
  '.go',
  '.rs',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  '.rb',
  '.php',
  '.cs',
])
function isCodeFile(ext: string): boolean { return CODE_EXTENSIONS.has(ext) }

/** Simplified module reference to avoid circular dependency on DetectedModule. */
interface ModuleRef {
  id: string
  files: { relativePath: string }[]
}

// ---------------------------------------------------------------------------
// Part 1: Import Resolution
// ---------------------------------------------------------------------------

export interface ResolvedImport {
  fromFile: string   // relative path of importing file
  toFile: string     // relative path of imported file
  specifier: string  // original import string
}

export interface ImportGraph {
  /** All resolved import edges */
  edges: ResolvedImport[]
  /** Adjacency list: file relPath -> set of file relPaths it imports */
  outgoing: Map<string, Set<string>>
  /** Reverse adjacency: file relPath -> set of file relPaths that import it */
  incoming: Map<string, Set<string>>
  /** Count of relative imports that couldn't be resolved */
  unresolvedCount: number
  /** Total relative imports processed */
  totalRelativeImports: number
}

/**
 * Resolve a relative import specifier against the importing file's directory.
 * Both paths use forward slashes.
 */
function resolveRelativeImport(fileRelPath: string, importSpec: string): string {
  const dirParts = fileRelPath.split('/').slice(0, -1)
  const importParts = importSpec.split('/')

  const resolved: string[] = [...dirParts]
  for (const part of importParts) {
    if (part === '..') resolved.pop()
    else if (part !== '.' && part !== '') resolved.push(part)
  }
  return resolved.join('/')
}

/**
 * Build a fully resolved import graph from the repo index snapshots.
 *
 * For each code file's imports array, resolves relative imports to actual
 * indexed files by trying extension and index-file suffixes.
 */
export function buildResolvedImportGraph(roots: RootRepoIndexSnapshot[]): ImportGraph {
  // Collect all file relative paths for O(1) lookup
  const knownPaths = new Set<string>()
  // Map without extensions for prefix matching: "src/foo/bar" -> "src/foo/bar.ts"
  const pathWithoutExt = new Map<string, string>()

  for (const root of roots) {
    for (const file of root.files) {
      knownPaths.add(file.relativePath)
      // Strip extension for extensionless import matching
      const ext = path.extname(file.relativePath)
      if (ext) {
        const stem = file.relativePath.slice(0, -ext.length)
        // Only store the first match (prefer earlier roots)
        if (!pathWithoutExt.has(stem)) {
          pathWithoutExt.set(stem, file.relativePath)
        }
      }
    }
  }

  const EXTENSION_SUFFIXES = ['.ts', '.tsx', '.js', '.jsx']
  const INDEX_SUFFIXES = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx']

  /**
   * Try to resolve a path produced by resolveRelativeImport to an actual
   * indexed file. Returns the matched relative path or null.
   */
  function tryResolve(resolvedPath: string): string | null {
    // 1. Exact match (rare — import includes extension)
    if (knownPaths.has(resolvedPath)) return resolvedPath

    // 2. Try adding standard extensions
    for (const suffix of EXTENSION_SUFFIXES) {
      const candidate = resolvedPath + suffix
      if (knownPaths.has(candidate)) return candidate
    }

    // 3. Try as directory with index file
    for (const suffix of INDEX_SUFFIXES) {
      const candidate = resolvedPath + suffix
      if (knownPaths.has(candidate)) return candidate
    }

    return null
  }

  const edges: ResolvedImport[] = []
  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()
  let unresolvedCount = 0
  let totalRelativeImports = 0

  for (const root of roots) {
    for (const file of root.files) {
      if (!isCodeFile(file.extension)) continue

      // Get language-specific resolver for this file's extension
      const strategy = getStrategyForExtension(file.extension)

      for (const imp of file.imports) {
        totalRelativeImports++

        let matchedFile: string | null = null

        if (strategy) {
          // Use language-specific resolution
          matchedFile = strategy.resolveImport(imp, file.relativePath, knownPaths)
        } else {
          // Fallback: JS/TS-style resolution for relative imports only
          if (!imp.startsWith('.')) continue
          const resolvedPath = resolveRelativeImport(file.relativePath, imp)
          matchedFile = tryResolve(resolvedPath)
        }

        if (!matchedFile) {
          unresolvedCount++
          continue
        }

        // Skip self-imports
        if (matchedFile === file.relativePath) continue

        edges.push({
          fromFile: file.relativePath,
          toFile: matchedFile,
          specifier: imp,
        })

        // Update outgoing adjacency
        let outSet = outgoing.get(file.relativePath)
        if (!outSet) {
          outSet = new Set()
          outgoing.set(file.relativePath, outSet)
        }
        outSet.add(matchedFile)

        // Update incoming adjacency
        let inSet = incoming.get(matchedFile)
        if (!inSet) {
          inSet = new Set()
          incoming.set(matchedFile, inSet)
        }
        inSet.add(file.relativePath)
      }
    }
  }

  return {
    edges,
    outgoing,
    incoming,
    unresolvedCount,
    totalRelativeImports,
  }
}

// ---------------------------------------------------------------------------
// Part 2: Cohesion Analysis
// ---------------------------------------------------------------------------

export interface ModuleCohesionMetrics {
  moduleId: string
  /** Ratio of internal imports to total imports from this module's files (0-1) */
  internalCohesion: number
  /** Total import edges originating from this module's files */
  totalImports: number
  /** Import edges that stay within this module */
  internalImports: number
  /** Top modules this module depends on, sorted by import count */
  topDependencies: Array<{ moduleId: string; importCount: number }>
  /** Files whose imports mostly point to a different module */
  misplacedFiles: Array<{
    filePath: string
    currentModuleId: string
    bestModuleId: string
    affinityScore: number  // 0-1, how much of this file's imports go to bestModule
  }>
}

/**
 * Compute cohesion metrics for each module based on the import graph.
 *
 * Measures how self-contained each module is: what fraction of its imports
 * stay within the module, which external modules it depends on, and which
 * files might be misplaced.
 */
export function computeModuleCohesion(
  modules: ModuleRef[],
  graph: ImportGraph,
): ModuleCohesionMetrics[] {
  // Build file -> module mapping
  const fileToModule = new Map<string, string>()
  for (const mod of modules) {
    for (const f of mod.files) {
      fileToModule.set(f.relativePath, mod.id)
    }
  }

  const results: ModuleCohesionMetrics[] = []

  for (const mod of modules) {
    let internalImports = 0
    let totalImports = 0
    const externalModuleCounts = new Map<string, number>()
    const misplacedFiles: ModuleCohesionMetrics['misplacedFiles'] = []

    for (const file of mod.files) {
      const outEdges = graph.outgoing.get(file.relativePath)
      if (!outEdges || outEdges.size === 0) continue

      // Per-file affinity tracking
      const fileModuleHits = new Map<string, number>()
      let fileTotalImports = 0

      for (const target of outEdges) {
        const targetModule = fileToModule.get(target)
        if (!targetModule) continue

        totalImports++
        fileTotalImports++

        if (targetModule === mod.id) {
          internalImports++
          const count = fileModuleHits.get(mod.id) ?? 0
          fileModuleHits.set(mod.id, count + 1)
        } else {
          const count = externalModuleCounts.get(targetModule) ?? 0
          externalModuleCounts.set(targetModule, count + 1)

          const hitCount = fileModuleHits.get(targetModule) ?? 0
          fileModuleHits.set(targetModule, hitCount + 1)
        }
      }

      // Check if this file is misplaced: highest affinity to a different module
      if (fileTotalImports > 0) {
        let bestModuleId = mod.id
        let bestCount = 0

        for (const [moduleId, count] of fileModuleHits) {
          if (count > bestCount) {
            bestCount = count
            bestModuleId = moduleId
          }
        }

        const affinityScore = bestCount / fileTotalImports
        if (bestModuleId !== mod.id && affinityScore > 0.6) {
          misplacedFiles.push({
            filePath: file.relativePath,
            currentModuleId: mod.id,
            bestModuleId,
            affinityScore,
          })
        }
      }
    }

    // Build top dependencies sorted by import count
    const topDependencies = Array.from(externalModuleCounts.entries())
      .map(([moduleId, importCount]) => ({ moduleId, importCount }))
      .sort((a, b) => b.importCount - a.importCount)

    const internalCohesion = totalImports > 0
      ? internalImports / totalImports
      : 0

    results.push({
      moduleId: mod.id,
      internalCohesion,
      totalImports,
      internalImports,
      topDependencies,
      misplacedFiles,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Part 3: Seed-Based Module Refinement
// ---------------------------------------------------------------------------

export interface RefinementResult {
  /** Refined module assignments: moduleId -> set of file relative paths */
  assignments: Map<string, Set<string>>
  /** Files that were moved from their directory-based module */
  movements: Array<{
    filePath: string
    fromModuleId: string
    toModuleId: string
    affinityScore: number
  }>
  /** Number of iterations until convergence */
  iterations: number
}

const DEFAULT_MAX_ITERATIONS = 5
const DEFAULT_MOVE_THRESHOLD = 0.65
const MIN_CONNECTIONS_FOR_MOVE = 3

/**
 * Check whether a file is a barrel/index file for its module.
 * Barrels define the module boundary and must never be moved.
 */
function isBarrelFile(filePath: string): boolean {
  const base = path.basename(filePath)
  const name = base.replace(/\.[^.]+$/, '')
  return name === 'index'
}

/**
 * Extract the top-level directory segment from a relative path.
 * Used as a sanity check to prevent cross-process file moves
 * (e.g. renderer -> main).
 */
function topLevelSegment(relPath: string): string {
  const first = relPath.split('/')[0]
  return first ?? ''
}

/**
 * Iteratively refine module assignments using import graph affinity.
 *
 * Starts from directory-based module assignments and moves files to modules
 * where they have stronger import connections. Converges when no more files
 * move or maxIterations is reached.
 */
export function refineModuleAssignments(
  modules: ModuleRef[],
  graph: ImportGraph,
  opts?: { maxIterations?: number; moveThreshold?: number },
): RefinementResult {
  const maxIterations = opts?.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const moveThreshold = opts?.moveThreshold ?? DEFAULT_MOVE_THRESHOLD

  // Seed assignments from directory-based modules
  const assignments = new Map<string, Set<string>>()
  const fileToModule = new Map<string, string>()

  for (const mod of modules) {
    const fileSet = new Set<string>()
    for (const f of mod.files) {
      fileSet.add(f.relativePath)
      fileToModule.set(f.relativePath, mod.id)
    }
    assignments.set(mod.id, fileSet)
  }

  // Pre-compute top-level segments for each module (use the first file as proxy)
  const moduleTopLevel = new Map<string, string>()
  for (const mod of modules) {
    if (mod.files.length > 0) {
      moduleTopLevel.set(mod.id, topLevelSegment(mod.files[0].relativePath))
    }
  }

  const allMovements: RefinementResult['movements'] = []
  let iterations = 0

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1
    const iterMovements: RefinementResult['movements'] = []

    // Collect all files across all modules for this iteration
    const allFiles: string[] = []
    for (const fileSet of assignments.values()) {
      for (const filePath of fileSet) {
        allFiles.push(filePath)
      }
    }

    for (const filePath of allFiles) {
      // Never move barrel files
      if (isBarrelFile(filePath)) continue

      const currentModuleId = fileToModule.get(filePath)
      if (!currentModuleId) continue

      // Compute total connections (outgoing + incoming)
      const outEdges = graph.outgoing.get(filePath) ?? new Set<string>()
      const inEdges = graph.incoming.get(filePath) ?? new Set<string>()

      const totalConnections = outEdges.size + inEdges.size
      if (totalConnections < MIN_CONNECTIONS_FOR_MOVE) continue

      // Count connections to each module (bidirectional affinity)
      const moduleConnections = new Map<string, number>()

      for (const target of outEdges) {
        const targetModule = fileToModule.get(target)
        if (targetModule) {
          moduleConnections.set(targetModule, (moduleConnections.get(targetModule) ?? 0) + 1)
        }
      }

      for (const source of inEdges) {
        const sourceModule = fileToModule.get(source)
        if (sourceModule) {
          moduleConnections.set(sourceModule, (moduleConnections.get(sourceModule) ?? 0) + 1)
        }
      }

      // Find the module with the highest affinity
      let bestModuleId = currentModuleId
      let bestCount = 0

      for (const [moduleId, count] of moduleConnections) {
        if (count > bestCount) {
          bestCount = count
          bestModuleId = moduleId
        }
      }

      // Skip if best module is the current module
      if (bestModuleId === currentModuleId) continue

      const affinityScore = bestCount / totalConnections
      if (affinityScore < moveThreshold) continue

      // Sanity check: don't move files between different top-level directories
      const fileTopLevel = topLevelSegment(filePath)
      const targetTopLevel = moduleTopLevel.get(bestModuleId) ?? ''
      if (fileTopLevel !== targetTopLevel) continue

      // Don't empty a module — if this is the last file, keep it
      const currentModuleFiles = assignments.get(currentModuleId)
      if (currentModuleFiles && currentModuleFiles.size <= 1) continue

      // Perform the move
      currentModuleFiles?.delete(filePath)

      let targetModuleFiles = assignments.get(bestModuleId)
      if (!targetModuleFiles) {
        targetModuleFiles = new Set()
        assignments.set(bestModuleId, targetModuleFiles)
      }
      targetModuleFiles.add(filePath)

      fileToModule.set(filePath, bestModuleId)

      iterMovements.push({
        filePath,
        fromModuleId: currentModuleId,
        toModuleId: bestModuleId,
        affinityScore,
      })
    }

    // Record movements from this iteration
    allMovements.push(...iterMovements)

    // If no files moved, we've converged
    if (iterMovements.length === 0) break
  }

  return {
    assignments,
    movements: allMovements,
    iterations,
  }
}
