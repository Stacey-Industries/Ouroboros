/**
 * contextLayerControllerHelpers.ts — Private method helpers for ContextLayerControllerImpl.
 * Extracted from contextLayerController.ts to stay under the 300-line limit.
 *
 * Also contains low-level helpers shared by contextLayerControllerSupport.ts:
 * buildDirTree, makeModule, isCodeFile, selectRepresentativeFiles,
 * computeModuleHash, normalizePath, DirNode, DetectedModule, CachedModuleData.
 */

import { createHash } from 'crypto'
import path from 'path'

import log from '../logger'
import type { IndexedRepoFile, RepoIndexSnapshot } from '../orchestration/repoIndexer'
import type { ModuleContextSummary } from '../orchestration/types'
import { runContextLayerGC } from './contextLayerGC'
import { readManifest, readModuleEntry, writeManifest, writeModuleEntry } from './contextLayerStore'
import type { ContextLayerConfig, ModuleStructuralSummary, RepoMap } from './contextLayerTypes'
import { type ContextLayerWatcher, createContextLayerWatcher } from './contextLayerWatcher'
import {
  createSummarizationQueue,
  type SummarizationQueue,
  type SummarizationQueueProgress,
} from './summarizationQueue'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ModuleBoundarySignals {
  hasBarrel: boolean
  boundaryStrength: 'strong' | 'moderate' | 'weak'
  barrelImportCount: number
  directImportCount: number
}

export interface DetectedModule {
  id: string
  label: string
  rootPath: string
  files: IndexedRepoFile[]
  exports: string[]
  recentlyChanged: boolean
  boundarySignals: ModuleBoundarySignals
  cohesion: number
}

export interface CachedModuleData {
  module: DetectedModule
  summary: ModuleContextSummary
  stateHash: string
  aiEnriched: boolean
}

export interface DirNode {
  path: string
  name: string
  children: Map<string, DirNode>
  directFiles: IndexedRepoFile[]
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi', '.java', '.kt', '.kts',
  '.go', '.rs', '.c', '.cpp', '.cc', '.cxx',
  '.h', '.hpp', '.hxx', '.rb', '.php', '.cs',
]

export function isCodeFile(extension: string): boolean {
  return CODE_EXTENSIONS.includes(extension)
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

export function collectAllFiles(node: DirNode): IndexedRepoFile[] {
  const files: IndexedRepoFile[] = [...node.directFiles]
  for (const child of node.children.values()) {
    files.push(...collectAllFiles(child))
  }
  return files
}

export function buildExportsFromFiles(files: IndexedRepoFile[]): string[] {
  const exports = new Set<string>()
  for (const file of files) {
    const base = path.basename(file.relativePath, path.extname(file.relativePath))
    if (base && base !== 'index') exports.add(base)
  }
  return Array.from(exports).sort().slice(0, 20)
}

export function buildDirTree(files: IndexedRepoFile[], rootPath: string): DirNode {
  const root: DirNode = { path: rootPath, name: path.basename(rootPath), children: new Map(), directFiles: [] }
  for (const file of files) {
    const relDir = path.dirname(file.relativePath.replace(/\\/g, '/')).replace(/\\/g, '/')
    if (relDir === '.' || relDir === '') {
      root.directFiles.push(file)
      continue
    }
    const parts = relDir.split('/')
    let current = root
    for (const part of parts) {
      if (!current.children.has(part)) {
        current.children.set(part, { path: path.join(rootPath, part), name: part, children: new Map(), directFiles: [] })
      }
      current = current.children.get(part)!
    }
    current.directFiles.push(file)
  }
  return root
}

export function makeModule(node: DirNode, files: IndexedRepoFile[], changedFiles: Set<string>): DetectedModule {
  const recentlyChanged = files.some((f) => changedFiles.has(f.relativePath) || changedFiles.has(f.path))
  const label = node.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return {
    id: node.path,
    label,
    rootPath: node.path,
    files,
    exports: buildExportsFromFiles(files),
    recentlyChanged,
    boundarySignals: { hasBarrel: files.some((f) => path.basename(f.relativePath).startsWith('index.')), boundaryStrength: 'weak', barrelImportCount: 0, directImportCount: 0 },
    cohesion: 0,
  }
}

export function computeModuleHash(mod: DetectedModule): string {
  const entries = mod.files.map((f) => `${normalizePath(f.relativePath)}|${f.size}|${f.modifiedAt}`).sort()
  const hash = createHash('sha1')
  for (const entry of entries) hash.update(entry)
  return hash.digest('hex')
}

export function selectRepresentativeFiles(mod: DetectedModule): IndexedRepoFile[] {
  const codeFiles = mod.files.filter((f) => isCodeFile(f.extension))
  const entryPoints = codeFiles.filter((f) => path.basename(f.relativePath).startsWith('index.'))
  const sorted = [...codeFiles].sort((a, b) => b.size - a.size)
  const selected = new Set<string>()
  const result: IndexedRepoFile[] = []
  for (const f of [...entryPoints, ...sorted]) {
    if (selected.has(f.relativePath)) continue
    selected.add(f.relativePath)
    result.push(f)
    if (result.length >= 5) break
  }
  return result
}

// ---------------------------------------------------------------------------
// GC interval (shared constant)
// ---------------------------------------------------------------------------

export const GC_INTERVAL_MS = 60 * 60 * 1_000

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

export function setupWatcher(
  workspaceRoot: string,
  config: ContextLayerConfig,
  forceRebuild: () => Promise<void>,
): ContextLayerWatcher {
  return createContextLayerWatcher({
    workspaceRoot,
    debounceMs: config.debounceMs,
    onInvalidation: () => {
      forceRebuild().catch((err) => {
        log.warn('[context-layer] Rebuild on invalidation failed:', err)
      })
    },
  })
}

export function setupGcTimer(
  getRepoMap: () => RepoMap | null,
  runGcFn: (repoMap: RepoMap) => Promise<void>,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const repoMap = getRepoMap()
    if (repoMap) {
      runGcFn(repoMap).catch((err) => {
        log.warn('[context-layer] GC timer failed:', err)
      })
    }
  }, GC_INTERVAL_MS)
}

// ---------------------------------------------------------------------------
// GC runner
// ---------------------------------------------------------------------------

export async function runGC(workspaceRoot: string, repoMap: RepoMap, config: ContextLayerConfig): Promise<void> {
  const currentModuleIds = new Set(repoMap.modules.map((e) => e.structural.module.id))
  await runContextLayerGC({
    workspaceRoot,
    currentModuleIds,
    maxModules: config.maxModules,
    maxSizeBytes: config.maxSizeBytes,
    maxStalenessMs: 7 * 24 * 60 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Summarization queue creation — index builders
// ---------------------------------------------------------------------------

interface ModuleFile {
  relativePath: string
  absolutePath: string
  size: number
  language: string
  imports: string[]
}

function buildStructuralIndex(repoMap: RepoMap): Map<string, ModuleStructuralSummary> {
  const index = new Map<string, ModuleStructuralSummary>()
  for (const entry of repoMap.modules) {
    index.set(entry.structural.module.id, entry.structural)
  }
  return index
}

function assignFileToModule(
  file: IndexedRepoFile,
  repoMap: RepoMap,
  index: Map<string, ModuleFile[]>,
): void {
  const normalizedPath = file.relativePath.replace(/\\/g, '/')
  for (const entry of repoMap.modules) {
    const mod = entry.structural.module
    if (normalizedPath.startsWith(mod.rootPath + '/') || normalizedPath === mod.rootPath) {
      const arr = index.get(mod.id) ?? []
      arr.push({ relativePath: file.relativePath, absolutePath: file.path, size: file.size, language: file.language, imports: file.imports })
      index.set(mod.id, arr)
      break
    }
  }
}

function buildFileIndex(
  snapshot: RepoIndexSnapshot | undefined,
  repoMap: RepoMap,
): Map<string, ModuleFile[]> {
  const index = new Map<string, ModuleFile[]>()
  if (!snapshot) return index
  for (const root of snapshot.roots) {
    for (const file of root.files) {
      assignFileToModule(file, repoMap, index)
    }
  }
  return index
}

function buildDependencyIndex(repoMap: RepoMap): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const dep of repoMap.crossModuleDependencies) {
    const arr = index.get(dep.from) ?? []
    arr.push(dep.to)
    index.set(dep.from, arr)
  }
  return index
}

// ---------------------------------------------------------------------------
// Summarization queue creation
// ---------------------------------------------------------------------------

export interface CreateQueueOptions {
  snapshot?: RepoIndexSnapshot
  onProgress?: (progress: SummarizationQueueProgress) => void
}

export function createQueueForRepoMap(
  workspaceRoot: string,
  repoMap: RepoMap,
  options?: CreateQueueOptions,
): SummarizationQueue {
  const structuralIndex = buildStructuralIndex(repoMap)
  const fileIndex = buildFileIndex(options?.snapshot, repoMap)
  const depIndex = buildDependencyIndex(repoMap)
  return createSummarizationQueue({
    workspaceRoot,
    readModuleEntry,
    writeModuleEntry,
    readManifest,
    writeManifest,
    getModuleFiles: (moduleId) => fileIndex.get(moduleId) ?? [],
    getModuleStructural: (moduleId) => structuralIndex.get(moduleId) ?? null,
    projectContext: { languages: repoMap.languages, frameworks: repoMap.frameworks },
    getDependencyContext: (moduleId) => depIndex.get(moduleId) ?? [],
    onProgress: options?.onProgress,
  })
}
