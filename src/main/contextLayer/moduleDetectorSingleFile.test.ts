import { describe, expect, it } from 'vitest';

import type { IndexedRepoFile } from '../orchestration/repoIndexer';
import { detectSingleFileModules } from './moduleDetectorSingleFile';
import { buildDirIndex } from './moduleDetectorUtils';

function file(relativePath: string, size = 5000, extension?: string): IndexedRepoFile {
  const ext = extension ?? '.' + relativePath.split('.').slice(-1)[0];
  return {
    rootPath: '/repo',
    path: `/repo/${relativePath}`,
    relativePath,
    extension: ext,
    language: 'typescript',
    size,
    modifiedAt: 1000,
    imports: [],
  };
}

describe('detectSingleFileModules', () => {
  it('creates a module for a significant unassigned source file', () => {
    const files = [file('src/parser.ts', 5000)];
    const assigned = new Set<string>();
    const modules = detectSingleFileModules(files, '/repo', assigned, buildDirIndex(files));
    expect(modules).toHaveLength(1);
    expect(modules[0]?.pattern).toBe('single-file');
    expect(modules[0]?.id).toBe('parser');
    expect(assigned.has('src/parser.ts')).toBe(true);
  });

  it('skips files below MIN_SIGNIFICANT_FILE_SIZE', () => {
    const files = [file('src/tiny.ts', 500)];
    const modules = detectSingleFileModules(files, '/repo', new Set(), buildDirIndex(files));
    expect(modules).toHaveLength(0);
  });

  it('skips already-assigned files', () => {
    const files = [file('src/parser.ts', 5000)];
    const assigned = new Set<string>(['src/parser.ts']);
    const modules = detectSingleFileModules(files, '/repo', assigned, buildDirIndex(files));
    expect(modules).toHaveLength(0);
  });

  it('skips test files and .d.ts files', () => {
    const files = [
      file('src/foo.test.ts', 5000),
      file('src/types.d.ts', 5000, '.d.ts'),
      file('README.md', 5000, '.md'),
    ];
    const modules = detectSingleFileModules(files, '/repo', new Set(), buildDirIndex(files));
    expect(modules).toHaveLength(0);
  });

  it('assigns companion test file alongside the module', () => {
    const files = [file('src/parser.ts', 5000), file('src/parser.test.ts', 1000)];
    const assigned = new Set<string>();
    detectSingleFileModules(files, '/repo', assigned, buildDirIndex(files));
    expect(assigned.has('src/parser.ts')).toBe(true);
    expect(assigned.has('src/parser.test.ts')).toBe(true);
  });

  it('uses file relativePath as rootPath for top-level files', () => {
    const files = [file('main.ts', 5000)];
    const modules = detectSingleFileModules(files, '/repo', new Set(), buildDirIndex(files));
    expect(modules[0]?.rootPath).toBe('main.ts');
  });
});
