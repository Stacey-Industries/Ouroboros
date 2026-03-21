import { execFile } from 'child_process'
import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { getStrategyForLanguage, getAllImportableExtensions } from '../contextLayer/languageStrategies'
import { readTextSafe } from '../ipc-handlers/contextDetectors'
import { scanProject } from '../ipc-handlers/contextScanner'
import type { DiagnosticsFileSummary, DiagnosticsSummary, GitDiffFileSummary, GitDiffHunk, GitDiffSummary, RecentCommit, RecentEditsSummary, RepoFacts, WorkspaceRootFact } from './types'

const DEFAULT_MAX_RECENT_FILES = 20
const DEFAULT_IMPORT_BYTES = 64 * 1024
const GIT_STATUS_TIMEOUT_MS = 10_000
const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.claude',
  '.context',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.vite',
  '.parcel-cache',
  'target',
])
const IGNORED_FILE_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
])
const IMPORTABLE_EXTENSIONS = getAllImportableExtensions()
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.d.ts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.ps1': 'powershell',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.sql': 'sql',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  '.prisma': 'prisma',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'proto',
}
const LANGUAGE_BY_BASENAME: Record<string, string> = {
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
}

export interface IndexedRepoFileDiagnostics {
  errors: number
  warnings: number
  infos: number
  hints: number
  total: number
}

export interface IndexedRepoFile {
  rootPath: string
  path: string
  relativePath: string
  extension: string
  language: string
  size: number
  modifiedAt: number
  imports: string[]
  diagnostics?: IndexedRepoFileDiagnostics
}

export interface IndexedRepoDirectory {
  rootPath: string
  path: string
  relativePath: string
  modifiedAt: number
}

export interface RootRepoIndexSnapshot {
  rootPath: string
  stateKey: string
  indexedAt: number
  workspaceFact: WorkspaceRootFact
  gitDiff: GitDiffSummary
  diagnostics: DiagnosticsSummary
  recentCommits: RecentCommit[]
  files: IndexedRepoFile[]
  directories: IndexedRepoDirectory[]
}

export interface RepoIndexCacheRootEntry {
  rootPath: string
  key: string
  hit: boolean
}

export interface RepoIndexCacheMetadata {
  key: string
  hit: boolean
  roots: RepoIndexCacheRootEntry[]
}

export interface RepoIndexSnapshot {
  indexedAt: number
  repoFacts: RepoFacts
  roots: RootRepoIndexSnapshot[]
  cache: RepoIndexCacheMetadata
}

export interface RepoIndexerOptions {
  maxRecentFiles?: number
  maxImportBytes?: number
  workspaceStateKey?: string
  rootStateKeys?: Record<string, string>
  now?: number
  /** Optional provider for LSP diagnostics. Omit in worker threads (no Electron). */
  diagnosticsProvider?: (rootPath: string, indexedAt: number) => DiagnosticsSummary
}

const rootSnapshotCache = new Map<string, RootRepoIndexSnapshot>()
const workspaceSnapshotCache = new Map<string, RepoIndexSnapshot>()

export function clearRepoIndexCache(): void {
  rootSnapshotCache.clear()
  workspaceSnapshotCache.clear()
}

export async function buildRepoFacts(workspaceRoots: string[], options: RepoIndexerOptions = {}): Promise<RepoFacts> {
  const snapshot = await buildRepoIndexSnapshot(workspaceRoots, options)
  return snapshot.repoFacts
}

export async function buildRepoIndexSnapshot(workspaceRoots: string[], options: RepoIndexerOptions = {}): Promise<RepoIndexSnapshot> {
  const indexedAt = options.now ?? Date.now()
  const normalizedRoots = normalizeWorkspaceRoots(workspaceRoots)
  const workspaceLookupKey = buildWorkspaceLookupKey(normalizedRoots, options.workspaceStateKey)
  if (workspaceLookupKey) {
    const cachedWorkspace = workspaceSnapshotCache.get(workspaceLookupKey)
    if (cachedWorkspace) {
      return {
        ...cachedWorkspace,
        cache: {
          key: cachedWorkspace.cache.key,
          hit: true,
          roots: cachedWorkspace.cache.roots.map((entry) => ({ ...entry, hit: true })),
        },
      }
    }
  }

  const rootSnapshots: RootRepoIndexSnapshot[] = []
  const cacheRoots: RepoIndexCacheRootEntry[] = []

  for (const rootPath of normalizedRoots) {
    const requestedRootKey = options.rootStateKeys?.[rootPath]
    const lookupKey = buildRootLookupKey(rootPath, requestedRootKey)
    const cachedRoot = lookupKey ? rootSnapshotCache.get(lookupKey) : undefined
    if (cachedRoot) {
      rootSnapshots.push(cachedRoot)
      cacheRoots.push({ rootPath, key: cachedRoot.stateKey, hit: true })
      continue
    }

    const snapshot = await indexWorkspaceRoot(rootPath, {
      indexedAt,
      maxImportBytes: options.maxImportBytes ?? DEFAULT_IMPORT_BYTES,
      maxRecentFiles: options.maxRecentFiles ?? DEFAULT_MAX_RECENT_FILES,
      diagnosticsProvider: options.diagnosticsProvider,
    })
    rootSnapshots.push(snapshot)
    cacheRoots.push({ rootPath, key: snapshot.stateKey, hit: false })
    rootSnapshotCache.set(buildRootLookupKey(rootPath, snapshot.stateKey), snapshot)
  }

  const repoFacts = aggregateRepoFacts(normalizedRoots, rootSnapshots, indexedAt, options.maxRecentFiles ?? DEFAULT_MAX_RECENT_FILES)
  const cacheKey = createWorkspaceStateKey(rootSnapshots)
  const snapshot: RepoIndexSnapshot = {
    indexedAt,
    repoFacts,
    roots: rootSnapshots,
    cache: {
      key: cacheKey,
      hit: false,
      roots: cacheRoots,
    },
  }

  workspaceSnapshotCache.set(buildRootLookupKey(normalizedRoots.join('|'), cacheKey), snapshot)
  return snapshot
}

async function indexWorkspaceRoot(rootPath: string, options: {
  indexedAt: number
  maxImportBytes: number
  maxRecentFiles: number
  diagnosticsProvider?: (rootPath: string, indexedAt: number) => DiagnosticsSummary
}): Promise<RootRepoIndexSnapshot> {
  const [projectContext, scanResult, gitDiff, recentCommits] = await Promise.all([
    scanProject(rootPath),
    scanWorkspaceTree(rootPath, options.maxImportBytes),
    buildGitDiffSummary(rootPath, options.indexedAt),
    buildRecentCommits(rootPath),
  ])
  const diagnostics = options.diagnosticsProvider
    ? options.diagnosticsProvider(rootPath, options.indexedAt)
    : emptyDiagnosticsSummary(options.indexedAt)
  const diagnosticsByPath = new Map(diagnostics.files.map((entry) => [normalizePathForCompare(entry.filePath), toIndexedDiagnostics(entry)]))
  const files = scanResult.files.map((file) => {
    const diagnosticSummary = diagnosticsByPath.get(normalizePathForCompare(file.path))
    return diagnosticSummary ? { ...file, diagnostics: diagnosticSummary } : file
  })
  const recentlyEditedFiles = takeRecentFiles(files, options.maxRecentFiles)
  const workspaceFact: WorkspaceRootFact = {
    rootPath,
    fileCount: files.length,
    directoryCount: scanResult.directories.length,
    languages: summarizeLanguages(files),
    entryPoints: Array.from(new Set(projectContext.entryPoints)).sort((left, right) => left.localeCompare(right)),
    recentlyEditedFiles,
    indexedAt: options.indexedAt,
  }
  const stateKey = createRootStateKey({
    rootPath,
    fileCount: workspaceFact.fileCount ?? 0,
    directoryCount: workspaceFact.directoryCount ?? 0,
    files,
    directories: scanResult.directories,
    gitDiff,
    diagnostics,
  })

  return {
    rootPath,
    stateKey,
    indexedAt: options.indexedAt,
    workspaceFact,
    gitDiff,
    diagnostics,
    recentCommits,
    files,
    directories: scanResult.directories,
  }
}

async function scanWorkspaceTree(rootPath: string, maxImportBytes: number): Promise<{ files: IndexedRepoFile[]; directories: IndexedRepoDirectory[] }> {
  const files: IndexedRepoFile[] = []
  const directories: IndexedRepoDirectory[] = []

  async function walk(currentPath: string): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }

    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      if (shouldIgnoreEntry(entry)) {
        continue
      }

      const entryPath = path.join(currentPath, entry.name)
      let stat: import('fs').Stats
      try {
        stat = await fs.stat(entryPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        directories.push({
          rootPath,
          path: entryPath,
          relativePath: toRelativePath(rootPath, entryPath),
          modifiedAt: Math.trunc(stat.mtimeMs),
        })
        await walk(entryPath)
        continue
      }

      if (!stat.isFile()) {
        continue
      }

      files.push({
        rootPath,
        path: entryPath,
        relativePath: toRelativePath(rootPath, entryPath),
        extension: detectExtension(entry.name),
        language: detectLanguage(entryPath),
        size: stat.size,
        modifiedAt: Math.trunc(stat.mtimeMs),
        imports: await extractImports(entryPath, maxImportBytes),
      })
    }
  }

  await walk(rootPath)
  return {
    files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    directories: directories.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
  }
}

function shouldIgnoreEntry(entry: import('fs').Dirent): boolean {
  if (entry.name === '' || entry.name === '.' || entry.name === '..') {
    return true
  }
  if (entry.isDirectory()) {
    return IGNORED_DIRECTORY_NAMES.has(entry.name)
  }
  return IGNORED_FILE_NAMES.has(entry.name)
}

function detectExtension(name: string): string {
  if (name.endsWith('.d.ts')) {
    return '.d.ts'
  }
  return path.extname(name).toLowerCase()
}

function detectLanguage(filePath: string): string {
  const basename = path.basename(filePath)
  const extension = detectExtension(basename)
  return LANGUAGE_BY_BASENAME[basename] ?? LANGUAGE_BY_EXTENSION[extension] ?? 'unknown'
}

async function extractImports(filePath: string, maxImportBytes: number): Promise<string[]> {
  if (!IMPORTABLE_EXTENSIONS.has(detectExtension(filePath))) {
    return []
  }

  const content = await readTextSafe(filePath, maxImportBytes)
  if (!content) {
    return []
  }

  const language = detectLanguage(filePath)
  return Array.from(parseImports(content, language)).sort((left, right) => left.localeCompare(right))
}

function parseImports(content: string, language: string): Set<string> {
  // Try language-specific strategy first
  const strategy = getStrategyForLanguage(language)
  if (strategy) {
    const extracted = strategy.extractImports(content)
    return new Set(extracted)
  }

  // Fallback: original JS/TS patterns for unknown languages
  const imports = new Set<string>()
  const patterns = [
    /(?:import|export)\s+(?:[^'"`]+?\s+from\s+)?['"]([^'"\n]+)['"]/g,
    /require\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    match = pattern.exec(content)
    while (match) {
      if (match[1]) {
        imports.add(match[1])
      }
      match = pattern.exec(content)
    }
  }

  return imports
}

const MAX_HUNKS_PER_FILE = 20

async function parseDiffHunks(rootPath: string): Promise<Map<string, GitDiffHunk[]>> {
  const hunks = new Map<string, GitDiffHunk[]>()

  try {
    const stdout = await execGit(rootPath, [
      'diff', 'HEAD', '--unified=0', '--diff-filter=ACMR',
    ])

    let currentFile: string | null = null

    for (const line of stdout.split(/\r?\n/)) {
      if (line.startsWith('+++ b/')) {
        currentFile = path.resolve(rootPath, line.slice(6))
        if (!hunks.has(currentFile)) hunks.set(currentFile, [])
        continue
      }

      if (line.startsWith('@@') && currentFile) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
        if (match) {
          const startLine = parseInt(match[1], 10)
          const lineCount = match[2] !== undefined ? parseInt(match[2], 10) : 1
          if (lineCount > 0) {
            const fileHunks = hunks.get(currentFile)!
            if (fileHunks.length < MAX_HUNKS_PER_FILE) {
              fileHunks.push({ startLine, lineCount })
            }
          }
        }
      }
    }
  } catch {
    // git diff failed — return empty map, fall back to top-of-file
  }

  return hunks
}

async function buildGitDiffSummary(rootPath: string, generatedAt: number): Promise<GitDiffSummary> {
  const emptySummary = createEmptyGitDiffSummary(generatedAt)
  let statusResponse: Record<string, unknown>
  try {
    statusResponse = await execGitStatus(rootPath)
  } catch {
    return emptySummary
  }

  const statusFiles = readStatusFileMap(statusResponse)
  if (statusResponse.error && Object.keys(statusFiles).length === 0) {
    return emptySummary
  }

  const changedFiles = new Map<string, GitDiffFileSummary>()
  for (const [relativePath, rawStatus] of Object.entries(statusFiles)) {
    const absolutePath = path.resolve(rootPath, relativePath)
    changedFiles.set(normalizePathForCompare(absolutePath), {
      filePath: absolutePath,
      additions: 0,
      deletions: 0,
      status: mapGitStatus(rawStatus),
    })
  }

  const branch = typeof statusResponse.branch === 'string' && statusResponse.branch !== '' ? statusResponse.branch : undefined

  try {
    const diffStdout = await execGit(rootPath, ['diff', '--numstat', '--find-renames', 'HEAD'])
    for (const line of diffStdout.split(/\r?\n/)) {
      if (!line.trim()) {
        continue
      }
      const parsed = parseNumstatLine(rootPath, line)
      if (!parsed) {
        continue
      }
      const lookupKey = normalizePathForCompare(parsed.filePath)
      const existing = changedFiles.get(lookupKey)
      changedFiles.set(lookupKey, existing ? {
        ...existing,
        additions: parsed.additions,
        deletions: parsed.deletions,
        status: existing.status,
      } : parsed)
    }
  } catch {
    return summarizeGitDiff(Array.from(changedFiles.values()), generatedAt, branch)
  }

  const hunksByFile = await parseDiffHunks(rootPath)
  for (const [filePath, fileHunks] of hunksByFile) {
    const key = normalizePathForCompare(filePath)
    const existing = changedFiles.get(key)
    if (existing) {
      changedFiles.set(key, { ...existing, hunks: fileHunks })
    }
  }

  return summarizeGitDiff(Array.from(changedFiles.values()), generatedAt, branch)
}

async function buildRecentCommits(rootPath: string, count = 5): Promise<RecentCommit[]> {
  try {
    const stdout = await execGit(rootPath, [
      'log', `--oneline`, `-${count}`,
      '--format=%H|%s|%aI',
    ])
    return stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [hash, ...rest] = line.split('|')
      const message = rest.slice(0, -1).join('|')
      const authorDate = rest[rest.length - 1]
      return { hash: hash.slice(0, 8), message, authorDate }
    })
  } catch {
    return []
  }
}

function createEmptyGitDiffSummary(generatedAt: number): GitDiffSummary {
  return {
    changedFiles: [],
    totalAdditions: 0,
    totalDeletions: 0,
    changedFileCount: 0,
    generatedAt,
  }
}

function summarizeGitDiff(changedFiles: GitDiffFileSummary[], generatedAt: number, currentBranch?: string): GitDiffSummary {
  const ordered = changedFiles.sort((left, right) => left.filePath.localeCompare(right.filePath))
  return {
    changedFiles: ordered,
    totalAdditions: ordered.reduce((total, file) => total + file.additions, 0),
    totalDeletions: ordered.reduce((total, file) => total + file.deletions, 0),
    changedFileCount: ordered.length,
    comparedAgainst: 'HEAD',
    currentBranch,
    generatedAt,
  }
}

function readStatusFileMap(response: Record<string, unknown>): Record<string, string> {
  const files = response.files
  if (!files || typeof files !== 'object') {
    return {}
  }
  return Object.fromEntries(
    Object.entries(files).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
  )
}

function mapGitStatus(rawStatus: string): GitDiffFileSummary['status'] {
  if (rawStatus.includes('?') || rawStatus.includes('A')) {
    return 'added'
  }
  if (rawStatus.includes('D')) {
    return 'deleted'
  }
  if (rawStatus.includes('R')) {
    return 'renamed'
  }
  if (rawStatus.includes('M')) {
    return 'modified'
  }
  return 'unknown'
}

function parseNumstatLine(rootPath: string, line: string): GitDiffFileSummary | null {
  const parts = line.split('\t')
  if (parts.length < 3) {
    return null
  }
  const filePath = path.resolve(rootPath, normalizeRenamedDiffPath(parts[2]))
  return {
    filePath,
    additions: parts[0] === '-' ? 0 : Number(parts[0]),
    deletions: parts[1] === '-' ? 0 : Number(parts[1]),
    status: 'modified',
  }
}

function normalizeRenamedDiffPath(filePath: string): string {
  const simpleRename = filePath.includes(' => ')
  if (!simpleRename) {
    return filePath
  }
  if (filePath.includes('{') && filePath.includes('}')) {
    return filePath.replace(/\{[^{}]* => ([^{}]*)\}/g, '$1')
  }
  return filePath.slice(filePath.lastIndexOf(' => ') + 4)
}

const MAX_MESSAGES_PER_FILE = 10
const MAX_MESSAGES_TOTAL = 50

const SEVERITY_PRIORITY: Record<string, number> = { error: 0, warning: 1, info: 2, hint: 3 }

function emptyDiagnosticsSummary(generatedAt: number): DiagnosticsSummary {
  return {
    files: [],
    totalErrors: 0,
    totalWarnings: 0,
    totalInfos: 0,
    totalHints: 0,
    generatedAt,
  }
}

function toIndexedDiagnostics(summary: DiagnosticsFileSummary): IndexedRepoFileDiagnostics {
  const total = summary.errors + summary.warnings + summary.infos + summary.hints
  return {
    errors: summary.errors,
    warnings: summary.warnings,
    infos: summary.infos,
    hints: summary.hints,
    total,
  }
}

function takeRecentFiles(files: IndexedRepoFile[], maxRecentFiles: number): string[] {
  return [...files]
    .sort((left, right) => right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path))
    .slice(0, maxRecentFiles)
    .map((file) => file.path)
}

function summarizeLanguages(files: IndexedRepoFile[]): string[] {
  const counts = new Map<string, number>()
  for (const file of files) {
    if (file.language === 'unknown') {
      continue
    }
    counts.set(file.language, (counts.get(file.language) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([language]) => language)
}

function aggregateRepoFacts(workspaceRoots: string[], rootSnapshots: RootRepoIndexSnapshot[], generatedAt: number, maxRecentFiles: number): RepoFacts {
  const gitDiff = aggregateGitDiff(rootSnapshots, generatedAt)
  const diagnostics = aggregateDiagnostics(rootSnapshots, generatedAt)
  const recentEdits = aggregateRecentEdits(rootSnapshots, generatedAt, maxRecentFiles)
  const recentCommits = rootSnapshots.find(s => s.recentCommits.length > 0)?.recentCommits
  return {
    workspaceRoots,
    roots: rootSnapshots.map((snapshot) => snapshot.workspaceFact),
    gitDiff,
    diagnostics,
    recentEdits,
    recentCommits,
  }
}

function aggregateGitDiff(rootSnapshots: RootRepoIndexSnapshot[], generatedAt: number): GitDiffSummary {
  const merged = new Map<string, GitDiffFileSummary>()
  for (const snapshot of rootSnapshots) {
    for (const file of snapshot.gitDiff.changedFiles) {
      merged.set(normalizePathForCompare(file.filePath), file)
    }
  }
  const files = Array.from(merged.values()).sort((left, right) => left.filePath.localeCompare(right.filePath))
  const currentBranch = rootSnapshots.find(s => s.gitDiff.currentBranch)?.gitDiff.currentBranch
  return {
    changedFiles: files,
    totalAdditions: files.reduce((total, file) => total + file.additions, 0),
    totalDeletions: files.reduce((total, file) => total + file.deletions, 0),
    changedFileCount: files.length,
    comparedAgainst: files.length > 0 ? 'HEAD' : undefined,
    currentBranch,
    generatedAt,
  }
}

function aggregateDiagnostics(rootSnapshots: RootRepoIndexSnapshot[], generatedAt: number): DiagnosticsSummary {
  const merged = new Map<string, DiagnosticsFileSummary>()
  for (const snapshot of rootSnapshots) {
    for (const file of snapshot.diagnostics.files) {
      const key = normalizePathForCompare(file.filePath)
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, { ...file, messages: file.messages ? [...file.messages] : undefined })
        continue
      }
      existing.errors += file.errors
      existing.warnings += file.warnings
      existing.infos += file.infos
      existing.hints += file.hints
      if (file.messages && file.messages.length > 0) {
        const combined = [...(existing.messages ?? []), ...file.messages]
        combined.sort(
          (left, right) =>
            (SEVERITY_PRIORITY[left.severity] ?? 3) - (SEVERITY_PRIORITY[right.severity] ?? 3) ||
            left.line - right.line,
        )
        existing.messages = combined.slice(0, MAX_MESSAGES_PER_FILE)
      }
    }
  }
  const files = Array.from(merged.values()).sort((left, right) => left.filePath.localeCompare(right.filePath))

  // After all per-file messages are merged and capped per-file,
  // apply global 50-message cap across all files
  let totalMessages = 0
  for (const file of files) {
    if (!file.messages) continue
    const remaining = MAX_MESSAGES_TOTAL - totalMessages
    if (remaining <= 0) {
      file.messages = []
    } else if (file.messages.length > remaining) {
      file.messages = file.messages.slice(0, remaining)
    }
    totalMessages += file.messages.length
  }

  return {
    files,
    totalErrors: files.reduce((total, file) => total + file.errors, 0),
    totalWarnings: files.reduce((total, file) => total + file.warnings, 0),
    totalInfos: files.reduce((total, file) => total + file.infos, 0),
    totalHints: files.reduce((total, file) => total + file.hints, 0),
    generatedAt,
  }
}

function aggregateRecentEdits(rootSnapshots: RootRepoIndexSnapshot[], generatedAt: number, maxRecentFiles: number): RecentEditsSummary {
  const files = rootSnapshots.flatMap((snapshot) => snapshot.files)
  return {
    files: takeRecentFiles(files, maxRecentFiles),
    generatedAt,
  }
}

function createRootStateKey(input: {
  rootPath: string
  fileCount: number
  directoryCount: number
  files: IndexedRepoFile[]
  directories: IndexedRepoDirectory[]
  gitDiff: GitDiffSummary
  diagnostics: DiagnosticsSummary
}): string {
  const hash = createHash('sha1')
  hash.update(normalizePathForCompare(input.rootPath))
  hash.update(`files:${input.fileCount}|dirs:${input.directoryCount}`)
  for (const file of input.files) {
    hash.update(`${file.relativePath}|${file.modifiedAt}|${file.size}|${file.language}|${file.imports.join(',')}`)
    if (file.diagnostics) {
      hash.update(`|diag:${file.diagnostics.errors},${file.diagnostics.warnings},${file.diagnostics.infos},${file.diagnostics.hints}`)
    }
  }
  for (const directory of input.directories) {
    hash.update(`${directory.relativePath}|${directory.modifiedAt}`)
  }
  for (const changedFile of input.gitDiff.changedFiles) {
    hash.update(`${changedFile.filePath}|${changedFile.status}|${changedFile.additions}|${changedFile.deletions}`)
  }
  for (const diagnostic of input.diagnostics.files) {
    hash.update(`${diagnostic.filePath}|${diagnostic.errors}|${diagnostic.warnings}|${diagnostic.infos}|${diagnostic.hints}`)
  }
  return hash.digest('hex')
}

function createWorkspaceStateKey(rootSnapshots: RootRepoIndexSnapshot[]): string {
  const hash = createHash('sha1')
  for (const snapshot of [...rootSnapshots].sort((left, right) => left.rootPath.localeCompare(right.rootPath))) {
    hash.update(`${normalizePathForCompare(snapshot.rootPath)}|${snapshot.stateKey}`)
  }
  return hash.digest('hex')
}

function buildWorkspaceLookupKey(workspaceRoots: string[], workspaceStateKey?: string): string | null {
  if (!workspaceStateKey) {
    return null
  }
  return buildRootLookupKey(workspaceRoots.join('|'), workspaceStateKey)
}

function buildRootLookupKey(rootPath: string, stateKey: string | undefined): string {
  return `${normalizePathForCompare(rootPath)}::${stateKey ?? ''}`
}

function normalizeWorkspaceRoots(workspaceRoots: string[]): string[] {
  const seen = new Set<string>()
  const roots: string[] = []
  for (const root of workspaceRoots) {
    if (typeof root !== 'string' || root.trim() === '') {
      continue
    }
    const resolved = path.resolve(root)
    const key = normalizePathForCompare(resolved)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    roots.push(resolved)
  }
  return roots
}

function isPathInsideRoot(filePath: string, rootPath: string): boolean {
  const normalizedFile = normalizePathForCompare(path.resolve(filePath))
  const normalizedRoot = normalizePathForCompare(path.resolve(rootPath))
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}/`)
}

function toRelativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).split(path.sep).join('/')
}

function normalizePathForCompare(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function execGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 15_000, maxBuffer: 512 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}

function execGitStatus(cwd: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['status', '--porcelain=v1', '-unormal'],
      { cwd, timeout: GIT_STATUS_TIMEOUT_MS, maxBuffer: 512 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve({ error: error.message, files: {} })
          return
        }

        const files: Record<string, string> = {}
        for (const line of stdout.split(/\r?\n/)) {
          if (!line.trim()) {
            continue
          }
          const status = line.substring(0, 2).trim()
          const filePath = line.substring(3).trim()
          if (filePath) {
            files[filePath] = status
          }
        }

        execFile(
          'git',
          ['branch', '--show-current'],
          { cwd, timeout: 5_000 },
          (branchError, branchOut) => {
            resolve({
              branch: branchError ? 'unknown' : branchOut.trim(),
              files,
              cwd,
            })
          }
        )
      }
    )
  })
}
