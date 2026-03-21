/**
 * contextLayerController.ts — Builds the three context layers (repo map,
 * module summaries, dependency graph) from the repo indexer's data and
 * attaches them to context packets before they reach the provider.
 *
 * On startup, indexes the workspace and caches module data.  Subsequent
 * calls to enrichPacket() reuse the cache and only rebuild modules whose
 * underlying files have changed.
 */

import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { ContextLayerConfig } from './contextLayerTypes'
import type {
  ContextPacket,
  ModuleContextSummary,
  RepoMapSummary,
} from '../orchestration/types'
import { buildLspDiagnosticsSummary } from '../orchestration/lspDiagnosticsProvider'
import {
  buildRepoIndexSnapshot,
  type IndexedRepoFile,
  type RepoIndexSnapshot,
  type RootRepoIndexSnapshot,
} from '../orchestration/repoIndexer'
import {
  buildResolvedImportGraph,
  computeModuleCohesion,
  refineModuleAssignments,
  type ModuleCohesionMetrics,
} from './importGraphAnalyzer'
import { getStrategyForExtension, configureTypeScriptAliases } from './languageStrategies'

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ContextLayerController {
  enrichPacket(packet: ContextPacket, goalKeywords: string[], existingSnapshot?: RepoIndexSnapshot): Promise<{ packet: ContextPacket }>
  onConfigChange(config: ContextLayerConfig): Promise<void>
  onSessionStart(): void
  onGitCommit(): void
  onFileChange(type: string, filePath: string): void
}

interface InitContextLayerOptions {
  workspaceRoot: string
  buildRepoIndex: (...args: unknown[]) => unknown
  config: ContextLayerConfig
}

// ---------------------------------------------------------------------------
// Module detection — groups files into logical modules by directory
// ---------------------------------------------------------------------------

interface ModuleBoundarySignals {
  /** Module has an index.ts/tsx/js barrel file */
  hasBarrel: boolean
  /** Unique file extensions present (e.g. ['ts', 'tsx', 'css']) */
  fileTypeMix: string[]
  /** Count of external imports that resolve to this module's barrel */
  barrelImportCount: number
  /** Count of external imports that bypass the barrel to reach internal files */
  directImportCount: number
  /** Overall boundary strength derived from signals */
  boundaryStrength: 'strong' | 'moderate' | 'weak'
}

interface DetectedModule {
  id: string
  label: string
  rootPath: string
  files: IndexedRepoFile[]
  exports: string[]
  recentlyChanged: boolean
  boundarySignals: ModuleBoundarySignals
  /** Internal cohesion ratio (0-1) — fraction of imports that stay within module */
  cohesion: number
}

interface CachedModuleData {
  module: DetectedModule
  summary: ModuleContextSummary
  /** Hash of file paths + sizes + modifiedAt — used to detect changes. */
  stateHash: string
  /** True once the summary has been enriched by an AI call. */
  aiEnriched?: boolean
}

// ---------------------------------------------------------------------------
// Adaptive module detection — walks the directory tree and uses structural
// signals (code files present, barrel files, leaf status) instead of a fixed
// depth to decide where module boundaries are.
// ---------------------------------------------------------------------------

const DEFAULT_MODULE_DEPTH_LIMIT = 6

interface DirNode {
  /** Directory name (last segment). */
  name: string
  /** Forward-slash relative path from workspace root (e.g. "src/main/ipc-handlers"). */
  relPath: string
  /** Absolute path on disk. */
  absPath: string
  /** Files directly in this directory (not in subdirectories). */
  directFiles: IndexedRepoFile[]
  /** Subdirectories. */
  children: Map<string, DirNode>
}

/** Build a virtual directory tree from the flat file list. */
function buildDirTree(files: IndexedRepoFile[], rootPath: string): DirNode {
  const root: DirNode = {
    name: '',
    relPath: '',
    absPath: rootPath,
    directFiles: [],
    children: new Map(),
  }

  for (const file of files) {
    const segments = file.relativePath.split('/')
    const dirSegments = segments.slice(0, -1)

    let current = root
    for (let i = 0; i < dirSegments.length; i++) {
      const seg = dirSegments[i]
      let child = current.children.get(seg)
      if (!child) {
        const childRelPath = dirSegments.slice(0, i + 1).join('/')
        child = {
          name: seg,
          relPath: childRelPath,
          absPath: path.join(rootPath, childRelPath),
          directFiles: [],
          children: new Map(),
        }
        current.children.set(seg, child)
      }
      current = child
    }

    current.directFiles.push(file)
  }

  return root
}

/** Recursively collect every file under a DirNode. */
function collectAllFiles(node: DirNode): IndexedRepoFile[] {
  const files = [...node.directFiles]
  for (const child of node.children.values()) {
    files.push(...collectAllFiles(child))
  }
  return files
}

/** Create a DetectedModule from a DirNode and its file set. */
function makeModule(
  node: DirNode,
  files: IndexedRepoFile[],
  changedFiles: Set<string>,
): DetectedModule {
  const hasBarrel = files.some(f => {
    const strategy = getStrategyForExtension(f.extension)
    if (strategy) return strategy.isModuleEntryPoint(f.relativePath)
    // Fallback for unsupported languages
    const base = path.basename(f.relativePath, f.extension)
    return base === 'index' && isCodeFile(f.extension)
  })

  const extSet = new Set<string>()
  for (const f of files) {
    if (f.extension) extSet.add(f.extension.replace(/^\./, ''))
  }

  return {
    id: node.relPath.replace(/[\\/]/g, '/') || '.',
    label: node.name || path.basename(node.absPath),
    rootPath: node.absPath,
    files,
    exports: files
      .filter(f => {
        const base = path.basename(f.relativePath, f.extension)
        return base !== 'index' && isCodeFile(f.extension)
      })
      .map(f => path.basename(f.relativePath, f.extension)),
    recentlyChanged: files.some(f => changedFiles.has(normalizePath(f.path))),
    boundarySignals: {
      hasBarrel,
      fileTypeMix: Array.from(extSet).sort(),
      barrelImportCount: 0,   // populated later by import analysis
      directImportCount: 0,   // populated later by import analysis
      boundaryStrength: 'weak', // computed later after import analysis
    },
    cohesion: 0, // populated after import graph analysis
  }
}

/**
 * Walk the directory tree depth-first, collecting modules adaptively.
 *
 * Rules:
 * - At max depth → absorb the entire subtree into one module.
 * - Leaf directory (no children) → module if it has code files.
 * - Interior directory → recurse into children first, then create a module
 *   for this directory's direct files if any are code files.
 * - Directories with no direct code files are namespaces (pass-through).
 */
function collectModulesFromTree(
  node: DirNode,
  changedFiles: Set<string>,
  result: DetectedModule[],
  depth: number,
  maxDepth: number,
): void {
  const isLeaf = node.children.size === 0

  // At max depth: absorb entire subtree into one module (only if it has code)
  if (depth >= maxDepth) {
    const allFiles = collectAllFiles(node)
    if (allFiles.some(f => isCodeFile(f.extension))) {
      result.push(makeModule(node, allFiles, changedFiles))
    }
    return
  }

  // Leaf directory: module only if it has code files (filters out assets/fonts, docs, etc.)
  if (isLeaf) {
    if (node.directFiles.some(f => isCodeFile(f.extension))) {
      result.push(makeModule(node, node.directFiles, changedFiles))
    }
    return
  }

  // Interior directory: recurse into children first
  for (const child of node.children.values()) {
    collectModulesFromTree(child, changedFiles, result, depth + 1, maxDepth)
  }

  // Then create a module for this dir's direct files if it has code files
  const hasDirectCode = node.directFiles.some(f => isCodeFile(f.extension))
  if (hasDirectCode) {
    result.push(makeModule(node, node.directFiles, changedFiles))
  }
}

function detectModules(
  roots: RootRepoIndexSnapshot[],
  changedFiles: Set<string>,
  depthLimit: number = DEFAULT_MODULE_DEPTH_LIMIT,
): DetectedModule[] {
  const modules: DetectedModule[] = []

  for (const root of roots) {
    const tree = buildDirTree(root.files, root.rootPath)

    // Start from children of root — the root itself is always a namespace
    for (const child of tree.children.values()) {
      collectModulesFromTree(child, changedFiles, modules, 1, depthLimit)
    }

    // Handle code files directly in root (rare — e.g. a top-level script)
    if (tree.directFiles.some(f => isCodeFile(f.extension))) {
      modules.push(makeModule(tree, tree.directFiles, changedFiles))
    }
  }

  return modules
}

// ---------------------------------------------------------------------------
// Import-as-unit analysis — counts barrel vs direct imports per module
// ---------------------------------------------------------------------------

interface ModuleImportCounts {
  barrelImportCount: number
  directImportCount: number
}

/**
 * Resolve a relative import specifier against the importing file's path.
 * Both paths use forward slashes. Returns the resolved path.
 */
function resolveRelativeImport(fileRelPath: string, importSpec: string): string {
  const dirParts = fileRelPath.split('/').slice(0, -1) // file's directory
  const importParts = importSpec.split('/')

  const resolved: string[] = [...dirParts]
  for (const part of importParts) {
    if (part === '..') resolved.pop()
    else if (part !== '.' && part !== '') resolved.push(part)
  }
  return resolved.join('/')
}

/**
 * Analyze import patterns across all files to determine which modules
 * are imported via their barrel (index file) vs having internals accessed directly.
 *
 * For each relative import in each file:
 * - If the resolved path exactly matches a module's relPath → barrel import
 * - If the resolved path starts with moduleRelPath + '/' → direct file import
 */
function analyzeModuleImportPatterns(
  modules: DetectedModule[],
  roots: RootRepoIndexSnapshot[],
): Map<string, ModuleImportCounts> {
  const counts = new Map<string, ModuleImportCounts>()
  for (const mod of modules) {
    counts.set(mod.id, { barrelImportCount: 0, directImportCount: 0 })
  }

  // Build sorted module IDs (longest first) for greedy matching
  const sortedModuleIds = modules
    .map(m => m.id)
    .sort((a, b) => b.length - a.length)

  // Map each file's relPath to its module ID so we can skip self-imports
  const fileToModuleId = new Map<string, string>()
  for (const mod of modules) {
    for (const f of mod.files) {
      fileToModuleId.set(f.relativePath, mod.id)
    }
  }

  for (const root of roots) {
    for (const file of root.files) {
      if (!isCodeFile(file.extension)) continue
      const sourceModuleId = fileToModuleId.get(file.relativePath)

      for (const imp of file.imports) {
        // Only analyze relative imports
        if (!imp.startsWith('.')) continue

        const resolved = resolveRelativeImport(file.relativePath, imp)

        // Check if resolved path matches a module (barrel import)
        // or goes into a module (direct import)
        for (const moduleId of sortedModuleIds) {
          if (moduleId === sourceModuleId) continue // skip self

          if (resolved === moduleId) {
            // Barrel import — import resolves to the module directory
            const entry = counts.get(moduleId)!
            entry.barrelImportCount++
            break
          }

          if (resolved.startsWith(moduleId + '/')) {
            // Direct import — import reaches into the module
            const entry = counts.get(moduleId)!
            entry.directImportCount++
            break
          }
        }
      }
    }
  }

  return counts
}

/**
 * Derive boundary strength from accumulated signals.
 * - strong: has barrel AND majority barrel imports (or no external imports yet)
 * - moderate: has barrel OR has significant external import traffic
 * - weak: no barrel and few/no external imports
 */
function computeBoundaryStrength(signals: ModuleBoundarySignals): 'strong' | 'moderate' | 'weak' {
  const totalImports = signals.barrelImportCount + signals.directImportCount
  const barrelRatio = totalImports > 0 ? signals.barrelImportCount / totalImports : 0

  if (signals.hasBarrel && (barrelRatio >= 0.5 || totalImports === 0)) {
    return 'strong'
  }
  if (signals.hasBarrel || totalImports >= 3) {
    return 'moderate'
  }
  return 'weak'
}

/** Run import analysis and apply results + boundary strength to all modules. */
function applyImportAnalysis(
  modules: DetectedModule[],
  roots: RootRepoIndexSnapshot[],
): void {
  const counts = analyzeModuleImportPatterns(modules, roots)
  for (const mod of modules) {
    const entry = counts.get(mod.id)
    if (entry) {
      mod.boundarySignals.barrelImportCount = entry.barrelImportCount
      mod.boundarySignals.directImportCount = entry.directImportCount
    }
    mod.boundarySignals.boundaryStrength = computeBoundaryStrength(mod.boundarySignals)
  }
}

/**
 * Run the full Option C pipeline: resolve imports, compute cohesion,
 * refine module assignments, and apply results back to modules.
 */
function applyGraphAnalysis(
  modules: DetectedModule[],
  roots: RootRepoIndexSnapshot[],
  allFiles: IndexedRepoFile[],
): { movements: number } {
  const graph = buildResolvedImportGraph(roots)

  // 1. Compute cohesion metrics
  const cohesionMetrics = computeModuleCohesion(modules, graph)
  const cohesionById = new Map(cohesionMetrics.map(c => [c.moduleId, c]))

  // Apply cohesion scores to modules
  for (const mod of modules) {
    const metrics = cohesionById.get(mod.id)
    if (metrics) {
      mod.cohesion = metrics.internalCohesion
    }
  }

  // 2. Refine assignments via seed-based clustering
  const refinement = refineModuleAssignments(modules, graph)

  // 3. Apply file movements to DetectedModule objects
  if (refinement.movements.length > 0) {
    // Build file lookup for quick access
    const fileByPath = new Map<string, IndexedRepoFile>()
    for (const f of allFiles) {
      fileByPath.set(f.relativePath, f)
    }
    const moduleById = new Map(modules.map(m => [m.id, m]))

    for (const move of refinement.movements) {
      const sourceModule = moduleById.get(move.fromModuleId)
      const targetModule = moduleById.get(move.toModuleId)
      if (!sourceModule || !targetModule) continue

      const fileObj = fileByPath.get(move.filePath)
      if (!fileObj) continue

      // Remove from source
      sourceModule.files = sourceModule.files.filter(f => f.relativePath !== move.filePath)
      // Add to target
      targetModule.files.push(fileObj)
    }

    // Rebuild exports for affected modules
    const affectedIds = new Set(refinement.movements.flatMap(m => [m.fromModuleId, m.toModuleId]))
    for (const id of affectedIds) {
      const mod = moduleById.get(id)
      if (mod) {
        mod.exports = mod.files
          .filter(f => {
            const base = path.basename(f.relativePath, f.extension)
            return base !== 'index' && isCodeFile(f.extension)
          })
          .map(f => path.basename(f.relativePath, f.extension))
      }
    }
  }

  console.log(
    `[context-layer] Import graph: ${graph.edges.length} edges resolved, ` +
    `${graph.unresolvedCount} unresolved of ${graph.totalRelativeImports} relative imports`
  )

  if (refinement.movements.length > 0) {
    console.log(`[context-layer] Refinement: ${refinement.movements.length} file(s) moved in ${refinement.iterations} iteration(s)`)
    for (const move of refinement.movements) {
      console.log(`[context-layer]   ${path.basename(move.filePath)}: ${move.fromModuleId} → ${move.toModuleId} (affinity ${(move.affinityScore * 100).toFixed(0)}%)`)
    }
  }

  return { movements: refinement.movements.length }
}

function isCodeFile(ext: string): boolean {
  return [
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
  ].includes(ext)
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

function computeModuleHash(mod: DetectedModule): string {
  const hash = createHash('sha1')
  for (const file of mod.files) {
    hash.update(`${file.relativePath}|${file.size}|${file.modifiedAt}`)
  }
  return hash.digest('hex')
}

// ---------------------------------------------------------------------------
// Repo map builder
// ---------------------------------------------------------------------------

function buildRepoMap(
  roots: RootRepoIndexSnapshot[],
  modules: DetectedModule[],
): RepoMapSummary {
  const allLanguages = new Set<string>()
  const frameworks = new Set<string>()

  for (const root of roots) {
    for (const lang of root.workspaceFact.languages) {
      allLanguages.add(lang)
    }
  }

  for (const root of roots) {
    for (const file of root.files) {
      const name = path.basename(file.path)
      if (name === 'next.config.js' || name === 'next.config.mjs' || name === 'next.config.ts') frameworks.add('next.js')
      if (name === 'vite.config.ts' || name === 'vite.config.js') frameworks.add('vite')
      if (name === 'electron-builder.yml' || name === 'electron-builder.json5') frameworks.add('electron')
      if (name === 'tailwind.config.js' || name === 'tailwind.config.ts') frameworks.add('tailwind')
      if (name === 'tsconfig.json') frameworks.add('typescript')
      if (file.imports.some(i => i.includes('react'))) frameworks.add('react')
      if (file.imports.some(i => i.includes('express'))) frameworks.add('express')
    }
  }

  const projectName = roots.length > 0
    ? path.basename(roots[0].rootPath)
    : 'unknown'

  return {
    projectName,
    languages: Array.from(allLanguages),
    frameworks: Array.from(frameworks),
    moduleCount: modules.length,
    modules: modules
      .sort((a, b) => b.files.length - a.files.length)
      .slice(0, 30)
      .map(mod => ({
        id: mod.id,
        label: mod.label,
        rootPath: mod.rootPath,
        fileCount: mod.files.length,
        exports: mod.exports.slice(0, 10),
        recentlyChanged: mod.recentlyChanged,
      })),
  }
}

// ---------------------------------------------------------------------------
// Module summary builder (single module — used for caching)
// ---------------------------------------------------------------------------

function buildSingleModuleSummary(mod: DetectedModule, cohesionMetrics?: ModuleCohesionMetrics): ModuleContextSummary {
  const languages = summarizeModuleLanguages(mod.files)
  const dependencies = cohesionMetrics?.topDependencies.slice(0, 3).map(d => d.moduleId) ?? []
  return {
    moduleId: mod.id,
    label: mod.label,
    rootPath: mod.rootPath,
    description: `${mod.label} module (${mod.files.length} files, ${languages.join('/')}${mod.boundarySignals.hasBarrel ? ', barrel' : ''}, ${mod.boundarySignals.boundaryStrength} boundary, ${(mod.cohesion * 100).toFixed(0)}% cohesion)`,
    keyResponsibilities: deriveResponsibilities(mod),
    gotchas: deriveGotchas(mod),
    exports: mod.exports.slice(0, 10),
    dependencies: dependencies.length > 0 ? dependencies : undefined,
  }
}

function selectModuleSummariesForGoal(
  cached: Map<string, CachedModuleData>,
  goalKeywords: string[],
  maxModules: number,
): ModuleContextSummary[] {
  const scored = Array.from(cached.values()).map(entry => {
    let score = 0
    const lowerLabel = entry.module.label.toLowerCase()
    const lowerExports = entry.module.exports.map(e => e.toLowerCase())
    const lowerFiles = entry.module.files.map(f => path.basename(f.relativePath).toLowerCase())

    for (const kw of goalKeywords) {
      if (lowerLabel.includes(kw)) score += 3
      if (entry.module.id.toLowerCase().includes(kw)) score += 2
      if (lowerExports.some(e => e.includes(kw))) score += 2
      if (lowerFiles.some(f => f.includes(kw))) score += 1
    }

    if (entry.module.recentlyChanged) score += 1

    // Boost well-defined modules — strong boundaries and high cohesion
    // indicate canonical places to look for a given concern
    const strength = entry.module.boundarySignals.boundaryStrength
    if (strength === 'strong') score += 2
    else if (strength === 'moderate') score += 1

    // High-cohesion modules are more self-contained and useful as context
    if (entry.module.cohesion >= 0.5) score += 1

    return { summary: entry.summary, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxModules).map(s => s.summary)
}

function summarizeModuleLanguages(files: IndexedRepoFile[]): string[] {
  const counts = new Map<string, number>()
  for (const file of files) {
    if (file.language !== 'unknown') {
      counts.set(file.language, (counts.get(file.language) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([lang]) => lang)
}

function deriveResponsibilities(mod: DetectedModule): string[] {
  const responsibilities: string[] = []
  const fileNames = mod.files.map(f => path.basename(f.relativePath, f.extension).toLowerCase())

  if (mod.files.some(f => f.extension === '.tsx')) responsibilities.push('UI components')
  if (fileNames.some(f => f.includes('handler') || f.includes('controller') || f.includes('service'))) responsibilities.push('Request handling / business logic')
  if (fileNames.some(f => f.includes('config') || f.includes('settings'))) responsibilities.push('Configuration management')
  if (fileNames.some(f => f.includes('types') || f.includes('interfaces'))) responsibilities.push('Type definitions')
  if (fileNames.some(f => f.includes('utils') || f.includes('helpers') || f.includes('support'))) responsibilities.push('Shared utilities')
  if (fileNames.some(f => f.includes('test') || f.includes('spec'))) responsibilities.push('Test coverage')
  if (mod.boundarySignals.hasBarrel) responsibilities.push('Public API via barrel export')

  if (responsibilities.length === 0) {
    responsibilities.push(`Contains ${mod.files.length} files`)
  }

  return responsibilities.slice(0, 5)
}

function deriveGotchas(mod: DetectedModule): string[] {
  const gotchas: string[] = []

  if (mod.files.length > 20) {
    gotchas.push(`Large module (${mod.files.length} files) — changes may have broad impact`)
  }

  const externalImports = mod.files.flatMap(f => f.imports.filter(i => !i.startsWith('.')))
  const uniqueExternal = new Set(externalImports)
  if (uniqueExternal.size > 15) {
    gotchas.push(`Heavy external dependencies (${uniqueExternal.size} unique imports)`)
  }

  const filesWithErrors = mod.files.filter(f => f.diagnostics && f.diagnostics.errors > 0)
  if (filesWithErrors.length > 0) {
    gotchas.push(`${filesWithErrors.length} file(s) with active errors`)
  }

  if (mod.cohesion > 0 && mod.cohesion < 0.2 && mod.files.length > 3) {
    gotchas.push(`Low cohesion (${(mod.cohesion * 100).toFixed(0)}%) — files may belong to different concerns`)
  }

  return gotchas.slice(0, 3)
}

// ---------------------------------------------------------------------------
// AI summarization helpers
// ---------------------------------------------------------------------------

/** Select the 1-3 most representative files from a module for AI analysis. */
function selectRepresentativeFiles(mod: DetectedModule): IndexedRepoFile[] {
  const codeFiles = mod.files.filter(f => isCodeFile(f.extension))
  const selected: IndexedRepoFile[] = []

  // 1. Barrel / index file — shows the public API surface
  const barrel = codeFiles.find(f => {
    const base = path.basename(f.relativePath, f.extension)
    return base === 'index'
  })
  if (barrel) selected.push(barrel)

  // 2. Types / interfaces file — reveals domain concepts
  const types = codeFiles.find(f => {
    const base = path.basename(f.relativePath, f.extension).toLowerCase()
    return (base === 'types' || base === 'interfaces') && !selected.includes(f)
  })
  if (types) selected.push(types)

  // 3. Largest remaining code file — usually the main implementation
  const remaining = codeFiles.filter(f => !selected.includes(f))
  remaining.sort((a, b) => b.size - a.size)
  if (remaining[0]) selected.push(remaining[0])

  return selected.slice(0, 3)
}

// ---------------------------------------------------------------------------
// Controller implementation with caching
// ---------------------------------------------------------------------------

let controller: ContextLayerController | null = null

class ContextLayerControllerImpl implements ContextLayerController {
  private config: ContextLayerConfig
  private workspaceRoots: string[]
  private cachedModules = new Map<string, CachedModuleData>()
  private cachedRepoMap: RepoMapSummary | null = null
  private lastSnapshotCacheKey: string | null = null
  private dirtyModuleIds = new Set<string>()
  /** Exposed so initContextLayer can await the initial index. */
  initPromise: Promise<void> | null = null

  /** Debounce state for onFileChange — buffers file paths and processes after a quiet period. */
  private fileChangeBuffer: string[] = []
  private fileChangeTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly FILE_CHANGE_DEBOUNCE_MS = 2_000

  /** Timestamp of the last successful initialization (ms since epoch). */
  private lastInitCompletedAt = 0
  /** Minimum interval between full re-indexes (ms). */
  private static readonly INIT_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

  private aiFailureCount = 0
  private static readonly MAX_AI_FAILURES = 3

  constructor(config: ContextLayerConfig, workspaceRoot: string) {
    this.config = config
    this.workspaceRoots = workspaceRoot ? [workspaceRoot] : []
  }

  /**
   * Discover tsconfig.json files in the workspace and extract path alias
   * mappings. Merges aliases from all tsconfig files found (root, node, web).
   */
  private async loadPathAliases(): Promise<void> {
    if (this.workspaceRoots.length === 0) return

    const root = this.workspaceRoots[0]
    const candidates = ['tsconfig.node.json', 'tsconfig.web.json', 'tsconfig.json']
    const mergedPaths: Record<string, string[]> = {}

    for (const name of candidates) {
      try {
        const raw = await readFile(path.join(root, name), 'utf-8')
        const parsed = JSON.parse(raw)
        const paths = parsed?.compilerOptions?.paths
        if (paths && typeof paths === 'object') {
          Object.assign(mergedPaths, paths)
        }
      } catch {
        // File doesn't exist or isn't valid JSON — skip silently
      }
    }

    if (Object.keys(mergedPaths).length > 0) {
      configureTypeScriptAliases(mergedPaths)
    }
  }

  /**
   * Run the initial index — builds module summaries for all detected
   * modules and caches them.  Skips modules whose state hash matches
   * an existing cache entry.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled || this.workspaceRoots.length === 0) {
      console.log('[context-layer] Skipping init — disabled or no workspace root')
      return
    }

    const startMs = Date.now()

    // Load path aliases before building the import graph so aliased imports resolve
    await this.loadPathAliases()

    const snapshot = await buildRepoIndexSnapshot(this.workspaceRoots, {
      diagnosticsProvider: buildLspDiagnosticsSummary,
    })

    const changedFiles = new Set<string>()
    for (const root of snapshot.roots) {
      for (const file of root.files) {
        // On first init, nothing is "changed" — we index everything
        // The changedFiles set is only used for recentlyChanged detection
      }
    }

    const modules = detectModules(snapshot.roots, changedFiles, this.config.moduleDepthLimit ?? DEFAULT_MODULE_DEPTH_LIMIT)
    applyImportAnalysis(modules, snapshot.roots)

    // Option C: import graph analysis — cohesion + seed-based refinement
    const allFiles = snapshot.roots.flatMap(r => r.files)
    applyGraphAnalysis(modules, snapshot.roots, allFiles)

    // Compute cohesion metrics for dependency info in module summaries
    const graph = buildResolvedImportGraph(snapshot.roots)
    const cohesionMetrics = computeModuleCohesion(modules, graph)
    const cohesionById = new Map(cohesionMetrics.map(c => [c.moduleId, c]))

    let skipped = 0
    let updated = 0
    const toEnrich: string[] = []

    for (const mod of modules) {
      const hash = computeModuleHash(mod)
      const existing = this.cachedModules.get(mod.id)

      if (existing && existing.stateHash === hash) {
        // Module unchanged — keep cached summary, but re-queue if autoSummarize just turned on
        if (this.config.autoSummarize && !existing.aiEnriched) {
          toEnrich.push(mod.id)
        }
        skipped++
        continue
      }

      // Build or rebuild summary
      const summary = buildSingleModuleSummary(mod, cohesionById.get(mod.id))
      this.cachedModules.set(mod.id, { module: mod, summary, stateHash: hash, aiEnriched: false })
      toEnrich.push(mod.id)
      updated++
    }

    // Remove modules that no longer exist
    const currentIds = new Set(modules.map(m => m.id))
    for (const cachedId of this.cachedModules.keys()) {
      if (!currentIds.has(cachedId)) {
        this.cachedModules.delete(cachedId)
      }
    }

    this.cachedRepoMap = buildRepoMap(snapshot.roots, modules)
    this.lastSnapshotCacheKey = snapshot.cache.key
    this.dirtyModuleIds.clear()
    this.lastInitCompletedAt = Date.now()

    const elapsedMs = Date.now() - startMs
    console.log(
      `[context-layer] Indexed ${modules.length} modules in ${elapsedMs}ms` +
      ` (${updated} updated, ${skipped} unchanged)`
    )
    if (updated > 0 && modules.length < 80) {
      const sorted = modules.slice().sort((a, b) => b.files.length - a.files.length)
      for (const m of sorted) {
        const s = m.boundarySignals
        console.log(`[context-layer]   ${m.id} (${m.files.length} files, ${s.boundaryStrength}${s.hasBarrel ? ', barrel' : ''}, cohesion: ${(m.cohesion * 100).toFixed(0)}%${s.barrelImportCount + s.directImportCount > 0 ? `, imports: ${s.barrelImportCount}barrel/${s.directImportCount}direct` : ''})`)
      }
    }

    await this.loadPersistedSummaries()

    // Fire-and-forget AI enrichment — does not block initPromise or enrichPacket()
    if (this.config.autoSummarize && toEnrich.length > 0) {
      console.log(`[context-layer] Queuing AI enrichment for ${toEnrich.length} module(s)`)
      this.aiEnrichModules(toEnrich).catch(err => {
        console.warn('[context-layer] AI enrichment failed:', err)
      })
    }
  }

  async enrichPacket(packet: ContextPacket, goalKeywords: string[], existingSnapshot?: RepoIndexSnapshot): Promise<{ packet: ContextPacket }> {
    // Ensure initialization is complete
    if (this.initPromise) {
      await this.initPromise
    }

    // If cache is empty (first call or disabled), do a fresh index
    if (this.cachedModules.size === 0) {
      // Use packet's workspace roots if we don't have any
      if (this.workspaceRoots.length === 0) {
        this.workspaceRoots = packet.repoFacts.workspaceRoots
      }
      await this.initialize()
    }

    // Refresh dirty modules if any files changed since last index
    if (this.dirtyModuleIds.size > 0) {
      await this.refreshDirtyModules(packet, existingSnapshot)
    }

    const maxModules = Math.min(this.config.maxModules, 12)
    const moduleSummaries = selectModuleSummariesForGoal(
      this.cachedModules,
      goalKeywords,
      maxModules,
    )

    return {
      packet: {
        ...packet,
        repoMap: this.cachedRepoMap ?? undefined,
        moduleSummaries,
      },
    }
  }

  async onConfigChange(config: ContextLayerConfig): Promise<void> {
    const wasEnabled = this.config.enabled
    const wasAutoSummarize = this.config.autoSummarize
    this.config = config

    if (config.enabled && !wasEnabled) {
      console.log('[context-layer] Enabled — running initial index')
      await this.initialize()
    } else if (!config.enabled) {
      console.log('[context-layer] Disabled — clearing cache')
      this.cachedModules.clear()
      this.cachedRepoMap = null
      this.lastSnapshotCacheKey = null
    } else if (config.autoSummarize && !wasAutoSummarize) {
      // AutoSummarize just turned on — enrich all cached modules that haven't been enriched yet
      const unenriched = Array.from(this.cachedModules.entries())
        .filter(([, v]) => !v.aiEnriched)
        .map(([id]) => id)
      if (unenriched.length > 0) {
        console.log(`[context-layer] AutoSummarize enabled — enriching ${unenriched.length} cached modules`)
        this.aiEnrichModules(unenriched).catch(err => {
          console.warn('[context-layer] AI enrichment on autoSummarize enable failed:', err)
        })
      }
    }
  }

  onSessionStart(): void {
    // Skip re-index if the initial (or a recent) index completed within the cooldown window.
    // This prevents the startup init and the first session_start hook from both running
    // a full index back-to-back with identical results.
    const msSinceLastInit = Date.now() - this.lastInitCompletedAt
    if (this.lastInitCompletedAt > 0 && msSinceLastInit < ContextLayerControllerImpl.INIT_COOLDOWN_MS) {
      console.log(`[context-layer] Skipping session-start re-index — last init was ${(msSinceLastInit / 1000).toFixed(1)}s ago`)
      return
    }

    // Re-index on new session to pick up any missed changes
    this.initPromise = this.initialize().catch((err) => {
      console.warn('[context-layer] Re-index on session start failed:', err)
    })
  }

  onGitCommit(): void {
    // A commit may change many files — mark all modules dirty
    for (const id of this.cachedModules.keys()) {
      this.dirtyModuleIds.add(id)
    }

    // Invalidate context packet cache — git state has changed
    import('../orchestration/contextPacketBuilder').then(({ clearContextPacketCache }) => {
      clearContextPacketCache()
    }).catch((error) => { console.error('[context-layer] Failed to clear context packet cache on git commit:', error) })

    console.log('[context-layer] Git commit detected — all modules marked dirty')
  }

  onFileChange(_type: string, filePath: string): void {
    // Buffer file changes and process after a quiet period to avoid
    // rapid-fire saves each triggering a full module rebuild.
    this.fileChangeBuffer.push(filePath)

    if (this.fileChangeTimer !== null) {
      clearTimeout(this.fileChangeTimer)
    }

    this.fileChangeTimer = setTimeout(() => {
      this.fileChangeTimer = null
      this.processBufferedFileChanges()
    }, ContextLayerControllerImpl.FILE_CHANGE_DEBOUNCE_MS)
  }

  /** Process buffered file changes — mark affected modules dirty. */
  private processBufferedFileChanges(): void {
    const paths = this.fileChangeBuffer.splice(0)
    if (paths.length === 0) return

    // Invalidate caches for changed files
    import('../orchestration/contextPacketBuilder').then(({ clearContextPacketCache }) => {
      clearContextPacketCache()
    }).catch((error) => { console.error('[context-layer] Failed to clear context packet cache on file change:', error) })
    import('../orchestration/contextSelectionSupport').then(({ invalidateSnapshotCache }) => {
      invalidateSnapshotCache(paths)
    }).catch((error) => { console.error('[context-layer] Failed to invalidate snapshot cache on file change:', error) })

    const normalizedPaths = new Set(paths.map(normalizePath))
    for (const [id, cached] of this.cachedModules) {
      if (cached.module.files.some(f => normalizedPaths.has(normalizePath(f.path)))) {
        this.dirtyModuleIds.add(id)
      }
    }

    if (this.dirtyModuleIds.size > 0) {
      console.log(`[context-layer] ${paths.length} file change(s) debounced — ${this.dirtyModuleIds.size} module(s) marked dirty`)
    }
  }

  /** Call Haiku to generate a natural-language summary for one module. Returns null on any failure. */
  private async aiSummarizeModule(
    mod: DetectedModule,
    existing: ModuleContextSummary,
  ): Promise<ModuleContextSummary | null> {
    if (this.aiFailureCount >= ContextLayerControllerImpl.MAX_AI_FAILURES) {
      return null
    }
    try {
      const { createAnthropicClient } = await import('../orchestration/providers/anthropicAuth')
      const client = await createAnthropicClient()

      const repFiles = selectRepresentativeFiles(mod)
      const snippets: string[] = []
      for (const f of repFiles) {
        try {
          const content = await readFile(f.path, 'utf-8')
          snippets.push(`// ${path.basename(f.relativePath)}\n${content.slice(0, 1500)}`)
        } catch {
          // skip unreadable files
        }
      }

      const topExports = mod.exports.slice(0, 8).join(', ')
      const prompt = [
        `Analyze this TypeScript module from a developer IDE codebase.`,
        `Module path: ${mod.id} (${mod.files.length} files)`,
        `Key exports: ${topExports || 'none'}`,
        ``,
        snippets.join('\n\n---\n\n').slice(0, 3000),
        ``,
        `Respond with ONLY a JSON object (no markdown):`,
        `{"description":"<1-2 sentence natural language description>","responsibilities":["<up to 5 specific tasks>"],"gotchas":["<0-2 non-obvious caveats, empty array if none>"]}`,
      ].join('\n')

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : null
      if (!text) return null

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      if (typeof parsed.description !== 'string') return null

      this.aiFailureCount = 0
      return {
        ...existing,
        description: parsed.description,
        keyResponsibilities: Array.isArray(parsed.responsibilities)
          ? (parsed.responsibilities as string[]).slice(0, 5)
          : existing.keyResponsibilities,
        gotchas: Array.isArray(parsed.gotchas)
          ? (parsed.gotchas as string[]).slice(0, 2)
          : existing.gotchas,
      }
    } catch (err) {
      this.aiFailureCount++
      if (this.aiFailureCount >= ContextLayerControllerImpl.MAX_AI_FAILURES) {
        console.warn('[context-layer] AI enrichment disabled after', this.aiFailureCount, 'consecutive failures')
      } else {
        console.warn(`[context-layer] AI summarize failed for ${mod.id}:`, err)
      }
      return null
    }
  }

  private async loadPersistedSummaries(): Promise<void> {
    if (this.workspaceRoots.length === 0) return
    const cachePath = path.join(this.workspaceRoots[0], '.ouroboros', 'module-summaries.json')
    try {
      const raw = await readFile(cachePath, 'utf-8')
      const entries = JSON.parse(raw) as Array<{ id: string; summary: ModuleContextSummary; stateHash: string }>
      for (const entry of entries) {
        const existing = this.cachedModules.get(entry.id)
        if (existing && existing.stateHash === entry.stateHash && !existing.aiEnriched) {
          this.cachedModules.set(entry.id, { ...existing, summary: entry.summary, aiEnriched: true })
        }
      }
    } catch {
      // No cache file or corrupt — start fresh
    }
  }

  private async persistSummaries(): Promise<void> {
    if (this.workspaceRoots.length === 0) return
    const cachePath = path.join(this.workspaceRoots[0], '.ouroboros', 'module-summaries.json')
    const entries = Array.from(this.cachedModules.entries())
      .filter(([, v]) => v.aiEnriched)
      .map(([id, v]) => ({ id, summary: v.summary, stateHash: v.stateHash }))
    try {
      await mkdir(path.dirname(cachePath), { recursive: true })
      await writeFile(cachePath, JSON.stringify(entries, null, 2), 'utf-8')
    } catch {
      // Non-fatal
    }
  }

  /** Enrich a batch of module summaries with AI descriptions. Runs up to 3 in parallel. */
  private async aiEnrichModules(moduleIds: string[]): Promise<void> {
    const CONCURRENCY = 3
    let cursor = 0

    const worker = async (): Promise<void> => {
      while (cursor < moduleIds.length) {
        const id = moduleIds[cursor++]
        const cached = this.cachedModules.get(id)
        if (!cached || cached.aiEnriched) continue

        const enriched = await this.aiSummarizeModule(cached.module, cached.summary)
        if (enriched) {
          this.cachedModules.set(id, { ...cached, summary: enriched, aiEnriched: true })
          console.log(`[context-layer] AI enriched: ${id}`)
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, moduleIds.length) }, worker),
    )

    await this.persistSummaries()
  }

  private async refreshDirtyModules(packet: ContextPacket, existingSnapshot?: RepoIndexSnapshot): Promise<void> {
    if (this.dirtyModuleIds.size === 0) return

    const startMs = Date.now()
    const snapshot = existingSnapshot ?? await buildRepoIndexSnapshot(packet.repoFacts.workspaceRoots, {
      diagnosticsProvider: buildLspDiagnosticsSummary,
    })

    // Skip refresh if repo hasn't actually changed
    if (snapshot.cache.key === this.lastSnapshotCacheKey) {
      this.dirtyModuleIds.clear()
      return
    }

    const changedFiles = new Set<string>()
    for (const file of packet.repoFacts.gitDiff.changedFiles) {
      changedFiles.add(normalizePath(file.filePath))
    }

    const modules = detectModules(snapshot.roots, changedFiles, this.config.moduleDepthLimit ?? DEFAULT_MODULE_DEPTH_LIMIT)
    applyImportAnalysis(modules, snapshot.roots)

    // Only run the expensive full graph analysis when many modules changed.
    // For small incremental edits (< 10% of modules or < 5 absolute), the
    // import topology is essentially unchanged so the graph analysis adds noise
    // but costs ~800ms across the full file set.
    const GRAPH_ANALYSIS_THRESHOLD = Math.max(5, Math.floor(modules.length * 0.1))
    if (this.dirtyModuleIds.size >= GRAPH_ANALYSIS_THRESHOLD) {
      const allFiles = snapshot.roots.flatMap(r => r.files)
      applyGraphAnalysis(modules, snapshot.roots, allFiles)
    }

    // Compute cohesion metrics so refreshed modules retain dependency info
    const graph = buildResolvedImportGraph(snapshot.roots)
    const cohesionMetrics = computeModuleCohesion(modules, graph)
    const cohesionById = new Map(cohesionMetrics.map(c => [c.moduleId, c]))

    let refreshed = 0
    const toEnrich: string[] = []

    for (const mod of modules) {
      if (!this.dirtyModuleIds.has(mod.id)) continue

      const hash = computeModuleHash(mod)
      const existing = this.cachedModules.get(mod.id)

      if (existing && existing.stateHash === hash) {
        // False alarm — module hasn't actually changed
        continue
      }

      const summary = buildSingleModuleSummary(mod, cohesionById.get(mod.id))
      this.cachedModules.set(mod.id, { module: mod, summary, stateHash: hash, aiEnriched: false })
      toEnrich.push(mod.id)
      refreshed++
    }

    // Update repo map with fresh module data
    this.cachedRepoMap = buildRepoMap(snapshot.roots, modules)
    this.lastSnapshotCacheKey = snapshot.cache.key
    this.dirtyModuleIds.clear()

    const elapsedMs = Date.now() - startMs
    console.log(`[context-layer] Refreshed ${refreshed} dirty modules in ${elapsedMs}ms`)

    if (this.config.autoSummarize && toEnrich.length > 0) {
      this.aiEnrichModules(toEnrich).catch(err => {
        console.warn('[context-layer] AI enrichment on refresh failed:', err)
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function initContextLayer(options: InitContextLayerOptions): Promise<void> {
  const impl = new ContextLayerControllerImpl(options.config, options.workspaceRoot)
  controller = impl
  impl.initPromise = impl.initialize()
  await impl.initPromise
}

export function getContextLayerController(): ContextLayerController | null {
  return controller
}
