/**
 * moduleDetectorSingleFile.ts — Single-file module detection extracted from
 * moduleDetector.ts (Lane B fix wave 2026-05-16, hang investigation).
 *
 * Extraction reason: adding sub-phase trace logging pushed the parent file
 * over the 300-line ESLint cap. Single-file detection is a self-contained
 * unit (one detector + its companion-test helper).
 */

import type { IndexedRepoFile } from '../orchestration/repoIndexer';
import type { ModuleIdentity } from './contextLayerTypes';
import type { DirIndex } from './moduleDetectorUtils';
import {
  basenameWithoutExtension,
  isSourceFile,
  isTestFile,
  MIN_SIGNIFICANT_FILE_SIZE,
  normalizedDirname,
  toKebabCase,
  toLabel,
} from './moduleDetectorUtils';

function assignCompanionTestFile(
  dirFiles: IndexedRepoFile[],
  basename: string,
  assigned: Set<string>,
): void {
  for (const f of dirFiles) {
    if (assigned.has(f.relativePath)) continue;
    const base = basenameWithoutExtension(f.relativePath).replace(/\.(test|spec)$/, '');
    if (base === basename) assigned.add(f.relativePath);
  }
}

export function detectSingleFileModules(
  files: IndexedRepoFile[],
  _workspaceRoot: string,
  assigned: Set<string>,
  dirIndex: DirIndex,
): ModuleIdentity[] {
  const modules: ModuleIdentity[] = [];

  for (const file of files) {
    if (assigned.has(file.relativePath) || isTestFile(file.relativePath)) continue;
    if (file.extension === '.d.ts' || !isSourceFile(file.extension)) continue;
    if (file.size < MIN_SIGNIFICANT_FILE_SIZE) continue;

    const basename = basenameWithoutExtension(file.relativePath);
    const relDir = normalizedDirname(file.relativePath);
    modules.push({
      id: toKebabCase(basename),
      label: toLabel(basename),
      rootPath: relDir === '.' || relDir === '' ? file.relativePath : relDir,
      pattern: 'single-file',
    });
    assigned.add(file.relativePath);

    const dirFiles = dirIndex.allByDir.get(relDir) ?? [];
    assignCompanionTestFile(dirFiles, basename, assigned);
  }

  return modules;
}
