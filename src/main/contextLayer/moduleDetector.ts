/**
 * moduleDetector.ts — Module detection pipeline.
 *
 * Structural summary and cross-module dependency logic live in moduleDetectorHelpers.ts.
 * Pure utility functions live in moduleDetectorUtils.ts.
 */

import path from 'path'

import type { IndexedRepoFile } from '../orchestration/repoIndexer'
import type { ModuleIdentity } from './contextLayerTypes'
import {
  buildCrossModuleDependencies,
  buildModuleStructuralSummaries,
} from './moduleDetectorHelpers'
import {
  basenameWithoutExtension,
  deduplicateModuleIds,
  enforceModuleCap,
  hasAnyPrefixGroup,
  isConfigFile,
  isSourceFile,
  isTestFile,
  isWithinDepthLimit,
  longestCommonPrefix,
  MIN_FILES_FOR_FLAT_GROUP,
  MIN_FILES_FOR_FOLDER_MODULE,
  MIN_FLAT_GROUP_PREFIX_LENGTH,
  MIN_SIGNIFICANT_FILE_SIZE,
  normalizeSeparators,
  toKebabCase,
  toLabel,
} from './moduleDetectorUtils'

export { buildCrossModuleDependencies, buildModuleStructuralSummaries }

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectModules(files: IndexedRepoFile[], workspaceRoot: string): ModuleIdentity[] {
  const assigned = new Set<string>()
  const modules: ModuleIdentity[] = []

  modules.push(...detectFeatureFolders(files, workspaceRoot, assigned))

  const configModule = detectConfigGroup(files, workspaceRoot, assigned)
  if (configModule) modules.push(configModule)

  modules.push(...detectFlatGroups(files, workspaceRoot, assigned))
  modules.push(...detectSingleFileModules(files, workspaceRoot, assigned))

  deduplicateModuleIds(modules)
  enforceModuleCap(modules)
  modules.sort((left, right) => left.id.localeCompare(right.id))

  return modules
}

// ---------------------------------------------------------------------------
// Feature-folder detection
// ---------------------------------------------------------------------------

function buildDirMap(files: IndexedRepoFile[]): { dirMap: Map<string, IndexedRepoFile[]>; allDirs: Set<string> } {
  const dirMap = new Map<string, IndexedRepoFile[]>()
  const allDirs = new Set<string>()

  for (const file of files) {
    const relDir = normalizeSeparators(path.dirname(file.relativePath))
    if (relDir && relDir !== '.') allDirs.add(relDir)
    if (isTestFile(file.relativePath) || !isSourceFile(file.extension) || !relDir || relDir === '.') continue
    const existing = dirMap.get(relDir) ?? []
    existing.push(file)
    dirMap.set(relDir, existing)
  }

  return { dirMap, allDirs }
}

function buildContainerDirs(allDirs: Set<string>): Set<string> {
  const containerDirs = new Set<string>()
  for (const dir of allDirs) {
    const parent = normalizeSeparators(path.dirname(dir))
    if (parent && parent !== '.') containerDirs.add(parent)
  }
  return containerDirs
}

function isCandidateDir(dirPath: string, dirFiles: IndexedRepoFile[], containerDirs: Set<string>): boolean {
  if (dirFiles.length < MIN_FILES_FOR_FOLDER_MODULE) return false
  if (!isWithinDepthLimit(dirPath)) return false
  const segments = dirPath.split('/')
  const isContainerDir = containerDirs.has(dirPath)
  if (isContainerDir) return segments.length >= 3
  return !(segments.length <= 2 && hasAnyPrefixGroup(dirFiles))
}

interface FeatureFolderClaimCtx {
  candidate: { dirPath: string; files: IndexedRepoFile[] }
  files: IndexedRepoFile[]
  assigned: Set<string>
  claimedDirs: Set<string>
  modules: ModuleIdentity[]
}

function claimFeatureFolder(ctx: FeatureFolderClaimCtx): void {
  const { candidate, files, assigned, claimedDirs, modules } = ctx
  const unassignedFiles = candidate.files.filter((f) => !assigned.has(f.relativePath))
  if (unassignedFiles.length < MIN_FILES_FOR_FOLDER_MODULE) return

  const dirName = path.basename(candidate.dirPath)
  modules.push({ id: toKebabCase(dirName), label: toLabel(dirName), rootPath: candidate.dirPath, pattern: 'feature-folder' })
  claimedDirs.add(candidate.dirPath)

  for (const file of files) {
    const fileRelDir = normalizeSeparators(path.dirname(file.relativePath))
    if (fileRelDir === candidate.dirPath || fileRelDir.startsWith(candidate.dirPath + '/')) {
      assigned.add(file.relativePath)
    }
  }
}

function detectFeatureFolders(files: IndexedRepoFile[], _workspaceRoot: string, assigned: Set<string>): ModuleIdentity[] {
  const { dirMap, allDirs } = buildDirMap(files)
  const containerDirs = buildContainerDirs(allDirs)

  const candidates = [...dirMap.entries()]
    .filter(([dirPath, dirFiles]) => isCandidateDir(dirPath, dirFiles, containerDirs))
    .map(([dirPath, dirFiles]) => ({ dirPath, files: dirFiles }))
    .sort((left, right) => right.dirPath.split('/').length - left.dirPath.split('/').length)

  const modules: ModuleIdentity[] = []
  const claimedDirs = new Set<string>()

  for (const candidate of candidates) {
    const isNested = Array.from(claimedDirs).some(
      (claimed) => candidate.dirPath.startsWith(claimed + '/') || claimed.startsWith(candidate.dirPath + '/')
    )
    if (!isNested) claimFeatureFolder({ candidate, files, assigned, claimedDirs, modules })
  }

  return modules
}

// ---------------------------------------------------------------------------
// Config group detection
// ---------------------------------------------------------------------------

function detectConfigGroup(files: IndexedRepoFile[], _workspaceRoot: string, assigned: Set<string>): ModuleIdentity | null {
  const configFiles: IndexedRepoFile[] = []

  for (const file of files) {
    if (assigned.has(file.relativePath)) continue
    const basename = path.basename(file.relativePath)
    const relDir = normalizeSeparators(path.dirname(file.relativePath))
    if (relDir !== '.' && relDir !== '') continue
    if (isConfigFile(basename)) configFiles.push(file)
  }

  if (configFiles.length === 0) return null
  for (const file of configFiles) assigned.add(file.relativePath)
  return { id: 'project-config', label: 'Project Config', rootPath: '.', pattern: 'config' }
}

// ---------------------------------------------------------------------------
// Flat-group detection
// ---------------------------------------------------------------------------

function assignFlatGroupFiles(
  groupFiles: IndexedRepoFile[],
  dirPath: string,
  files: IndexedRepoFile[],
  assigned: Set<string>,
): void {
  const groupBasenames = new Set(groupFiles.map((f) => basenameWithoutExtension(f.relativePath)))
  for (const file of files) {
    if (assigned.has(file.relativePath)) continue
    if (normalizeSeparators(path.dirname(file.relativePath)) !== dirPath) continue
    const fileBase = basenameWithoutExtension(file.relativePath)
    const fileBaseWithoutTest = fileBase.replace(/\.(test|spec)$/, '')
    if (groupBasenames.has(fileBase) || groupBasenames.has(fileBaseWithoutTest)) {
      assigned.add(file.relativePath)
    }
  }
}

function groupUnassignedByDir(files: IndexedRepoFile[], assigned: Set<string>): Map<string, IndexedRepoFile[]> {
  const dirGroups = new Map<string, IndexedRepoFile[]>()
  for (const file of files) {
    if (assigned.has(file.relativePath) || isTestFile(file.relativePath) || !isSourceFile(file.extension)) continue
    const relDir = normalizeSeparators(path.dirname(file.relativePath))
    const existing = dirGroups.get(relDir) ?? []
    existing.push(file)
    dirGroups.set(relDir, existing)
  }
  return dirGroups
}

interface PrefixGroupCtx {
  prefix: string
  groupFiles: IndexedRepoFile[]
  dirPath: string
  files: IndexedRepoFile[]
  assigned: Set<string>
  modules: ModuleIdentity[]
}

function processPrefixGroup(ctx: PrefixGroupCtx): void {
  const { prefix, groupFiles, dirPath, files, assigned, modules } = ctx
  if (groupFiles.length < MIN_FILES_FOR_FLAT_GROUP) return
  modules.push({ id: toKebabCase(prefix), label: toLabel(prefix), rootPath: dirPath === '.' || dirPath === '' ? '.' : dirPath, pattern: 'flat-group' })
  assignFlatGroupFiles(groupFiles, dirPath, files, assigned)
}

function detectFlatGroups(files: IndexedRepoFile[], _workspaceRoot: string, assigned: Set<string>): ModuleIdentity[] {
  const dirGroups = groupUnassignedByDir(files, assigned)
  const modules: ModuleIdentity[] = []

  for (const [dirPath, dirFiles] of dirGroups) {
    if (dirFiles.length < 2) continue
    for (const [prefix, groupFiles] of findPrefixGroups(dirFiles)) {
      processPrefixGroup({ prefix, groupFiles, dirPath, files, assigned, modules })
    }
  }

  return modules
}

interface AbsorbCtx {
  key: string
  sortedKeys: string[]
  groups: Map<string, IndexedRepoFile[]>
  files: IndexedRepoFile[]
  consumed: Set<string>
}

function absorbChildGroup(ctx: AbsorbCtx): void {
  const { key, sortedKeys, groups, files, consumed } = ctx
  for (const otherKey of sortedKeys) {
    if (otherKey === key || consumed.has(otherKey) || !otherKey.startsWith(key)) continue
    const otherFiles = groups.get(otherKey) ?? []
    for (const f of otherFiles) { if (!files.includes(f)) files.push(f) }
    consumed.add(otherKey)
  }
}

function mergePrefixGroups(groups: Map<string, IndexedRepoFile[]>): Map<string, IndexedRepoFile[]> {
  const sortedKeys = Array.from(groups.keys()).sort((l, r) => l.length - r.length)
  const merged = new Map<string, IndexedRepoFile[]>()
  const consumed = new Set<string>()

  for (const key of sortedKeys) {
    if (consumed.has(key)) continue
    const files = groups.get(key) ?? []
    absorbChildGroup({ key, sortedKeys, groups, files, consumed })
    if (files.length >= MIN_FILES_FOR_FLAT_GROUP) merged.set(key, files)
  }

  return merged
}

function addToGroup(groups: Map<string, IndexedRepoFile[]>, normalizedPrefix: string, file: IndexedRepoFile): void {
  const existing = groups.get(normalizedPrefix) ?? []
  if (!existing.includes(file)) existing.push(file)
  groups.set(normalizedPrefix, existing)
}

function findBestPrefix(base: string, basenames: Array<{ base: string }>): string {
  let bestPrefix = ''
  for (const other of basenames) {
    if (other.base === base) continue
    const prefix = longestCommonPrefix(base, other.base)
    if (prefix.length >= MIN_FLAT_GROUP_PREFIX_LENGTH && prefix.length > bestPrefix.length) bestPrefix = prefix
  }
  return bestPrefix
}

function findPrefixGroups(files: IndexedRepoFile[]): Map<string, IndexedRepoFile[]> {
  const basenames = files.map((f) => ({ file: f, base: basenameWithoutExtension(f.relativePath) }))
  basenames.sort((l, r) => l.base.localeCompare(r.base))

  const groups = new Map<string, IndexedRepoFile[]>()

  for (const current of basenames) {
    const bestPrefix = findBestPrefix(current.base, basenames)
    if (bestPrefix.length >= MIN_FLAT_GROUP_PREFIX_LENGTH) {
      const normalizedPrefix = bestPrefix.replace(/[^a-zA-Z]+$/, '')
      if (normalizedPrefix.length >= MIN_FLAT_GROUP_PREFIX_LENGTH) {
        addToGroup(groups, normalizedPrefix, current.file)
      }
    }
  }

  return mergePrefixGroups(groups)
}

// ---------------------------------------------------------------------------
// Single-file module detection
// ---------------------------------------------------------------------------

function assignCompanionTestFile(files: IndexedRepoFile[], basename: string, relDir: string, assigned: Set<string>): void {
  for (const otherFile of files) {
    if (assigned.has(otherFile.relativePath)) continue
    const otherBase = basenameWithoutExtension(otherFile.relativePath)
    const otherBaseWithoutTest = otherBase.replace(/\.(test|spec)$/, '')
    const otherDir = normalizeSeparators(path.dirname(otherFile.relativePath))
    if (otherDir === relDir && otherBaseWithoutTest === basename) assigned.add(otherFile.relativePath)
  }
}

function detectSingleFileModules(files: IndexedRepoFile[], _workspaceRoot: string, assigned: Set<string>): ModuleIdentity[] {
  const modules: ModuleIdentity[] = []

  for (const file of files) {
    if (assigned.has(file.relativePath) || isTestFile(file.relativePath)) continue
    if (file.extension === '.d.ts' || !isSourceFile(file.extension)) continue
    if (file.size < MIN_SIGNIFICANT_FILE_SIZE) continue

    const basename = basenameWithoutExtension(file.relativePath)
    const relDir = normalizeSeparators(path.dirname(file.relativePath))
    modules.push({ id: toKebabCase(basename), label: toLabel(basename), rootPath: relDir === '.' || relDir === '' ? file.relativePath : relDir, pattern: 'single-file' })
    assigned.add(file.relativePath)
    assignCompanionTestFile(files, basename, relDir, assigned)
  }

  return modules
}


