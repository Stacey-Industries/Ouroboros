import { createHash } from 'crypto'
import path from 'path'
import type { IndexedRepoFile } from '../orchestration/repoIndexer'
import type { ModuleIdentity, ModuleStructuralSummary } from './contextLayerTypes'

const MAX_MODULES = 50
const MIN_FLAT_GROUP_PREFIX_LENGTH = 3
const MIN_FILES_FOR_FOLDER_MODULE = 2
const MIN_FILES_FOR_FLAT_GROUP = 2
const MIN_SIGNIFICANT_FILE_SIZE = 2000 // ~50 lines at ~40 bytes/line
const MAX_DEPTH_BELOW_SRC = 3
const MAX_EXPORTS_PER_MODULE = 20
const AVERAGE_BYTES_PER_LINE = 40

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.rb', '.php',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
  '.cs', '.kt', '.swift', '.vue', '.svelte', '.astro',
])

const CONFIG_FILE_BASENAMES = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.web.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintignore',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.json',
  '.prettierignore',
  '.gitignore',
  '.editorconfig',
  'vite.config.ts',
  'vitest.config.ts',
  'jest.config.ts',
  'jest.config.js',
  'tailwind.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'postcss.config.cjs',
])

const CONFIG_FILE_PREFIXES = [
  'electron.vite.config',
  'tsconfig',
  '.eslintrc',
  '.prettierrc',
  'vite.config',
  'vitest.config',
  'jest.config',
  'tailwind.config',
  'postcss.config',
]

const TEST_FILE_PATTERN = /\.(test|spec)\.[^.]+$/

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectModules(files: IndexedRepoFile[], workspaceRoot: string): ModuleIdentity[] {
  const assigned = new Set<string>()
  const modules: ModuleIdentity[] = []

  // Step 1: Feature-folder detection
  const featureFolderModules = detectFeatureFolders(files, workspaceRoot, assigned)
  modules.push(...featureFolderModules)

  // Step 2: Config/root grouping
  const configModule = detectConfigGroup(files, workspaceRoot, assigned)
  if (configModule) {
    modules.push(configModule)
  }

  // Step 3: Flat-group detection for unassigned files
  const flatGroupModules = detectFlatGroups(files, workspaceRoot, assigned)
  modules.push(...flatGroupModules)

  // Step 4: Single-file modules for remaining significant files
  const singleFileModules = detectSingleFileModules(files, workspaceRoot, assigned)
  modules.push(...singleFileModules)

  // Step 5: Deduplicate IDs
  deduplicateModuleIds(modules)

  // Step 6: Enforce size cap
  enforceModuleCap(modules)

  // Step 7: Sort by module ID
  modules.sort((left, right) => left.id.localeCompare(right.id))

  return modules
}

export function buildModuleStructuralSummaries(options: {
  modules: ModuleIdentity[]
  files: IndexedRepoFile[]
  workspaceRoot: string
  gitDiffFiles?: Set<string>
}): ModuleStructuralSummary[] {
  const { modules, files, workspaceRoot, gitDiffFiles } = options
  const filesByModule = buildFilesByModuleMap(modules, files, workspaceRoot)

  return modules.map((mod) => {
    const moduleFiles = filesByModule.get(mod.id) ?? []
    return buildSummaryForModule(mod, moduleFiles, gitDiffFiles)
  })
}

export function buildCrossModuleDependencies(options: {
  modules: ModuleIdentity[]
  summaries: ModuleStructuralSummary[]
  files: IndexedRepoFile[]
  workspaceRoot: string
}): Array<{ from: string; to: string; weight: number }> {
  const { modules, files, workspaceRoot } = options
  const filesByModule = buildFilesByModuleMap(modules, files, workspaceRoot)
  const fileToModule = buildFileToModuleMap(modules, files, workspaceRoot)

  const edges = new Map<string, { from: string; to: string; weight: number }>()

  for (const mod of modules) {
    const moduleFiles = filesByModule.get(mod.id) ?? []
    for (const file of moduleFiles) {
      for (const importSpecifier of file.imports) {
        if (!importSpecifier.startsWith('.') && !importSpecifier.startsWith('..')) {
          continue
        }
        // Resolve relative import against the file's relative path (platform-neutral)
        const fileRelDir = normalizeSeparators(path.dirname(file.relativePath))
        const resolvedRelative = resolveRelativePath(fileRelDir, importSpecifier)
        const targetModule = resolveImportToModule(resolvedRelative, fileToModule)
        if (!targetModule || targetModule === mod.id) {
          continue
        }
        const edgeKey = `${mod.id}|${targetModule}`
        const existing = edges.get(edgeKey)
        if (existing) {
          existing.weight += 1
        } else {
          edges.set(edgeKey, { from: mod.id, to: targetModule, weight: 1 })
        }
      }
    }
  }

  return Array.from(edges.values()).sort((left, right) =>
    left.from.localeCompare(right.from) || left.to.localeCompare(right.to)
  )
}

// ---------------------------------------------------------------------------
// Feature-folder detection
// ---------------------------------------------------------------------------

function detectFeatureFolders(
  files: IndexedRepoFile[],
  workspaceRoot: string,
  assigned: Set<string>,
): ModuleIdentity[] {
  const dirMap = new Map<string, IndexedRepoFile[]>()
  const allDirs = new Set<string>()

  for (const file of files) {
    const relDir = normalizeSeparators(path.dirname(file.relativePath))
    if (relDir && relDir !== '.') {
      allDirs.add(relDir)
    }
    if (isTestFile(file.relativePath)) {
      continue // test files handled after grouping
    }
    if (!isSourceFile(file.extension)) {
      continue
    }
    if (!relDir || relDir === '.') {
      continue
    }
    const existing = dirMap.get(relDir) ?? []
    existing.push(file)
    dirMap.set(relDir, existing)
  }

  // Build a set of directories that have child directories (container dirs)
  const containerDirs = new Set<string>()
  for (const dir of allDirs) {
    const parent = normalizeSeparators(path.dirname(dir))
    if (parent && parent !== '.') {
      containerDirs.add(parent)
    }
  }

  // Find feature-folder candidates: directories with 2+ source files
  // that are within max depth below src/ and are leaf-like (not container dirs
  // unless they are deep enough to be a feature boundary)
  const candidates: Array<{ dirPath: string; files: IndexedRepoFile[] }> = []
  for (const [dirPath, dirFiles] of dirMap) {
    if (dirFiles.length < MIN_FILES_FOR_FOLDER_MODULE) {
      continue
    }
    if (!isWithinDepthLimit(dirPath)) {
      continue
    }
    // Skip broad container directories (e.g., src/main/, src/renderer/).
    // A feature folder should be at depth 3+ (e.g., src/renderer/components/FileTree)
    // or be a leaf directory (no children) at depth 2+ that isn't a process boundary.
    const segments = dirPath.split('/')
    const isContainerDir = containerDirs.has(dirPath)
    if (isContainerDir) {
      // Container directories are only feature folders if deeply nested
      if (segments.length < 3) {
        continue
      }
    } else {
      // Leaf directories: require depth 2+ unless ALL its files share a common
      // prefix (in which case flat-group detection is more appropriate)
      if (segments.length <= 2 && hasAnyPrefixGroup(dirFiles)) {
        continue
      }
    }
    candidates.push({ dirPath, files: dirFiles })
  }

  // Sort by depth (deepest first) so nested folders are preferred as leaf modules
  candidates.sort((left, right) => {
    const leftDepth = left.dirPath.split('/').length
    const rightDepth = right.dirPath.split('/').length
    return rightDepth - leftDepth
  })

  // Assign files to feature folders, avoiding double-assignment
  // and avoiding creating nested modules when a parent already claims the files
  const modules: ModuleIdentity[] = []
  const claimedDirs = new Set<string>()

  for (const candidate of candidates) {
    // Skip if a child directory already claimed this as a module
    const isNestedUnderClaimed = Array.from(claimedDirs).some(
      (claimed) => candidate.dirPath.startsWith(claimed + '/') || claimed.startsWith(candidate.dirPath + '/')
    )
    if (isNestedUnderClaimed) {
      continue
    }

    // Check that at least some files in this directory are unassigned
    const unassignedFiles = candidate.files.filter((f) => !assigned.has(f.relativePath))
    if (unassignedFiles.length < MIN_FILES_FOR_FOLDER_MODULE) {
      continue
    }

    const dirName = path.basename(candidate.dirPath)
    const moduleId = toKebabCase(dirName)
    const label = toLabel(dirName)

    modules.push({
      id: moduleId,
      label,
      rootPath: candidate.dirPath,
      pattern: 'feature-folder',
    })

    claimedDirs.add(candidate.dirPath)

    // Assign all files in this directory (including test files)
    for (const file of files) {
      const fileRelDir = normalizeSeparators(path.dirname(file.relativePath))
      if (fileRelDir === candidate.dirPath || fileRelDir.startsWith(candidate.dirPath + '/')) {
        assigned.add(file.relativePath)
      }
    }
  }

  return modules
}

// ---------------------------------------------------------------------------
// Config group detection
// ---------------------------------------------------------------------------

function detectConfigGroup(
  files: IndexedRepoFile[],
  _workspaceRoot: string,
  assigned: Set<string>,
): ModuleIdentity | null {
  const configFiles: IndexedRepoFile[] = []

  for (const file of files) {
    if (assigned.has(file.relativePath)) {
      continue
    }
    const basename = path.basename(file.relativePath)
    const relDir = normalizeSeparators(path.dirname(file.relativePath))

    // Root-level files only (no directory or top-level directory)
    if (relDir !== '.' && relDir !== '') {
      continue
    }

    if (isConfigFile(basename)) {
      configFiles.push(file)
    }
  }

  if (configFiles.length === 0) {
    return null
  }

  for (const file of configFiles) {
    assigned.add(file.relativePath)
  }

  return {
    id: 'project-config',
    label: 'Project Config',
    rootPath: '.',
    pattern: 'config',
  }
}

function isConfigFile(basename: string): boolean {
  if (CONFIG_FILE_BASENAMES.has(basename)) {
    return true
  }
  const lowerBasename = basename.toLowerCase()
  for (const prefix of CONFIG_FILE_PREFIXES) {
    if (lowerBasename.startsWith(prefix.toLowerCase())) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Flat-group detection
// ---------------------------------------------------------------------------

function detectFlatGroups(
  files: IndexedRepoFile[],
  _workspaceRoot: string,
  assigned: Set<string>,
): ModuleIdentity[] {
  // Group unassigned source files by their parent directory
  const dirGroups = new Map<string, IndexedRepoFile[]>()

  for (const file of files) {
    if (assigned.has(file.relativePath)) {
      continue
    }
    if (isTestFile(file.relativePath)) {
      continue
    }
    if (!isSourceFile(file.extension)) {
      continue
    }
    const relDir = normalizeSeparators(path.dirname(file.relativePath))
    const existing = dirGroups.get(relDir) ?? []
    existing.push(file)
    dirGroups.set(relDir, existing)
  }

  const modules: ModuleIdentity[] = []

  for (const [dirPath, dirFiles] of dirGroups) {
    if (dirFiles.length < 2) {
      continue
    }

    // Find groups with common basename prefixes
    const prefixGroups = findPrefixGroups(dirFiles)

    for (const [prefix, groupFiles] of prefixGroups) {
      if (groupFiles.length < MIN_FILES_FOR_FLAT_GROUP) {
        continue
      }

      const moduleId = toKebabCase(prefix)
      const label = toLabel(prefix)

      modules.push({
        id: moduleId,
        label,
        rootPath: dirPath === '.' || dirPath === '' ? '.' : dirPath,
        pattern: 'flat-group',
      })

      // Assign all files in the group (including their test files)
      const groupBasenames = new Set(groupFiles.map((f) => basenameWithoutExtension(f.relativePath)))
      for (const file of files) {
        if (assigned.has(file.relativePath)) {
          continue
        }
        const fileRelDir = normalizeSeparators(path.dirname(file.relativePath))
        if (fileRelDir !== dirPath) {
          continue
        }
        const fileBase = basenameWithoutExtension(file.relativePath)
        const fileBaseWithoutTest = fileBase.replace(/\.(test|spec)$/, '')
        if (groupBasenames.has(fileBase) || groupBasenames.has(fileBaseWithoutTest)) {
          assigned.add(file.relativePath)
        }
      }
    }
  }

  return modules
}

function findPrefixGroups(files: IndexedRepoFile[]): Map<string, IndexedRepoFile[]> {
  const basenames = files.map((f) => ({
    file: f,
    base: basenameWithoutExtension(f.relativePath),
  }))

  // Sort by basename for efficient prefix detection
  basenames.sort((left, right) => left.base.localeCompare(right.base))

  const groups = new Map<string, IndexedRepoFile[]>()

  for (let i = 0; i < basenames.length; i++) {
    const current = basenames[i]
    let bestPrefix = ''

    for (let j = 0; j < basenames.length; j++) {
      if (i === j) {
        continue
      }
      const other = basenames[j]
      const prefix = longestCommonPrefix(current.base, other.base)
      if (prefix.length >= MIN_FLAT_GROUP_PREFIX_LENGTH && prefix.length > bestPrefix.length) {
        bestPrefix = prefix
      }
    }

    if (bestPrefix.length >= MIN_FLAT_GROUP_PREFIX_LENGTH) {
      // Normalize prefix: strip trailing non-alphabetic characters
      const normalizedPrefix = bestPrefix.replace(/[^a-zA-Z]+$/, '')
      if (normalizedPrefix.length >= MIN_FLAT_GROUP_PREFIX_LENGTH) {
        const existing = groups.get(normalizedPrefix) ?? []
        if (!existing.includes(current.file)) {
          existing.push(current.file)
        }
        groups.set(normalizedPrefix, existing)
      }
    }
  }

  // Merge overlapping groups: if group A is a prefix of group B, merge into A
  const sortedKeys = Array.from(groups.keys()).sort((left, right) => left.length - right.length)
  const merged = new Map<string, IndexedRepoFile[]>()
  const consumed = new Set<string>()

  for (const key of sortedKeys) {
    if (consumed.has(key)) {
      continue
    }
    const files = groups.get(key) ?? []

    // Absorb longer prefixes that start with this key
    for (const otherKey of sortedKeys) {
      if (otherKey === key || consumed.has(otherKey)) {
        continue
      }
      if (otherKey.startsWith(key)) {
        const otherFiles = groups.get(otherKey) ?? []
        for (const f of otherFiles) {
          if (!files.includes(f)) {
            files.push(f)
          }
        }
        consumed.add(otherKey)
      }
    }

    if (files.length >= MIN_FILES_FOR_FLAT_GROUP) {
      merged.set(key, files)
    }
  }

  return merged
}

function longestCommonPrefix(a: string, b: string): string {
  const maxLen = Math.min(a.length, b.length)
  let i = 0
  while (i < maxLen && a[i] === b[i]) {
    i++
  }
  return a.slice(0, i)
}

function hasAnyPrefixGroup(files: IndexedRepoFile[]): boolean {
  if (files.length < 2) {
    return false
  }
  const basenames = files.map((f) => basenameWithoutExtension(f.relativePath))
  for (let i = 0; i < basenames.length; i++) {
    for (let j = i + 1; j < basenames.length; j++) {
      const prefix = longestCommonPrefix(basenames[i], basenames[j])
      if (prefix.length >= MIN_FLAT_GROUP_PREFIX_LENGTH) {
        return true
      }
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Single-file module detection
// ---------------------------------------------------------------------------

function detectSingleFileModules(
  files: IndexedRepoFile[],
  _workspaceRoot: string,
  assigned: Set<string>,
): ModuleIdentity[] {
  const modules: ModuleIdentity[] = []

  for (const file of files) {
    if (assigned.has(file.relativePath)) {
      continue
    }
    if (isTestFile(file.relativePath)) {
      continue
    }
    if (file.extension === '.d.ts') {
      continue
    }
    if (!isSourceFile(file.extension)) {
      continue
    }
    if (file.size < MIN_SIGNIFICANT_FILE_SIZE) {
      continue
    }

    const basename = basenameWithoutExtension(file.relativePath)
    const moduleId = toKebabCase(basename)
    const label = toLabel(basename)
    const relDir = normalizeSeparators(path.dirname(file.relativePath))

    modules.push({
      id: moduleId,
      label,
      rootPath: relDir === '.' || relDir === '' ? file.relativePath : relDir,
      pattern: 'single-file',
    })

    assigned.add(file.relativePath)

    // Also assign the corresponding test file if present
    for (const otherFile of files) {
      if (assigned.has(otherFile.relativePath)) {
        continue
      }
      const otherBase = basenameWithoutExtension(otherFile.relativePath)
      const otherBaseWithoutTest = otherBase.replace(/\.(test|spec)$/, '')
      const otherDir = normalizeSeparators(path.dirname(otherFile.relativePath))
      if (otherDir === relDir && otherBaseWithoutTest === basename) {
        assigned.add(otherFile.relativePath)
      }
    }
  }

  return modules
}

// ---------------------------------------------------------------------------
// ID deduplication
// ---------------------------------------------------------------------------

function deduplicateModuleIds(modules: ModuleIdentity[]): void {
  const idCounts = new Map<string, number>()
  for (const mod of modules) {
    idCounts.set(mod.id, (idCounts.get(mod.id) ?? 0) + 1)
  }

  for (const [id, count] of idCounts) {
    if (count <= 1) {
      continue
    }
    const duplicates = modules.filter((m) => m.id === id)
    for (const mod of duplicates) {
      const parentDir = getParentDirName(mod.rootPath)
      if (parentDir) {
        mod.id = `${toKebabCase(parentDir)}-${mod.id}`
        mod.label = `${toLabel(parentDir)} ${mod.label}`
      }
    }

    // If still duplicated after parent prefix, append numeric suffix
    const updatedIds = new Map<string, number>()
    for (const mod of modules) {
      const existingCount = updatedIds.get(mod.id) ?? 0
      if (existingCount > 0) {
        mod.id = `${mod.id}-${existingCount + 1}`
      }
      updatedIds.set(mod.id, existingCount + 1)
    }
  }
}

function getParentDirName(rootPath: string): string | null {
  const parts = normalizeSeparators(rootPath).split('/')
  if (parts.length < 2) {
    return null
  }
  return parts[parts.length - 2] || null
}

// ---------------------------------------------------------------------------
// Module cap enforcement
// ---------------------------------------------------------------------------

function enforceModuleCap(modules: ModuleIdentity[]): void {
  if (modules.length <= MAX_MODULES) {
    return
  }

  // The 'other' module will hold the overflow
  // Keep the largest modules, merge the rest into 'other'
  // We need file counts to determine "smallest" — use rootPath as a rough proxy
  // (feature folders tend to be more significant than single files)
  const priorityOrder: Record<string, number> = {
    'feature-folder': 3,
    'config': 2,
    'flat-group': 1,
    'single-file': 0,
  }

  modules.sort((left, right) => {
    const leftPriority = priorityOrder[left.pattern] ?? 0
    const rightPriority = priorityOrder[right.pattern] ?? 0
    return rightPriority - leftPriority || left.id.localeCompare(right.id)
  })

  // Keep top MAX_MODULES - 1 and merge the rest into 'other'
  const keep = modules.slice(0, MAX_MODULES - 1)
  const hasOther = keep.some((m) => m.id === 'other')

  modules.length = 0
  modules.push(...keep)

  if (!hasOther) {
    modules.push({
      id: 'other',
      label: 'Other',
      rootPath: '.',
      pattern: 'flat-group',
    })
  }
}

// ---------------------------------------------------------------------------
// Structural summary building
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
    if (file.language !== 'unknown') {
      seen.add(file.language)
    }
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
  // Prefer entry point files, but fall back to all files if no entry points
  const filesToScan = entryPoints.length > 0 ? entryPoints : files
  const exports = new Set<string>()

  for (const file of filesToScan) {
    if (!isSourceFile(file.extension)) {
      continue
    }
    // We only have the import specifiers from repoIndexer, not file content.
    // Export extraction requires reading file content, which we approximate
    // from the import data. For a proper implementation, we would need file content.
    // For now, collect what we can from import specifiers (re-exports).
    for (const importSpec of file.imports) {
      if (importSpec.startsWith('.')) {
        // Relative import — this file re-exports from local modules
        const basename = path.basename(importSpec).replace(/\.[^.]+$/, '')
        if (basename && basename !== 'index') {
          exports.add(basename)
        }
      }
    }

    if (exports.size >= MAX_EXPORTS_PER_MODULE) {
      break
    }
  }

  return Array.from(exports).sort().slice(0, MAX_EXPORTS_PER_MODULE)
}

function extractExternalImports(files: IndexedRepoFile[]): string[] {
  const externals = new Set<string>()
  for (const file of files) {
    for (const importSpec of file.imports) {
      if (importSpec.startsWith('.') || importSpec.startsWith('..')) {
        continue
      }
      // Extract package name (handle scoped packages like @xterm/xterm)
      const parts = importSpec.split('/')
      const packageName = importSpec.startsWith('@') && parts.length >= 2
        ? `${parts[0]}/${parts[1]}`
        : parts[0]
      externals.add(packageName)
    }
  }
  return Array.from(externals).sort()
}

// ---------------------------------------------------------------------------
// Content hash
// ---------------------------------------------------------------------------

function computeContentHash(files: IndexedRepoFile[]): string {
  const entries = files.map((f) => {
    const normalized = normalizeSeparators(f.relativePath).toLowerCase()
    return `${normalized}|${f.modifiedAt}`
  })
  entries.sort()
  const hash = createHash('sha1')
  for (const entry of entries) {
    hash.update(entry)
  }
  return hash.digest('hex')
}

// ---------------------------------------------------------------------------
// File-to-module mapping
// ---------------------------------------------------------------------------

function buildFilesByModuleMap(
  modules: ModuleIdentity[],
  files: IndexedRepoFile[],
  _workspaceRoot: string,
): Map<string, IndexedRepoFile[]> {
  const result = new Map<string, IndexedRepoFile[]>()
  for (const mod of modules) {
    result.set(mod.id, [])
  }

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
  _workspaceRoot: string,
): Map<string, string> {
  const result = new Map<string, string>()
  for (const file of files) {
    const moduleId = findModuleForFile(modules, file)
    if (moduleId) {
      result.set(normalizeSeparators(file.relativePath).toLowerCase(), moduleId)
      // Also map by absolute path
      result.set(normalizeSeparators(file.path).toLowerCase(), moduleId)
    }
  }
  return result
}

function findModuleForFile(modules: ModuleIdentity[], file: IndexedRepoFile): string | null {
  const fileRelDir = normalizeSeparators(path.dirname(file.relativePath))
  const fileRelPath = normalizeSeparators(file.relativePath)

  // Feature-folder: file is under the module's root path
  for (const mod of modules) {
    if (mod.pattern === 'feature-folder') {
      const modRoot = normalizeSeparators(mod.rootPath)
      if (fileRelDir === modRoot || fileRelDir.startsWith(modRoot + '/')) {
        return mod.id
      }
    }
  }

  // Config: root-level config files
  for (const mod of modules) {
    if (mod.pattern === 'config') {
      const basename = path.basename(file.relativePath)
      if ((fileRelDir === '.' || fileRelDir === '') && isConfigFile(basename)) {
        return mod.id
      }
    }
  }

  // Flat-group: file has matching prefix in same directory
  for (const mod of modules) {
    if (mod.pattern === 'flat-group' && mod.id !== 'other') {
      const modDir = normalizeSeparators(mod.rootPath)
      if (fileRelDir !== modDir && modDir !== '.') {
        continue
      }
      const fileBase = basenameWithoutExtension(file.relativePath)
      const fileBaseWithoutTest = fileBase.replace(/\.(test|spec)$/, '')
      // The module ID is a kebab-case version of the prefix.
      // We need to check if the file's basename (camelCase or PascalCase)
      // starts with the original prefix.
      const prefix = kebabToCamel(mod.id)
      if (fileBase.toLowerCase().startsWith(prefix.toLowerCase()) ||
          fileBaseWithoutTest.toLowerCase().startsWith(prefix.toLowerCase())) {
        return mod.id
      }
    }
  }

  // Single-file: exact match on relative path directory and basename prefix
  for (const mod of modules) {
    if (mod.pattern === 'single-file') {
      const modDir = normalizeSeparators(path.dirname(mod.rootPath))
      const modBase = basenameWithoutExtension(mod.rootPath)
      if (fileRelDir === modDir || (modDir === '.' && (fileRelDir === '.' || fileRelDir === ''))) {
        const fileBase = basenameWithoutExtension(file.relativePath)
        const fileBaseWithoutTest = fileBase.replace(/\.(test|spec)$/, '')
        if (fileBase === modBase || fileBaseWithoutTest === modBase) {
          return mod.id
        }
      }
    }
  }

  // Fallback to 'other' if it exists
  const otherModule = modules.find((m) => m.id === 'other')
  return otherModule ? 'other' : null
}

// ---------------------------------------------------------------------------
// Cross-module import resolution
// ---------------------------------------------------------------------------

function resolveImportToModule(
  resolvedRelativePath: string,
  fileToModule: Map<string, string>,
): string | null {
  const normalized = normalizeSeparators(resolvedRelativePath).toLowerCase()

  // Try exact path
  const exact = fileToModule.get(normalized)
  if (exact) {
    return exact
  }

  // Try common extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']
  for (const ext of extensions) {
    const withExt = fileToModule.get(normalized + ext)
    if (withExt) {
      return withExt
    }
  }

  return null
}

function resolveRelativePath(fromDir: string, importSpecifier: string): string {
  // Resolve a relative import specifier against a directory path using pure
  // string manipulation (platform-neutral, no drive letter issues)
  const normalized = normalizeSeparators(importSpecifier)
  const parts = normalizeSeparators(fromDir).split('/').filter(Boolean)
  const importParts = normalized.split('/')

  for (const segment of importParts) {
    if (segment === '..') {
      parts.pop()
    } else if (segment !== '.') {
      parts.push(segment)
    }
  }

  return parts.join('/')
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function toLabel(str: string): string {
  // Convert camelCase/PascalCase/kebab-case to title case
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

function normalizeSeparators(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

function basenameWithoutExtension(relativePath: string): string {
  const basename = path.basename(relativePath)
  // Handle .d.ts specially
  if (basename.endsWith('.d.ts')) {
    return basename.slice(0, -5)
  }
  const dotIndex = basename.lastIndexOf('.')
  return dotIndex > 0 ? basename.slice(0, dotIndex) : basename
}

function isSourceFile(extension: string): boolean {
  return SOURCE_EXTENSIONS.has(extension)
}

function isTestFile(relativePath: string): boolean {
  return TEST_FILE_PATTERN.test(relativePath)
}

function isWithinDepthLimit(relDir: string): boolean {
  const parts = relDir.split('/')
  // Find the 'src' segment and count depth below it
  const srcIndex = parts.indexOf('src')
  if (srcIndex === -1) {
    // No 'src' folder — allow up to MAX_DEPTH_BELOW_SRC levels total
    return parts.length <= MAX_DEPTH_BELOW_SRC
  }
  const depthBelowSrc = parts.length - srcIndex - 1
  return depthBelowSrc <= MAX_DEPTH_BELOW_SRC
}
