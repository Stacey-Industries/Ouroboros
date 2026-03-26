/**
 * moduleDetectorHelpers.ts — Structural summary building and file-to-module mapping.
 * Extracted from moduleDetector.ts to stay under the 300-line limit.
 */

import { createHash } from 'crypto'
import path from 'path'

import type { IndexedRepoFile } from '../orchestration/repoIndexer'
import type { ModuleIdentity, ModuleStructuralSummary } from './contextLayerTypes'
import {
  basenameWithoutExtension,
  isConfigFile,
  isSourceFile,
  kebabToCamel,
  normalizeSeparators,
} from './moduleDetectorUtils'

const MAX_EXPORTS_PER_MODULE = 20
const AVERAGE_BYTES_PER_LINE = 40

// ---------------------------------------------------------------------------
// Public: structural summaries
// ---------------------------------------------------------------------------

export function buildModuleStructuralSummaries(options: {
  modules: ModuleIdentity[]
  files: IndexedRepoFile[]
  workspaceRoot: string
  gitDiffFiles?: Set<string>
}): ModuleStructuralSummary[] {
  const { modules, files, gitDiffFiles } = options
  const filesByModule = buildFilesByModuleMap(modules, files)
  return modules.map((mod) => {
    const moduleFiles = filesByModule.get(mod.id) ?? []
    return buildSummaryForModule(mod, moduleFiles, gitDiffFiles)
  })
}

// ---------------------------------------------------------------------------
// Cross-module edge helpers
// ---------------------------------------------------------------------------

interface FileImportCtx {
  moduleId: string
  relativePath: string
  imports: string[]
  fileToModule: Map<string, string>
  edges: Map<string, { from: string; to: string; weight: number }>
}

function processFileImports(ctx: FileImportCtx): void {
  const { moduleId, relativePath, imports, fileToModule, edges } = ctx
  for (const importSpecifier of imports) {
    if (!importSpecifier.startsWith('.') && !importSpecifier.startsWith('..')) continue
    const fileRelDir = normalizeSeparators(path.dirname(relativePath))
    const resolvedRelative = resolveRelativePath(fileRelDir, importSpecifier)
    const targetModule = resolveImportToModule(resolvedRelative, fileToModule)
    if (!targetModule || targetModule === moduleId) continue
    const edgeKey = `${moduleId}|${targetModule}`
    const existing = edges.get(edgeKey)
    if (existing) { existing.weight += 1 }
    else { edges.set(edgeKey, { from: moduleId, to: targetModule, weight: 1 }) }
  }
}

// ---------------------------------------------------------------------------
// Public: cross-module dependency graph
// ---------------------------------------------------------------------------

export function buildCrossModuleDependencies(options: {
  modules: ModuleIdentity[]
  summaries: ModuleStructuralSummary[]
  files: IndexedRepoFile[]
  workspaceRoot: string
}): Array<{ from: string; to: string; weight: number }> {
  const { modules, files } = options
  const filesByModule = buildFilesByModuleMap(modules, files)
  const fileToModule = buildFileToModuleMap(modules, files)

  const edges = new Map<string, { from: string; to: string; weight: number }>()

  for (const mod of modules) {
    const moduleFiles = filesByModule.get(mod.id) ?? []
    for (const file of moduleFiles) {
      processFileImports({ moduleId: mod.id, relativePath: file.relativePath, imports: file.imports, fileToModule, edges })
    }
  }

  return Array.from(edges.values()).sort((left, right) =>
    left.from.localeCompare(right.from) || left.to.localeCompare(right.to)
  )
}

// ---------------------------------------------------------------------------
// Summary builder helpers
// ---------------------------------------------------------------------------

function buildSummaryForModule(
  mod: ModuleIdentity,
  moduleFiles: IndexedRepoFile[],
  gitDiffFiles?: Set<string>,
): ModuleStructuralSummary {
  const fileCount = moduleFiles.length
  const totalLines = Math.ceil(moduleFiles.reduce((sum, f) => sum + f.size, 0) / AVERAGE_BYTES_PER_LINE)
  const languages = collectUniqueLanguages(moduleFiles)
  const entryPoints = findEntryPoints(moduleFiles)
  const exports = extractModuleExports(moduleFiles, entryPoints)
  const imports = extractExternalImports(moduleFiles)
  const recentlyChanged = gitDiffFiles
    ? moduleFiles.some((f) => gitDiffFiles.has(normalizeSeparators(f.relativePath)) || gitDiffFiles.has(f.path))
    : false
  const lastModified = moduleFiles.reduce((max, f) => Math.max(max, f.modifiedAt), 0)
  const contentHash = computeContentHash(moduleFiles)

  return {
    module: mod,
    fileCount,
    totalLines,
    languages,
    exports,
    imports,
    entryPoints: entryPoints.map((f) => f.relativePath),
    recentlyChanged,
    lastModified,
    contentHash,
  }
}

function collectUniqueLanguages(files: IndexedRepoFile[]): string[] {
  const seen = new Set<string>()
  for (const file of files) {
    if (file.language !== 'unknown') seen.add(file.language)
  }
  return Array.from(seen).sort()
}

function findEntryPoints(files: IndexedRepoFile[]): IndexedRepoFile[] {
  return files.filter((f) => {
    const basename = path.basename(f.relativePath)
    return basename === 'index.ts' || basename === 'index.tsx' || basename === 'index.js' || basename === 'index.jsx'
  })
}

function extractModuleExports(files: IndexedRepoFile[], entryPoints: IndexedRepoFile[]): string[] {
  const filesToScan = entryPoints.length > 0 ? entryPoints : files
  const exports = new Set<string>()

  for (const file of filesToScan) {
    if (!isSourceFile(file.extension)) continue
    for (const importSpec of file.imports) {
      if (!importSpec.startsWith('.')) continue
      const basename = path.basename(importSpec).replace(/\.[^.]+$/, '')
      if (basename && basename !== 'index') exports.add(basename)
    }
    if (exports.size >= MAX_EXPORTS_PER_MODULE) break
  }

  return Array.from(exports).sort().slice(0, MAX_EXPORTS_PER_MODULE)
}

function extractExternalImports(files: IndexedRepoFile[]): string[] {
  const externals = new Set<string>()
  for (const file of files) {
    for (const importSpec of file.imports) {
      if (importSpec.startsWith('.') || importSpec.startsWith('..')) continue
      const parts = importSpec.split('/')
      const packageName = importSpec.startsWith('@') && parts.length >= 2
        ? `${parts[0]}/${parts[1]}`
        : parts[0]
      externals.add(packageName)
    }
  }
  return Array.from(externals).sort()
}

function computeContentHash(files: IndexedRepoFile[]): string {
  const entries = files.map((f) => `${normalizeSeparators(f.relativePath).toLowerCase()}|${f.modifiedAt}`)
  entries.sort()
  const hash = createHash('sha1')
  for (const entry of entries) hash.update(entry)
  return hash.digest('hex')
}

// ---------------------------------------------------------------------------
// File-to-module mapping
// ---------------------------------------------------------------------------

export function buildFilesByModuleMap(
  modules: ModuleIdentity[],
  files: IndexedRepoFile[],
): Map<string, IndexedRepoFile[]> {
  const result = new Map<string, IndexedRepoFile[]>()
  for (const mod of modules) result.set(mod.id, [])

  for (const file of files) {
    const moduleId = findModuleForFile(modules, file)
    if (moduleId) {
      const moduleFiles = result.get(moduleId) ?? []
      moduleFiles.push(file)
      result.set(moduleId, moduleFiles)
    }
  }

  return result
}

function buildFileToModuleMap(
  modules: ModuleIdentity[],
  files: IndexedRepoFile[],
): Map<string, string> {
  const result = new Map<string, string>()
  for (const file of files) {
    const moduleId = findModuleForFile(modules, file)
    if (moduleId) {
      result.set(normalizeSeparators(file.relativePath).toLowerCase(), moduleId)
      result.set(normalizeSeparators(file.path).toLowerCase(), moduleId)
    }
  }
  return result
}

function matchesFeatureFolder(mod: ModuleIdentity, fileRelDir: string): boolean {
  const modRoot = normalizeSeparators(mod.rootPath)
  return fileRelDir === modRoot || fileRelDir.startsWith(modRoot + '/')
}

function matchesConfigGroup(file: IndexedRepoFile, fileRelDir: string): boolean {
  const basename = path.basename(file.relativePath)
  return (fileRelDir === '.' || fileRelDir === '') && isConfigFile(basename)
}

function matchesFlatGroup(mod: ModuleIdentity, file: IndexedRepoFile, fileRelDir: string): boolean {
  const modDir = normalizeSeparators(mod.rootPath)
  if (fileRelDir !== modDir && modDir !== '.') return false
  const fileBase = basenameWithoutExtension(file.relativePath)
  const fileBaseWithoutTest = fileBase.replace(/\.(test|spec)$/, '')
  const prefix = kebabToCamel(mod.id)
  return (
    fileBase.toLowerCase().startsWith(prefix.toLowerCase()) ||
    fileBaseWithoutTest.toLowerCase().startsWith(prefix.toLowerCase())
  )
}

function matchesSingleFile(mod: ModuleIdentity, file: IndexedRepoFile, fileRelDir: string): boolean {
  const modDir = normalizeSeparators(path.dirname(mod.rootPath))
  const modBase = basenameWithoutExtension(mod.rootPath)
  const dirMatches = fileRelDir === modDir || (modDir === '.' && (fileRelDir === '.' || fileRelDir === ''))
  if (!dirMatches) return false
  const fileBase = basenameWithoutExtension(file.relativePath)
  const fileBaseWithoutTest = fileBase.replace(/\.(test|spec)$/, '')
  return fileBase === modBase || fileBaseWithoutTest === modBase
}

function checkPatternMatch(mod: ModuleIdentity, file: IndexedRepoFile, fileRelDir: string): boolean {
  if (mod.pattern === 'feature-folder') return matchesFeatureFolder(mod, fileRelDir)
  if (mod.pattern === 'config') return matchesConfigGroup(file, fileRelDir)
  if (mod.pattern === 'flat-group' && mod.id !== 'other') return matchesFlatGroup(mod, file, fileRelDir)
  if (mod.pattern === 'single-file') return matchesSingleFile(mod, file, fileRelDir)
  return false
}

const PATTERN_ORDER: Record<string, number> = { 'feature-folder': 0, config: 1, 'flat-group': 2, 'single-file': 3 }

function findModuleForFile(modules: ModuleIdentity[], file: IndexedRepoFile): string | null {
  const fileRelDir = normalizeSeparators(path.dirname(file.relativePath))
  const sorted = [...modules].sort((a, b) => {
    const ap = PATTERN_ORDER[a.pattern] ?? 99
    const bp = PATTERN_ORDER[b.pattern] ?? 99
    return ap - bp
  })
  for (const mod of sorted) {
    if (checkPatternMatch(mod, file, fileRelDir)) return mod.id
  }
  return modules.some((m) => m.id === 'other') ? 'other' : null
}

// ---------------------------------------------------------------------------
// Import resolution
// ---------------------------------------------------------------------------

function resolveImportToModule(resolvedRelativePath: string, fileToModule: Map<string, string>): string | null {
  const normalized = normalizeSeparators(resolvedRelativePath).toLowerCase()
  const exact = fileToModule.get(normalized)
  if (exact) return exact

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']
  for (const ext of extensions) {
    const withExt = fileToModule.get(normalized + ext)
    if (withExt) return withExt
  }

  return null
}

function resolveRelativePath(fromDir: string, importSpecifier: string): string {
  const normalized = normalizeSeparators(importSpecifier)
  const parts = normalizeSeparators(fromDir).split('/').filter(Boolean)
  const importParts = normalized.split('/')

  for (const segment of importParts) {
    if (segment === '..') { parts.pop() }
    else if (segment !== '.') { parts.push(segment) }
  }

  return parts.join('/')
}
