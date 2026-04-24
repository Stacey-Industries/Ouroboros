import fs from 'fs/promises';
import path from 'path';

import { scanProject } from '../ipc-handlers/contextScanner';
import {
  buildRootLookupKey,
  buildWorkspaceLookupKey,
  createRootStateKey,
  createWorkspaceStateKey,
  detectExtension,
  detectLanguage,
  emptyDiagnosticsSummary,
  extractImports,
  normalizePathForCompare,
  normalizeWorkspaceRoots,
  summarizeLanguages,
  takeRecentFiles,
  toIndexedDiagnostics,
  toRelativePath,
} from './repoIndexerHelpers';
import { aggregateRepoFacts, buildGitDiffSummary, buildRecentCommits } from './repoIndexerSupport';
import type {
  DiagnosticsSummary,
  GitDiffSummary,
  RecentCommit,
  RepoFacts,
  WorkspaceRootFact,
} from './types';

const DEFAULT_MAX_RECENT_FILES = 20;
const DEFAULT_IMPORT_BYTES = 64 * 1024;
const IGNORED_DIRECTORY_NAMES = new Set([
  '.git', '.claude', '.context', 'node_modules', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.turbo', '.cache', '.vite', '.parcel-cache', 'target',
]);
const IGNORED_FILE_NAMES = new Set(['.DS_Store', 'Thumbs.db']);

export interface IndexedRepoFileDiagnostics {
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
  total: number;
}

export interface IndexedRepoFile {
  rootPath: string;
  path: string;
  relativePath: string;
  extension: string;
  language: string;
  size: number;
  modifiedAt: number;
  imports: string[];
  diagnostics?: IndexedRepoFileDiagnostics;
}

export interface IndexedRepoDirectory {
  rootPath: string;
  path: string;
  relativePath: string;
  modifiedAt: number;
}

export interface RootRepoIndexSnapshot {
  rootPath: string;
  stateKey: string;
  indexedAt: number;
  workspaceFact: WorkspaceRootFact;
  gitDiff: GitDiffSummary;
  diagnostics: DiagnosticsSummary;
  recentCommits: RecentCommit[];
  files: IndexedRepoFile[];
  directories: IndexedRepoDirectory[];
}

export interface RepoIndexCacheRootEntry {
  rootPath: string;
  key: string;
  hit: boolean;
}
export interface RepoIndexCacheMetadata {
  key: string;
  hit: boolean;
  roots: RepoIndexCacheRootEntry[];
}

export interface RepoIndexSnapshot {
  indexedAt: number;
  repoFacts: RepoFacts;
  roots: RootRepoIndexSnapshot[];
  cache: RepoIndexCacheMetadata;
}

export interface RepoIndexerOptions {
  maxRecentFiles?: number;
  maxImportBytes?: number;
  workspaceStateKey?: string;
  rootStateKeys?: Record<string, string>;
  now?: number;
  diagnosticsProvider?: (rootPath: string, indexedAt: number) => DiagnosticsSummary;
}

const rootSnapshotCache = new Map<string, RootRepoIndexSnapshot>();
const workspaceSnapshotCache = new Map<string, RepoIndexSnapshot>();

export function clearRepoIndexCache(): void {
  rootSnapshotCache.clear();
  workspaceSnapshotCache.clear();
}

export async function buildRepoFacts(
  workspaceRoots: string[],
  options: RepoIndexerOptions = {},
): Promise<RepoFacts> {
  return (await buildRepoIndexSnapshot(workspaceRoots, options)).repoFacts;
}

function checkWorkspaceCache(lookupKey: string | null): RepoIndexSnapshot | null {
  if (!lookupKey) return null;
  const cached = workspaceSnapshotCache.get(lookupKey);
  if (!cached) return null;
  return {
    ...cached,
    cache: {
      key: cached.cache.key,
      hit: true,
      roots: cached.cache.roots.map((e) => ({ ...e, hit: true })),
    },
  };
}

async function resolveRootSnapshot(
  rootPath: string,
  options: RepoIndexerOptions,
  indexedAt: number,
): Promise<{ snapshot: RootRepoIndexSnapshot; hit: boolean }> {
  // eslint-disable-next-line security/detect-object-injection -- rootPath is from internal normalizeWorkspaceRoots, not user-controlled
  const requestedRootKey = options.rootStateKeys ? options.rootStateKeys[rootPath] : undefined;
  const lookupKey = buildRootLookupKey(rootPath, requestedRootKey);
  const cached = lookupKey ? rootSnapshotCache.get(lookupKey) : undefined;
  if (cached) return { snapshot: cached, hit: true };
  const snapshot = await indexWorkspaceRoot(rootPath, {
    indexedAt,
    maxImportBytes: options.maxImportBytes ?? DEFAULT_IMPORT_BYTES,
    maxRecentFiles: options.maxRecentFiles ?? DEFAULT_MAX_RECENT_FILES,
    diagnosticsProvider: options.diagnosticsProvider,
  });
  rootSnapshotCache.set(buildRootLookupKey(rootPath, snapshot.stateKey), snapshot);
  return { snapshot, hit: false };
}

export async function buildRepoIndexSnapshot(
  workspaceRoots: string[],
  options: RepoIndexerOptions = {},
): Promise<RepoIndexSnapshot> {
  const indexedAt = options.now ?? Date.now();
  const normalizedRoots = normalizeWorkspaceRoots(workspaceRoots);
  const workspaceLookupKey = buildWorkspaceLookupKey(normalizedRoots, options.workspaceStateKey);
  const cachedWorkspace = checkWorkspaceCache(workspaceLookupKey);
  if (cachedWorkspace) return cachedWorkspace;

  const rootSnapshots: RootRepoIndexSnapshot[] = [];
  const cacheRoots: RepoIndexCacheRootEntry[] = [];
  for (const rootPath of normalizedRoots) {
    const { snapshot, hit } = await resolveRootSnapshot(rootPath, options, indexedAt);
    rootSnapshots.push(snapshot);
    cacheRoots.push({ rootPath, key: snapshot.stateKey, hit });
  }

  const repoFacts = aggregateRepoFacts(
    normalizedRoots,
    rootSnapshots,
    indexedAt,
    options.maxRecentFiles ?? DEFAULT_MAX_RECENT_FILES,
  );
  const cacheKey = createWorkspaceStateKey(rootSnapshots);
  const snapshot: RepoIndexSnapshot = {
    indexedAt,
    repoFacts,
    roots: rootSnapshots,
    cache: { key: cacheKey, hit: false, roots: cacheRoots },
  };
  workspaceSnapshotCache.set(buildRootLookupKey(normalizedRoots.join('|'), cacheKey), snapshot);
  return snapshot;
}

type IndexWorkspaceRootOptions = { indexedAt: number; maxImportBytes: number; maxRecentFiles: number; diagnosticsProvider?: (rootPath: string, indexedAt: number) => DiagnosticsSummary };

function applyDiagnosticsToFiles(
  files: IndexedRepoFile[],
  diagnostics: DiagnosticsSummary,
): IndexedRepoFile[] {
  const byPath = new Map(diagnostics.files.map((e) => [normalizePathForCompare(e.filePath), toIndexedDiagnostics(e)]));
  return files.map((file) => {
    const d = byPath.get(normalizePathForCompare(file.path));
    return d ? { ...file, diagnostics: d } : file;
  });
}

type BuildWorkspaceFactInput = { rootPath: string; files: IndexedRepoFile[]; directories: IndexedRepoDirectory[]; entryPoints: string[]; maxRecentFiles: number; indexedAt: number };

function buildWorkspaceFact({ rootPath, files, directories, entryPoints, maxRecentFiles, indexedAt }: BuildWorkspaceFactInput): WorkspaceRootFact {
  return {
    rootPath, fileCount: files.length, directoryCount: directories.length,
    languages: summarizeLanguages(files),
    entryPoints: Array.from(new Set(entryPoints)).sort((l, r) => l.localeCompare(r)),
    recentlyEditedFiles: takeRecentFiles(files, maxRecentFiles),
    indexedAt,
  };
}

async function indexWorkspaceRoot(rootPath: string, options: IndexWorkspaceRootOptions): Promise<RootRepoIndexSnapshot> {
  const [projectContext, scanResult, gitDiff, recentCommits] = await Promise.all([
    scanProject(rootPath),
    scanWorkspaceTree(rootPath, options.maxImportBytes),
    buildGitDiffSummary(rootPath, options.indexedAt),
    buildRecentCommits(rootPath),
  ]);
  const diagnostics = options.diagnosticsProvider
    ? options.diagnosticsProvider(rootPath, options.indexedAt)
    : emptyDiagnosticsSummary(options.indexedAt);
  const files = applyDiagnosticsToFiles(scanResult.files, diagnostics);
  const workspaceFact = buildWorkspaceFact({ rootPath, files, directories: scanResult.directories, entryPoints: projectContext.entryPoints, maxRecentFiles: options.maxRecentFiles, indexedAt: options.indexedAt });
  const stateKey = createRootStateKey({ rootPath, fileCount: workspaceFact.fileCount ?? 0, directoryCount: workspaceFact.directoryCount ?? 0, files, directories: scanResult.directories, gitDiff, diagnostics });
  return { rootPath, stateKey, indexedAt: options.indexedAt, workspaceFact, gitDiff, diagnostics, recentCommits, files, directories: scanResult.directories };
}

function shouldIgnoreEntry(entry: import('fs').Dirent): boolean {
  if (entry.name === '' || entry.name === '.' || entry.name === '..') return true;
  return entry.isDirectory()
    ? IGNORED_DIRECTORY_NAMES.has(entry.name)
    : IGNORED_FILE_NAMES.has(entry.name);
}

interface WalkContext {
  rootPath: string;
  maxImportBytes: number;
  files: IndexedRepoFile[];
  directories: IndexedRepoDirectory[];
}

async function walkDirectory(currentPath: string, ctx: WalkContext): Promise<void> {
  let entries: import('fs').Dirent[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- currentPath is from internal workspace tree walk
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (shouldIgnoreEntry(entry)) continue;
    const entryPath = path.join(currentPath, entry.name);
    let stat: import('fs').Stats;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- entryPath is from internal workspace tree walk
      stat = await fs.stat(entryPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      ctx.directories.push({
        rootPath: ctx.rootPath,
        path: entryPath,
        relativePath: toRelativePath(ctx.rootPath, entryPath),
        modifiedAt: Math.trunc(stat.mtimeMs),
      });
      await walkDirectory(entryPath, ctx);
    } else if (stat.isFile()) {
      ctx.files.push({
        rootPath: ctx.rootPath,
        path: entryPath,
        relativePath: toRelativePath(ctx.rootPath, entryPath),
        extension: detectExtension(entry.name),
        language: detectLanguage(entryPath),
        size: stat.size,
        modifiedAt: Math.trunc(stat.mtimeMs),
        imports: await extractImports(entryPath, ctx.maxImportBytes),
      });
    }
  }
}

async function scanWorkspaceTree(
  rootPath: string,
  maxImportBytes: number,
): Promise<{ files: IndexedRepoFile[]; directories: IndexedRepoDirectory[] }> {
  const files: IndexedRepoFile[] = [];
  const directories: IndexedRepoDirectory[] = [];
  await walkDirectory(rootPath, { rootPath, maxImportBytes, files, directories });
  return {
    files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    directories: directories.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    ),
  };
}
