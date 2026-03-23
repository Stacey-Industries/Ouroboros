/**
 * contextLayerControllerHelpers.ts — Low-level helpers for module detection
 * and controller lifecycle extracted from contextLayerController.ts.
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';

import type { IndexedRepoFile } from '../orchestration/repoIndexer';
import {
  aiEnrichModules,
  type AiSummarizerState,
} from './contextLayerAiSummarizer';
import type { ModuleCacheState } from './contextLayerRefresher';
import { configureTypeScriptAliases, getStrategyForExtension } from './languageStrategies';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ModuleBoundarySignals {
  hasBarrel: boolean;
  fileTypeMix: string[];
  barrelImportCount: number;
  directImportCount: number;
  boundaryStrength: 'strong' | 'moderate' | 'weak';
}

export interface DetectedModule {
  id: string;
  label: string;
  rootPath: string;
  files: IndexedRepoFile[];
  exports: string[];
  recentlyChanged: boolean;
  boundarySignals: ModuleBoundarySignals;
  cohesion: number;
}

export interface CachedModuleData {
  module: DetectedModule;
  summary: import('../orchestration/types').ModuleContextSummary;
  stateHash: string;
  aiEnriched?: boolean;
}

export interface DirNode {
  name: string;
  relPath: string;
  absPath: string;
  directFiles: IndexedRepoFile[];
  children: Map<string, DirNode>;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function isCodeFile(ext: string): boolean {
  return [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.py',
    '.pyi',
    '.java',
    '.kt',
    '.kts',
    '.go',
    '.rs',
    '.c',
    '.cpp',
    '.cc',
    '.cxx',
    '.h',
    '.hpp',
    '.hxx',
    '.rb',
    '.php',
    '.cs',
  ].includes(ext);
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

export function computeModuleHash(mod: DetectedModule): string {
  const hash = createHash('sha1');
  for (const file of mod.files) {
    hash.update(`${file.relativePath}|${file.size}|${file.modifiedAt}`);
  }
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Directory tree building
// ---------------------------------------------------------------------------

function insertFileIntoDirTree(file: IndexedRepoFile, root: DirNode, rootPath: string): void {
  const segments = file.relativePath.split('/');
  const dirSegments = segments.slice(0, -1);

  let current = root;
  for (let i = 0; i < dirSegments.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- dirSegments is from splitting a file's relativePath (trusted repo index data, not user input)
    const seg = dirSegments[i];
    let child = current.children.get(seg);
    if (!child) {
      const childRelPath = dirSegments.slice(0, i + 1).join('/');
      child = {
        name: seg,
        relPath: childRelPath,
        absPath: path.join(rootPath, childRelPath),
        directFiles: [],
        children: new Map(),
      };
      current.children.set(seg, child);
    }
    current = child;
  }
  current.directFiles.push(file);
}

export function buildDirTree(files: IndexedRepoFile[], rootPath: string): DirNode {
  const root: DirNode = {
    name: '',
    relPath: '',
    absPath: rootPath,
    directFiles: [],
    children: new Map(),
  };
  for (const file of files) {
    insertFileIntoDirTree(file, root, rootPath);
  }
  return root;
}

export function collectAllFiles(node: DirNode): IndexedRepoFile[] {
  const files = [...node.directFiles];
  for (const child of node.children.values()) {
    files.push(...collectAllFiles(child));
  }
  return files;
}

// ---------------------------------------------------------------------------
// Module creation
// ---------------------------------------------------------------------------

function detectModuleBarrel(files: IndexedRepoFile[]): boolean {
  return files.some((f) => {
    const strategy = getStrategyForExtension(f.extension);
    if (strategy) return strategy.isModuleEntryPoint(f.relativePath);
    const base = path.basename(f.relativePath, f.extension);
    return base === 'index' && isCodeFile(f.extension);
  });
}

export function buildExportsFromFiles(files: IndexedRepoFile[]): string[] {
  return files
    .filter((f) => {
      const base = path.basename(f.relativePath, f.extension);
      return base !== 'index' && isCodeFile(f.extension);
    })
    .map((f) => path.basename(f.relativePath, f.extension));
}

export function makeModule(
  node: DirNode,
  files: IndexedRepoFile[],
  changedFiles: Set<string>,
): DetectedModule {
  const extSet = new Set<string>();
  for (const f of files) {
    if (f.extension) extSet.add(f.extension.replace(/^\./, ''));
  }

  return {
    id: node.relPath.replace(/[\\/]/g, '/') || '.',
    label: node.name || path.basename(node.absPath),
    rootPath: node.absPath,
    files,
    exports: buildExportsFromFiles(files),
    recentlyChanged: files.some((f) => changedFiles.has(normalizePath(f.path))),
    boundarySignals: {
      hasBarrel: detectModuleBarrel(files),
      fileTypeMix: Array.from(extSet).sort(),
      barrelImportCount: 0,
      directImportCount: 0,
      boundaryStrength: 'weak',
    },
    cohesion: 0,
  };
}

/** Select the 1-3 most representative files from a module for AI analysis. */
export function selectRepresentativeFiles(mod: DetectedModule): IndexedRepoFile[] {
  const codeFiles = mod.files.filter((f) => isCodeFile(f.extension));
  const selected: IndexedRepoFile[] = [];

  const barrel = codeFiles.find((f) => {
    return path.basename(f.relativePath, f.extension) === 'index';
  });
  if (barrel) selected.push(barrel);

  const types = codeFiles.find((f) => {
    const base = path.basename(f.relativePath, f.extension).toLowerCase();
    return (base === 'types' || base === 'interfaces') && !selected.includes(f);
  });
  if (types) selected.push(types);

  const remaining = codeFiles.filter((f) => !selected.includes(f));
  remaining.sort((a, b) => b.size - a.size);
  if (remaining[0]) selected.push(remaining[0]);

  return selected.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Controller lifecycle helpers
// ---------------------------------------------------------------------------

export async function loadPathAliases(workspaceRoots: string[]): Promise<void> {
  if (workspaceRoots.length === 0) return;
  const root = workspaceRoots[0];
  const candidates = ['tsconfig.node.json', 'tsconfig.web.json', 'tsconfig.json'];
  const mergedPaths: Record<string, string[]> = {};
  for (const name of candidates) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from known config file names within workspace root
      const raw = await readFile(path.join(root, name), 'utf-8');
      const parsed = JSON.parse(raw) as { compilerOptions?: { paths?: Record<string, string[]> } };
      const paths = parsed?.compilerOptions?.paths;
      if (paths && typeof paths === 'object') Object.assign(mergedPaths, paths);
    } catch {
      // File doesn't exist or isn't valid JSON — skip
    }
  }
  if (Object.keys(mergedPaths).length > 0) configureTypeScriptAliases(mergedPaths);
}

export function logInitResults(
  modules: DetectedModule[],
  cachedModules: Map<string, CachedModuleData>,
  startMs: number,
): void {
  const elapsedMs = Date.now() - startMs;
  const updated = modules.filter((m) => {
    const cached = cachedModules.get(m.id);
    return cached && !cached.aiEnriched;
  }).length;
  const skipped = modules.length - updated;
  console.log(
    `[context-layer] Indexed ${modules.length} modules in ${elapsedMs}ms` +
      ` (${updated} updated, ${skipped} unchanged)`,
  );
  if (updated > 0 && modules.length < 80) logModuleDetails(modules);
}

function logModuleDetails(modules: DetectedModule[]): void {
  const sorted = modules.slice().sort((a, b) => b.files.length - a.files.length);
  for (const m of sorted) {
    const s = m.boundarySignals;
    const importInfo =
      s.barrelImportCount + s.directImportCount > 0
        ? `, imports: ${s.barrelImportCount}barrel/${s.directImportCount}direct`
        : '';
    console.log(
      `[context-layer]   ${m.id} (${m.files.length} files, ${s.boundaryStrength}${s.hasBarrel ? ', barrel' : ''}, cohesion: ${(m.cohesion * 100).toFixed(0)}%${importInfo})`,
    );
  }
}

interface FireEnrichmentOpts {
  modules: DetectedModule[];
  autoSummarize: boolean;
  moduleCache: ModuleCacheState;
  aiState: AiSummarizerState;
  workspaceRoots: string[];
}

export function fireAndForgetEnrichment(opts: FireEnrichmentOpts): void {
  const { modules, autoSummarize, moduleCache, aiState, workspaceRoots } = opts;
  if (!autoSummarize) return;
  const toEnrich = modules
    .filter((m) => {
      const cached = moduleCache.cachedModules.get(m.id);
      return cached && !cached.aiEnriched;
    })
    .map((m) => m.id);
  if (toEnrich.length === 0) return;
  console.log(`[context-layer] Queuing AI enrichment for ${toEnrich.length} module(s)`);
  aiEnrichModules({
    moduleIds: toEnrich,
    cachedModules: moduleCache.cachedModules,
    aiState,
    workspaceRoots,
  }).catch((err: unknown) => {
    console.warn('[context-layer] AI enrichment failed:', err);
  });
}

export function enrichUnenrichedModules(
  moduleCache: ModuleCacheState,
  aiState: AiSummarizerState,
  workspaceRoots: string[],
): void {
  const unenriched = Array.from(moduleCache.cachedModules.entries())
    .filter(([, v]) => !v.aiEnriched)
    .map(([id]) => id);
  if (unenriched.length === 0) return;
  console.log(
    `[context-layer] AutoSummarize enabled — enriching ${unenriched.length} cached modules`,
  );
  aiEnrichModules({
    moduleIds: unenriched,
    cachedModules: moduleCache.cachedModules,
    aiState,
    workspaceRoots,
  }).catch((err: unknown) => {
    console.warn('[context-layer] AI enrichment on autoSummarize enable failed:', err);
  });
}

export function clearModuleCache(moduleCache: ModuleCacheState): void {
  console.log('[context-layer] Disabled — clearing cache');
  moduleCache.cachedModules.clear();
  moduleCache.cachedRepoMap = null;
  moduleCache.lastSnapshotCacheKey = null;
}
