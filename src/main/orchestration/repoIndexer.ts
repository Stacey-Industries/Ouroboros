import fs from 'fs/promises'
import path from 'path'

import { getAllImportableExtensions, getStrategyForLanguage } from '../contextLayer/languageStrategies'
import { readTextSafe } from '../ipc-handlers/contextDetectors'
import { scanProject } from '../ipc-handlers/contextScanner'
import {
  buildRootLookupKey,
  buildWorkspaceLookupKey,
  createRootStateKey,
  createWorkspaceStateKey,
  detectExtension,
  emptyDiagnosticsSummary,
  normalizePathForCompare,
  normalizeWorkspaceRoots,
  summarizeLanguages,
  takeRecentFiles,
  toIndexedDiagnostics,
  toRelativePath,
} from './repoIndexerHelpers'
import {
  aggregateRepoFacts,
  buildGitDiffSummary,
  buildRecentCommits,
} from './repoIndexerSupport'
import type { DiagnosticsSummary, GitDiffSummary, RecentCommit, RepoFacts, WorkspaceRootFact } from './types'

const DEFAULT_MAX_RECENT_FILES = 20
const DEFAULT_IMPORT_BYTES = 64 * 1024
const IGNORED_DIRECTORY_NAMES = new Set([
  '.git', '.claude', '.context', 'node_modules', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.turbo', '.cache', '.vite', '.parcel-cache', 'target',
])
const IGNORED_FILE_NAMES = new Set(['.DS_Store', 'Thumbs.db'])
const IMPORTABLE_EXTENSIONS = getAllImportableExtensions()
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.d.ts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.json': 'json', '.md': 'markdown', '.mdx': 'markdown',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'html', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.ps1': 'powershell',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
  '.rb': 'ruby', '.php': 'php', '.sql': 'sql',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp', '.kt': 'kotlin', '.swift': 'swift',
  '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
  '.prisma': 'prisma', '.graphql': 'graphql', '.gql': 'graphql', '.proto': 'proto',
}
const LANGUAGE_BY_BASENAME: Record<string, string> = { Dockerfile: 'dockerfile', Makefile: 'makefile' }

export interface IndexedRepoFileDiagnostics {
  errors: number; warnings: number; infos: number; hints: number; total: number
}

export interface IndexedRepoFile {
  rootPath: string; path: string; relativePath: string; extension: string
  language: string; size: number; modifiedAt: number; imports: string[]
  diagnostics?: IndexedRepoFileDiagnostics
}

export interface IndexedRepoDirectory {
  rootPath: string; path: string; relativePath: string; modifiedAt: number
}

export interface RootRepoIndexSnapshot {
  rootPath: string; stateKey: string; indexedAt: number; workspaceFact: WorkspaceRootFact
  gitDiff: GitDiffSummary; diagnostics: DiagnosticsSummary; recentCommits: RecentCommit[]
  files: IndexedRepoFile[]; directories: IndexedRepoDirectory[]
}

export interface RepoIndexCacheRootEntry { rootPath: string; key: string; hit: boolean }
export interface RepoIndexCacheMetadata { key: string; hit: boolean; roots: RepoIndexCacheRootEntry[] }

export interface RepoIndexSnapshot {
  indexedAt: number; repoFacts: RepoFacts; roots: RootRepoIndexSnapshot[]; cache: RepoIndexCacheMetadata
}

export interface RepoIndexerOptions {
  maxRecentFiles?: number; maxImportBytes?: number; workspaceStateKey?: string
  rootStateKeys?: Record<string, string>; now?: number
  diagnosticsProvider?: (rootPath: string, indexedAt: number) => DiagnosticsSummary
}

const rootSnapshotCache = new Map<string, RootRepoIndexSnapshot>()
const workspaceSnapshotCache = new Map<string, RepoIndexSnapshot>()

export function clearRepoIndexCache(): void {
  rootSnapshotCache.clear()
  workspaceSnapshotCache.clear()
}

export async function buildRepoFacts(workspaceRoots: string[], options: RepoIndexerOptions = {}): Promise<RepoFacts> {
  return (await buildRepoIndexSnapshot(workspaceRoots, options)).repoFacts
}

function checkWorkspaceCache(lookupKey: string | null): RepoIndexSnapshot | null {
  if (!lookupKey) return null
  const cached = workspaceSnapshotCache.get(lookupKey)
  if (!cached) return null
  return {
    ...cached,
    cache: { key: cached.cache.key, hit: true, roots: cached.cache.roots.map((e) => ({ ...e, hit: true })) },
  }
}

async function resolveRootSnapshot(rootPath: string, options: RepoIndexerOptions, indexedAt: number): Promise<{ snapshot: RootRepoIndexSnapshot; hit: boolean }> {
  // eslint-disable-next-line security/detect-object-injection -- rootPath is from internal normalizeWorkspaceRoots, not user-controlled
  const requestedRootKey = options.rootStateKeys ? options.rootStateKeys[rootPath] : undefined
  const lookupKey = buildRootLookupKey(rootPath, requestedRootKey)
  const cached = lookupKey ? rootSnapshotCache.get(lookupKey) : undefined
  if (cached) return { snapshot: cached, hit: true }
  const snapshot = await indexWorkspaceRoot(rootPath, {
    indexedAt, maxImportBytes: options.maxImportBytes ?? DEFAULT_IMPORT_BYTES,
    maxRecentFiles: options.maxRecentFiles ?? DEFAULT_MAX_RECENT_FILES, diagnosticsProvider: options.diagnosticsProvider,
  })
  rootSnapshotCache.set(buildRootLookupKey(rootPath, snapshot.stateKey), snapshot)
  return { snapshot, hit: false }
}

export async function buildRepoIndexSnapshot(workspaceRoots: string[], options: RepoIndexerOptions = {}): Promise<RepoIndexSnapshot> {
  const indexedAt = options.now ?? Date.now()
  const normalizedRoots = normalizeWorkspaceRoots(workspaceRoots)
  const workspaceLookupKey = buildWorkspaceLookupKey(normalizedRoots, options.workspaceStateKey)
  const cachedWorkspace = checkWorkspaceCache(workspaceLookupKey)
  if (cachedWorkspace) return cachedWorkspace

  const rootSnapshots: RootRepoIndexSnapshot[] = []
  const cacheRoots: RepoIndexCacheRootEntry[] = []
  for (const rootPath of normalizedRoots) {
    const { snapshot, hit } = await resolveRootSnapshot(rootPath, options, indexedAt)
    rootSnapshots.push(snapshot)
    cacheRoots.push({ rootPath, key: snapshot.stateKey, hit })
  }

  const repoFacts = aggregateRepoFacts(normalizedRoots, rootSnapshots, indexedAt, options.maxRecentFiles ?? DEFAULT_MAX_RECENT_FILES)
  const cacheKey = createWorkspaceStateKey(rootSnapshots)
  const snapshot: RepoIndexSnapshot = { indexedAt, repoFacts, roots: rootSnapshots, cache: { key: cacheKey, hit: false, roots: cacheRoots } }
  workspaceSnapshotCache.set(buildRootLookupKey(normalizedRoots.join('|'), cacheKey), snapshot)
  return snapshot
}

async function indexWorkspaceRoot(rootPath: string, options: {
  indexedAt: number; maxImportBytes: number; maxRecentFiles: number
  diagnosticsProvider?: (rootPath: string, indexedAt: number) => DiagnosticsSummary
}): Promise<RootRepoIndexSnapshot> {
  const [projectContext, scanResult, gitDiff, recentCommits] = await Promise.all([
    scanProject(rootPath), scanWorkspaceTree(rootPath, options.maxImportBytes),
    buildGitDiffSummary(rootPath, options.indexedAt), buildRecentCommits(rootPath),
  ])
  const diagnostics = options.diagnosticsProvider ? options.diagnosticsProvider(rootPath, options.indexedAt) : emptyDiagnosticsSummary(options.indexedAt)
  const diagnosticsByPath = new Map(diagnostics.files.map((entry) => [normalizePathForCompare(entry.filePath), toIndexedDiagnostics(entry)]))
  const files = scanResult.files.map((file) => {
    const d = diagnosticsByPath.get(normalizePathForCompare(file.path))
    return d ? { ...file, diagnostics: d } : file
  })
  const workspaceFact: WorkspaceRootFact = {
    rootPath, fileCount: files.length, directoryCount: scanResult.directories.length,
    languages: summarizeLanguages(files),
    entryPoints: Array.from(new Set(projectContext.entryPoints)).sort((l, r) => l.localeCompare(r)),
    recentlyEditedFiles: takeRecentFiles(files, options.maxRecentFiles), indexedAt: options.indexedAt,
  }
  const stateKey = createRootStateKey({
    rootPath, fileCount: workspaceFact.fileCount ?? 0, directoryCount: workspaceFact.directoryCount ?? 0,
    files, directories: scanResult.directories, gitDiff, diagnostics,
  })
  return { rootPath, stateKey, indexedAt: options.indexedAt, workspaceFact, gitDiff, diagnostics, recentCommits, files, directories: scanResult.directories }
}

function shouldIgnoreEntry(entry: import('fs').Dirent): boolean {
  if (entry.name === '' || entry.name === '.' || entry.name === '..') return true
  return entry.isDirectory() ? IGNORED_DIRECTORY_NAMES.has(entry.name) : IGNORED_FILE_NAMES.has(entry.name)
}

function detectLanguage(filePath: string): string {
  const basename = path.basename(filePath)
  // eslint-disable-next-line security/detect-object-injection -- key is a file extension constant, not user-controlled
  return LANGUAGE_BY_BASENAME[basename] ?? LANGUAGE_BY_EXTENSION[detectExtension(basename)] ?? 'unknown'
}

function extractQuotedSpecifier(text: string): string | null {
  const firstSingle = text.indexOf("'")
  const firstDouble = text.indexOf('"')
  const start = firstSingle >= 0 && (firstDouble < 0 || firstSingle < firstDouble) ? firstSingle : firstDouble
  if (start < 0) return null
  const quote = text.charAt(start)
  const end = text.indexOf(quote, start + 1)
  if (end < 0) return null
  return text.slice(start + 1, end)
}

function addQuotedSpecifierFromSegment(segment: string, imports: Set<string>): void {
  const specifier = extractQuotedSpecifier(segment)
  if (specifier) imports.add(specifier)
}

function collectImportsFromLine(trimmed: string, imports: Set<string>): void {
  const lower = trimmed.toLowerCase()

  if (lower.startsWith('import ') || lower.startsWith('export ')) {
    const fromIndex = lower.lastIndexOf(' from ')
    if (fromIndex >= 0) {
      addQuotedSpecifierFromSegment(trimmed.slice(fromIndex + ' from '.length), imports)
    }
  }

  const requireIndex = lower.indexOf('require(')
  if (requireIndex >= 0) {
    addQuotedSpecifierFromSegment(trimmed.slice(requireIndex + 'require('.length), imports)
  }

  const importIndex = lower.indexOf('import(')
  if (importIndex >= 0) {
    addQuotedSpecifierFromSegment(trimmed.slice(importIndex + 'import('.length), imports)
  }
}

async function extractImports(filePath: string, maxImportBytes: number): Promise<string[]> {
  if (!IMPORTABLE_EXTENSIONS.has(detectExtension(filePath))) return []
  const content = await readTextSafe(filePath, maxImportBytes)
  if (!content) return []
  return Array.from(parseImports(content, detectLanguage(filePath))).sort((l, r) => l.localeCompare(r))
}

function parseImports(content: string, language: string): Set<string> {
  const strategy = getStrategyForLanguage(language)
  if (strategy) return new Set(strategy.extractImports(content))
  const imports = new Set<string>()

  for (const line of content.split('\n')) {
    collectImportsFromLine(line.trimStart(), imports)
  }
  return imports
}

interface WalkContext {
  rootPath: string
  maxImportBytes: number
  files: IndexedRepoFile[]
  directories: IndexedRepoDirectory[]
}

async function walkDirectory(currentPath: string, ctx: WalkContext): Promise<void> {
  let entries: import('fs').Dirent[]
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- currentPath is from internal workspace tree walk
    entries = await fs.readdir(currentPath, { withFileTypes: true })
  } catch { return }
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    if (shouldIgnoreEntry(entry)) continue
    const entryPath = path.join(currentPath, entry.name)
    let stat: import('fs').Stats
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- entryPath is from internal workspace tree walk
      stat = await fs.stat(entryPath)
    } catch { continue }
    if (stat.isDirectory()) {
      ctx.directories.push({ rootPath: ctx.rootPath, path: entryPath, relativePath: toRelativePath(ctx.rootPath, entryPath), modifiedAt: Math.trunc(stat.mtimeMs) })
      await walkDirectory(entryPath, ctx)
    } else if (stat.isFile()) {
      ctx.files.push({
        rootPath: ctx.rootPath, path: entryPath, relativePath: toRelativePath(ctx.rootPath, entryPath),
        extension: detectExtension(entry.name), language: detectLanguage(entryPath),
        size: stat.size, modifiedAt: Math.trunc(stat.mtimeMs), imports: await extractImports(entryPath, ctx.maxImportBytes),
      })
    }
  }
}

async function scanWorkspaceTree(rootPath: string, maxImportBytes: number): Promise<{ files: IndexedRepoFile[]; directories: IndexedRepoDirectory[] }> {
  const files: IndexedRepoFile[] = []
  const directories: IndexedRepoDirectory[] = []
  await walkDirectory(rootPath, { rootPath, maxImportBytes, files, directories })
  return {
    files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    directories: directories.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
  }
}
