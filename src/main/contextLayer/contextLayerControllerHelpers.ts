/**
 * contextLayerControllerHelpers.ts — Low-level helpers for module detection.
 * Contains directory tree building, module creation, and utility functions.
 */

import { createHash } from 'crypto';
import path from 'path';

import type { IndexedRepoFile } from '../orchestration/repoIndexer';
import { getStrategyForExtension } from './languageStrategies';

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
