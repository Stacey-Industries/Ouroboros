/**
 * moduleDetectorMatching.test.ts — Smoke tests for the extracted matchers and
 * import-resolution helpers. These functions were split out of
 * moduleDetectorHelpers.ts in Wave 69 B1; behavior is unchanged.
 */

import { describe, expect, it } from 'vitest';

import type { IndexedRepoFile } from '../orchestration/repoIndexer';
import type { ModuleIdentity } from './contextLayerTypes';
import {
  findModuleForFile,
  resolveImportToModule,
  resolveRelativePath,
} from './moduleDetectorMatching';

function makeFile(relativePath: string, overrides: Partial<IndexedRepoFile> = {}): IndexedRepoFile {
  return {
    rootPath: '/repo',
    path: `/repo/${relativePath}`,
    relativePath,
    extension: relativePath.includes('.') ? '.' + relativePath.split('.').pop() : '',
    language: 'typescript',
    size: 100,
    isDirectory: false,
    isSymlink: false,
    modifiedAt: 0,
    imports: [],
    ...overrides,
  } as IndexedRepoFile;
}

function makeModule(
  id: string,
  pattern: ModuleIdentity['pattern'],
  rootPath: string,
): ModuleIdentity {
  return { id, label: id, rootPath, pattern };
}

describe('findModuleForFile', () => {
  it('matches feature-folder modules by directory prefix', () => {
    const modules = [makeModule('chat', 'feature-folder', 'src/chat')];
    const file = makeFile('src/chat/widget.ts');
    expect(findModuleForFile(modules, file)).toBe('chat');
  });

  it('does not match feature-folder modules outside their root', () => {
    const modules = [makeModule('chat', 'feature-folder', 'src/chat')];
    const file = makeFile('src/other/widget.ts');
    expect(findModuleForFile(modules, file)).toBeNull();
  });

  it('matches config modules at the workspace root', () => {
    const modules = [makeModule('config', 'config', '.')];
    const file = makeFile('package.json');
    expect(findModuleForFile(modules, file)).toBe('config');
  });

  it('matches flat-group modules by file basename prefix', () => {
    const modules = [makeModule('terminal-buffer', 'flat-group', 'src/main')];
    const file = makeFile('src/main/terminalBufferState.ts');
    expect(findModuleForFile(modules, file)).toBe('terminal-buffer');
  });

  it('matches single-file modules by exact basename', () => {
    const modules = [makeModule('logger', 'single-file', 'src/main/logger.ts')];
    const file = makeFile('src/main/logger.ts');
    expect(findModuleForFile(modules, file)).toBe('logger');
  });

  it('falls back to "other" when present and no pattern matches', () => {
    const modules = [
      makeModule('chat', 'feature-folder', 'src/chat'),
      makeModule('other', 'flat-group', '.'),
    ];
    const file = makeFile('src/unknown/widget.ts');
    expect(findModuleForFile(modules, file)).toBe('other');
  });

  it('prefers feature-folder matches over flat-group when both could match', () => {
    const modules = [
      makeModule('main', 'flat-group', 'src/main'),
      makeModule('chat', 'feature-folder', 'src/main/chat'),
    ];
    const file = makeFile('src/main/chat/widget.ts');
    expect(findModuleForFile(modules, file)).toBe('chat');
  });
});

describe('resolveImportToModule', () => {
  it('returns the module for an exact path match', () => {
    const fileToModule = new Map([['src/foo/bar.ts', 'foo']]);
    expect(resolveImportToModule('src/foo/bar.ts', fileToModule)).toBe('foo');
  });

  it('appends common extensions when the bare path has none', () => {
    const fileToModule = new Map([['src/foo/bar.ts', 'foo']]);
    expect(resolveImportToModule('src/foo/bar', fileToModule)).toBe('foo');
  });

  it('resolves directory imports to /index files', () => {
    const fileToModule = new Map([['src/foo/index.ts', 'foo']]);
    expect(resolveImportToModule('src/foo', fileToModule)).toBe('foo');
  });

  it('returns null when no variant matches', () => {
    const fileToModule = new Map([['src/foo/bar.ts', 'foo']]);
    expect(resolveImportToModule('src/missing/baz', fileToModule)).toBeNull();
  });

  it('lowercases the lookup key (callers should use the same normalization)', () => {
    const fileToModule = new Map([['src/foo/bar.ts', 'foo']]);
    expect(resolveImportToModule('SRC/Foo/Bar.ts', fileToModule)).toBe('foo');
  });
});

describe('resolveRelativePath', () => {
  it('handles ./ relative imports', () => {
    expect(resolveRelativePath('src/foo', './bar')).toBe('src/foo/bar');
  });

  it('handles ../ parent-directory imports', () => {
    expect(resolveRelativePath('src/foo/baz', '../bar')).toBe('src/foo/bar');
  });

  it('handles deeply nested ../ chains', () => {
    // src/a/b/c → ../../../top: pop c, b, a, push top → src/top
    expect(resolveRelativePath('src/a/b/c', '../../../top')).toBe('src/top');
  });

  it('strips redundant ./ segments', () => {
    expect(resolveRelativePath('src/foo', './././bar')).toBe('src/foo/bar');
  });
});
