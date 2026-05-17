/**
 * moduleDetector.ts — Module detection pipeline.
 *
 * Structural summary and cross-module dependency logic live in moduleDetectorHelpers.ts.
 * Pure utility functions live in moduleDetectorUtils.ts.
 */

import path from 'path';

import log from '../logger';
import type { IndexedRepoFile } from '../orchestration/repoIndexer';
import type { ModuleIdentity } from './contextLayerTypes';
import {
  buildCrossModuleDependencies,
  buildModuleStructuralSummaries,
} from './moduleDetectorHelpers';
import { detectSingleFileModules } from './moduleDetectorSingleFile';
import type { DirIndex } from './moduleDetectorUtils';
import {
  basenameWithoutExtension,
  buildDirIndex,
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
  normalizedDirname,
  normalizeSeparators,
  toKebabCase,
  toLabel,
} from './moduleDetectorUtils';

export { buildCrossModuleDependencies, buildModuleStructuralSummaries };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function timed<T>(name: string, fn: () => T, meta?: (v: T) => string): T {
  const t0 = Date.now();
  const v = fn();
  log.info(`[trace:detectModules] phase=${name} ms=${Date.now() - t0}${meta ? ' ' + meta(v) : ''}`);
  return v;
}

export function detectModules(
  rawFiles: IndexedRepoFile[],
  workspaceRoot: string,
): ModuleIdentity[] {
  const tOverall = Date.now();
  const files = rawFiles.map((f) => ({ ...f, relativePath: normalizeSeparators(f.relativePath) }));
  log.info(`[trace:detectModules] start files=${files.length}`);
  const assigned = new Set<string>();
  const modules: ModuleIdentity[] = [];
  const lenMeta = (v: ModuleIdentity[]): string => `added=${v.length}`;

  const dirIndex = buildDirIndex(files);

  modules.push(
    ...timed(
      'featureFolders',
      () => detectFeatureFolders(files, workspaceRoot, assigned, dirIndex),
      lenMeta,
    ),
  );
  const cfg = timed('configGroup', () => detectConfigGroup(files, workspaceRoot, assigned));
  if (cfg) modules.push(cfg);
  modules.push(
    ...timed(
      'flatGroups',
      () => detectFlatGroups(files, workspaceRoot, assigned, dirIndex),
      lenMeta,
    ),
  );
  modules.push(
    ...timed(
      'singleFiles',
      () => detectSingleFileModules(files, workspaceRoot, assigned, dirIndex),
      lenMeta,
    ),
  );

  deduplicateModuleIds(modules);
  enforceModuleCap(modules);
  modules.sort((left, right) => left.id.localeCompare(right.id));
  log.info(`[trace:detectModules] done totalMs=${Date.now() - tOverall} modules=${modules.length}`);
  return modules;
}

// ---------------------------------------------------------------------------
// Feature-folder detection
// ---------------------------------------------------------------------------

function buildContainerDirs(allDirs: Set<string>): Set<string> {
  const parents = [...allDirs]
    .map((d) => normalizeSeparators(path.dirname(d)))
    .filter((p) => p && p !== '.');
  return new Set(parents);
}

function isCandidateDir(
  dirPath: string,
  dirFiles: IndexedRepoFile[],
  containerDirs: Set<string>,
): boolean {
  if (dirFiles.length < MIN_FILES_FOR_FOLDER_MODULE) return false;
  if (!isWithinDepthLimit(dirPath)) return false;
  const segments = dirPath.split('/');
  const isContainerDir = containerDirs.has(dirPath);
  if (isContainerDir) return segments.length >= 3;
  return !(segments.length <= 2 && hasAnyPrefixGroup(dirFiles));
}

interface FeatureFolderClaimCtx {
  candidate: { dirPath: string; files: IndexedRepoFile[] };
  allByDir: Map<string, IndexedRepoFile[]>;
  assigned: Set<string>;
  claimedDirs: Set<string>;
  modules: ModuleIdentity[];
}

function claimFeatureFolder(ctx: FeatureFolderClaimCtx): void {
  const { candidate, allByDir, assigned, claimedDirs, modules } = ctx;
  const unassignedFiles = candidate.files.filter((f) => !assigned.has(f.relativePath));
  if (unassignedFiles.length < MIN_FILES_FOR_FOLDER_MODULE) return;

  const dirName = path.basename(candidate.dirPath);
  modules.push({
    id: toKebabCase(dirName),
    label: toLabel(dirName),
    rootPath: candidate.dirPath,
    pattern: 'feature-folder',
  });
  claimedDirs.add(candidate.dirPath);

  const prefix = candidate.dirPath + '/';
  for (const [dirKey, dirFiles] of allByDir) {
    if (dirKey === candidate.dirPath || dirKey.startsWith(prefix)) {
      for (const file of dirFiles) assigned.add(file.relativePath);
    }
  }
}

function detectFeatureFolders(
  _files: IndexedRepoFile[],
  _workspaceRoot: string,
  assigned: Set<string>,
  dirIndex: DirIndex,
): ModuleIdentity[] {
  const { sourceByDir, allByDir, allDirs } = dirIndex;
  const containerDirs = buildContainerDirs(allDirs);

  const candidates = [...sourceByDir.entries()]
    .filter(([dirPath, dirFiles]) => isCandidateDir(dirPath, dirFiles, containerDirs))
    .map(([dirPath, dirFiles]) => ({ dirPath, files: dirFiles }))
    .sort((left, right) => right.dirPath.split('/').length - left.dirPath.split('/').length);

  const modules: ModuleIdentity[] = [];
  const claimedDirs = new Set<string>();

  for (const candidate of candidates) {
    const dp = candidate.dirPath;
    const isNested = [...claimedDirs].some((c) => dp.startsWith(c + '/') || c.startsWith(dp + '/'));
    if (!isNested) claimFeatureFolder({ candidate, allByDir, assigned, claimedDirs, modules });
  }

  return modules;
}

// ---------------------------------------------------------------------------
// Config group detection
// ---------------------------------------------------------------------------

function detectConfigGroup(
  files: IndexedRepoFile[],
  _workspaceRoot: string,
  assigned: Set<string>,
): ModuleIdentity | null {
  const configFiles: IndexedRepoFile[] = [];

  for (const file of files) {
    if (assigned.has(file.relativePath)) continue;
    const basename = path.basename(file.relativePath);
    const relDir = normalizedDirname(file.relativePath);
    if (relDir !== '.' && relDir !== '') continue;
    if (isConfigFile(basename)) configFiles.push(file);
  }

  if (configFiles.length === 0) return null;
  for (const file of configFiles) assigned.add(file.relativePath);
  return { id: 'project-config', label: 'Project Config', rootPath: '.', pattern: 'config' };
}

// ---------------------------------------------------------------------------
// Flat-group detection
// ---------------------------------------------------------------------------

function assignFlatGroupFiles(
  groupFiles: IndexedRepoFile[],
  dirAllFiles: IndexedRepoFile[],
  assigned: Set<string>,
): void {
  const groupBasenames = new Set(groupFiles.map((f) => basenameWithoutExtension(f.relativePath)));
  for (const file of dirAllFiles) {
    if (assigned.has(file.relativePath)) continue;
    const fileBase = basenameWithoutExtension(file.relativePath);
    if (
      groupBasenames.has(fileBase) ||
      groupBasenames.has(fileBase.replace(/\.(test|spec)$/, ''))
    ) {
      assigned.add(file.relativePath);
    }
  }
}

function groupUnassignedByDir(
  files: IndexedRepoFile[],
  assigned: Set<string>,
): Map<string, IndexedRepoFile[]> {
  const dirGroups = new Map<string, IndexedRepoFile[]>();
  for (const file of files) {
    if (
      assigned.has(file.relativePath) ||
      isTestFile(file.relativePath) ||
      !isSourceFile(file.extension)
    )
      continue;
    const relDir = normalizedDirname(file.relativePath);
    const existing = dirGroups.get(relDir) ?? [];
    existing.push(file);
    dirGroups.set(relDir, existing);
  }
  return dirGroups;
}

interface PrefixGroupCtx {
  prefix: string;
  groupFiles: IndexedRepoFile[];
  dirPath: string;
  dirAllFiles: IndexedRepoFile[];
  assigned: Set<string>;
  modules: ModuleIdentity[];
}

function processPrefixGroup(ctx: PrefixGroupCtx): void {
  const { prefix, groupFiles, dirPath, dirAllFiles, assigned, modules } = ctx;
  if (groupFiles.length < MIN_FILES_FOR_FLAT_GROUP) return;
  modules.push({
    id: toKebabCase(prefix),
    label: toLabel(prefix),
    rootPath: dirPath === '.' || dirPath === '' ? '.' : dirPath,
    pattern: 'flat-group',
  });
  assignFlatGroupFiles(groupFiles, dirAllFiles, assigned);
}

function detectFlatGroups(
  files: IndexedRepoFile[],
  _workspaceRoot: string,
  assigned: Set<string>,
  dirIndex: DirIndex,
): ModuleIdentity[] {
  const dirGroups = groupUnassignedByDir(files, assigned);
  const modules: ModuleIdentity[] = [];

  for (const [dirPath, dirFiles] of dirGroups) {
    if (dirFiles.length < 2) continue;
    const dirAllFiles = dirIndex.allByDir.get(dirPath) ?? dirFiles;
    for (const [prefix, groupFiles] of findPrefixGroups(dirFiles)) {
      processPrefixGroup({ prefix, groupFiles, dirPath, dirAllFiles, assigned, modules });
    }
  }

  return modules;
}

interface AbsorbCtx {
  key: string;
  sortedKeys: string[];
  groups: Map<string, IndexedRepoFile[]>;
  files: IndexedRepoFile[];
  consumed: Set<string>;
}

function absorbChildGroup(ctx: AbsorbCtx): void {
  const { key, sortedKeys, groups, files, consumed } = ctx;
  for (const otherKey of sortedKeys) {
    if (otherKey === key || consumed.has(otherKey) || !otherKey.startsWith(key)) continue;
    const otherFiles = groups.get(otherKey) ?? [];
    for (const f of otherFiles) {
      if (!files.includes(f)) files.push(f);
    }
    consumed.add(otherKey);
  }
}

function mergePrefixGroups(groups: Map<string, IndexedRepoFile[]>): Map<string, IndexedRepoFile[]> {
  const sortedKeys = Array.from(groups.keys()).sort((l, r) => l.length - r.length);
  const merged = new Map<string, IndexedRepoFile[]>();
  const consumed = new Set<string>();

  for (const key of sortedKeys) {
    if (consumed.has(key)) continue;
    const files = groups.get(key) ?? [];
    absorbChildGroup({ key, sortedKeys, groups, files, consumed });
    if (files.length >= MIN_FILES_FOR_FLAT_GROUP) merged.set(key, files);
  }

  return merged;
}

function addToGroup(
  groups: Map<string, IndexedRepoFile[]>,
  normalizedPrefix: string,
  file: IndexedRepoFile,
): void {
  const existing = groups.get(normalizedPrefix) ?? [];
  if (!existing.includes(file)) existing.push(file);
  groups.set(normalizedPrefix, existing);
}

/** Returns the best (longest) prefix a basename shares with its sorted neighbors. */
function bestPrefixFromNeighbors(
  sortedBases: Array<{ file: IndexedRepoFile; base: string }>,
  idx: number,
): string {
  let best = '';
  if (idx > 0) {
    // eslint-disable-next-line security/detect-object-injection -- idx is a bounded numeric index
    const p = longestCommonPrefix(sortedBases[idx].base, sortedBases[idx - 1].base);
    if (p.length > best.length) best = p;
  }
  if (idx < sortedBases.length - 1) {
    // eslint-disable-next-line security/detect-object-injection -- idx is a bounded numeric index
    const p = longestCommonPrefix(sortedBases[idx].base, sortedBases[idx + 1].base);
    if (p.length > best.length) best = p;
  }
  return best;
}

function findPrefixGroups(files: IndexedRepoFile[]): Map<string, IndexedRepoFile[]> {
  const basenames = files.map((f) => ({ file: f, base: basenameWithoutExtension(f.relativePath) }));
  basenames.sort((l, r) => l.base.localeCompare(r.base));

  const groups = new Map<string, IndexedRepoFile[]>();

  for (let i = 0; i < basenames.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric index
    const current = basenames[i];
    const bestPrefix = bestPrefixFromNeighbors(basenames, i);
    if (bestPrefix.length >= MIN_FLAT_GROUP_PREFIX_LENGTH) {
      const normalizedPrefix = bestPrefix.replace(/[^a-zA-Z]+$/, '');
      if (normalizedPrefix.length >= MIN_FLAT_GROUP_PREFIX_LENGTH) {
        addToGroup(groups, normalizedPrefix, current.file);
      }
    }
  }

  return mergePrefixGroups(groups);
}
