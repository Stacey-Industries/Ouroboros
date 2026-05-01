/**
 * moduleDetectorMatching.ts — Pure file-to-module matching predicates and
 * import-resolution helpers. Split from moduleDetectorHelpers.ts to stay under
 * the 300-line limit; no behavior change.
 */

import path from 'path';

import type { IndexedRepoFile } from '../orchestration/repoIndexer';
import type { ModuleIdentity } from './contextLayerTypes';
import {
  basenameWithoutExtension,
  isConfigFile,
  kebabToCamel,
  normalizedDirname,
  normalizeSeparators,
} from './moduleDetectorUtils';

// ---------------------------------------------------------------------------
// Pattern matchers (one per ModuleIdentity.pattern)
// ---------------------------------------------------------------------------

function matchesFeatureFolder(mod: ModuleIdentity, fileRelDir: string): boolean {
  const modRoot = normalizeSeparators(mod.rootPath);
  return fileRelDir === modRoot || fileRelDir.startsWith(modRoot + '/');
}

function matchesConfigGroup(file: IndexedRepoFile, fileRelDir: string): boolean {
  const basename = path.basename(file.relativePath);
  return (fileRelDir === '.' || fileRelDir === '') && isConfigFile(basename);
}

function matchesFlatGroup(mod: ModuleIdentity, file: IndexedRepoFile, fileRelDir: string): boolean {
  const modDir = normalizeSeparators(mod.rootPath);
  if (fileRelDir !== modDir && modDir !== '.') return false;
  const fileBase = basenameWithoutExtension(file.relativePath);
  const fileBaseWithoutTest = fileBase.replace(/\.(test|spec)$/, '');
  const prefix = kebabToCamel(mod.id);
  return (
    fileBase.toLowerCase().startsWith(prefix.toLowerCase()) ||
    fileBaseWithoutTest.toLowerCase().startsWith(prefix.toLowerCase())
  );
}

function matchesSingleFile(
  mod: ModuleIdentity,
  file: IndexedRepoFile,
  fileRelDir: string,
): boolean {
  const modDir = normalizeSeparators(path.dirname(mod.rootPath));
  const modBase = basenameWithoutExtension(mod.rootPath);
  const dirMatches =
    fileRelDir === modDir || (modDir === '.' && (fileRelDir === '.' || fileRelDir === ''));
  if (!dirMatches) return false;
  const fileBase = basenameWithoutExtension(file.relativePath);
  const fileBaseWithoutTest = fileBase.replace(/\.(test|spec)$/, '');
  return fileBase === modBase || fileBaseWithoutTest === modBase;
}

function checkPatternMatch(
  mod: ModuleIdentity,
  file: IndexedRepoFile,
  fileRelDir: string,
): boolean {
  if (mod.pattern === 'feature-folder') return matchesFeatureFolder(mod, fileRelDir);
  if (mod.pattern === 'config') return matchesConfigGroup(file, fileRelDir);
  if (mod.pattern === 'flat-group' && mod.id !== 'other')
    return matchesFlatGroup(mod, file, fileRelDir);
  if (mod.pattern === 'single-file') return matchesSingleFile(mod, file, fileRelDir);
  return false;
}

const PATTERN_ORDER: Record<string, number> = {
  'feature-folder': 0,
  config: 1,
  'flat-group': 2,
  'single-file': 3,
};

/**
 * Returns the module id that owns the given file, or null if no module claims
 * it. Searches modules in PATTERN_ORDER so that more specific patterns win
 * over the catch-all "other".
 */
export function findModuleForFile(modules: ModuleIdentity[], file: IndexedRepoFile): string | null {
  const fileRelDir = normalizedDirname(file.relativePath);
  const sorted = [...modules].sort(
    (a, b) => (PATTERN_ORDER[a.pattern] ?? 99) - (PATTERN_ORDER[b.pattern] ?? 99),
  );
  for (const mod of sorted) {
    if (checkPatternMatch(mod, file, fileRelDir)) return mod.id;
  }
  return modules.some((m) => m.id === 'other') ? 'other' : null;
}

// ---------------------------------------------------------------------------
// Import resolution
// ---------------------------------------------------------------------------

/**
 * Maps a resolved relative-path to a module id by looking up the
 * fileToModule index, trying common extensions and index-file variants.
 */
export function resolveImportToModule(
  resolvedRelativePath: string,
  fileToModule: Map<string, string>,
): string | null {
  const normalized = normalizeSeparators(resolvedRelativePath).toLowerCase();
  const exact = fileToModule.get(normalized);
  if (exact) return exact;

  const extensions = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '/index.ts',
    '/index.tsx',
    '/index.js',
    '/index.jsx',
  ];
  for (const ext of extensions) {
    const withExt = fileToModule.get(normalized + ext);
    if (withExt) return withExt;
  }

  return null;
}

/**
 * Resolves an import specifier (`./foo`, `../bar/baz`) against a `fromDir`,
 * returning the normalized relative path with no extension. Used to map an
 * import edge to the file (and thus the module) it points at.
 */
export function resolveRelativePath(fromDir: string, importSpecifier: string): string {
  const normalized = normalizeSeparators(importSpecifier);
  const parts = normalizeSeparators(fromDir).split('/').filter(Boolean);
  const importParts = normalized.split('/');

  for (const segment of importParts) {
    if (segment === '..') {
      parts.pop();
    } else if (segment !== '.') {
      parts.push(segment);
    }
  }

  return parts.join('/');
}
