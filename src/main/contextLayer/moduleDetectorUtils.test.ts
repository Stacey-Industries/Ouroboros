import { describe, expect, it } from 'vitest';

import type { IndexedRepoFile } from '../orchestration/repoIndexer';
import {
  basenameWithoutExtension,
  buildDirIndex,
  hasAnyPrefixGroup,
  isConfigFile,
  isSourceFile,
  isTestFile,
  isWithinDepthLimit,
  longestCommonPrefix,
  normalizedDirname,
  normalizeSeparators,
  toKebabCase,
  toLabel,
} from './moduleDetectorUtils';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFile(relativePath: string, extension?: string, size = 1000): IndexedRepoFile {
  const ext = extension ?? '.' + relativePath.split('.').pop();
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

// ---------------------------------------------------------------------------
// buildDirIndex
// ---------------------------------------------------------------------------

describe('buildDirIndex', () => {
  it('buckets all files by their parent directory', () => {
    const files = [
      makeFile('src/main/foo.ts'),
      makeFile('src/main/bar.ts'),
      makeFile('src/renderer/baz.ts'),
    ];
    const { allByDir } = buildDirIndex(files);
    expect(allByDir.get('src/main')).toHaveLength(2);
    expect(allByDir.get('src/renderer')).toHaveLength(1);
  });

  it('buckets source files into sourceByDir and excludes test files', () => {
    const files = [
      makeFile('src/main/foo.ts'),
      makeFile('src/main/foo.test.ts'),
      makeFile('src/main/bar.ts'),
    ];
    const { sourceByDir } = buildDirIndex(files);
    const srcMain = sourceByDir.get('src/main') ?? [];
    expect(srcMain).toHaveLength(2);
    expect(srcMain.map((f) => f.relativePath)).not.toContain('src/main/foo.test.ts');
  });

  it('excludes non-source extensions from sourceByDir', () => {
    const files = [
      makeFile('src/main/index.ts'),
      makeFile('src/main/README.md', '.md'),
      makeFile('src/main/style.css', '.css'),
    ];
    const { sourceByDir } = buildDirIndex(files);
    const srcMain = sourceByDir.get('src/main') ?? [];
    expect(srcMain).toHaveLength(1);
    expect(srcMain[0].relativePath).toBe('src/main/index.ts');
  });

  it('populates allDirs with every non-root directory', () => {
    const files = [
      makeFile('src/main/foo.ts'),
      makeFile('src/renderer/bar.ts'),
      makeFile('root.ts'),
    ];
    const { allDirs } = buildDirIndex(files);
    expect(allDirs.has('src/main')).toBe(true);
    expect(allDirs.has('src/renderer')).toBe(true);
    expect(allDirs.has('.')).toBe(false);
  });

  it('handles root-level files (dirname = ".") without adding to allDirs', () => {
    const files = [makeFile('index.ts'), makeFile('package.json', '.json')];
    const { allByDir, allDirs } = buildDirIndex(files);
    expect(allByDir.get('.')).toHaveLength(2);
    expect(allDirs.has('.')).toBe(false);
  });

  it('returns empty maps for an empty file list', () => {
    const { allByDir, sourceByDir, allDirs } = buildDirIndex([]);
    expect(allByDir.size).toBe(0);
    expect(sourceByDir.size).toBe(0);
    expect(allDirs.size).toBe(0);
  });

  it('normalizes Windows backslash paths into allByDir keys', () => {
    const files = [makeFile('src\\main\\foo.ts')];
    const { allByDir } = buildDirIndex(files);
    // normalizedDirname converts backslashes; key should be forward-slash form
    const keys = [...allByDir.keys()];
    expect(keys.every((k) => !k.includes('\\'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasAnyPrefixGroup — O(N log N) rewrite
// ---------------------------------------------------------------------------

describe('hasAnyPrefixGroup', () => {
  it('returns true when two basenames share a prefix of MIN length', () => {
    const files = [makeFile('src/main/configSchema.ts'), makeFile('src/main/configSchemaTail.ts')];
    expect(hasAnyPrefixGroup(files)).toBe(true);
  });

  it('returns false when no two basenames share a prefix of MIN length', () => {
    const files = [makeFile('src/main/alpha.ts'), makeFile('src/main/beta.ts')];
    expect(hasAnyPrefixGroup(files)).toBe(false);
  });

  it('returns false for a single file', () => {
    expect(hasAnyPrefixGroup([makeFile('src/main/single.ts')])).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(hasAnyPrefixGroup([])).toBe(false);
  });

  it('detects prefix across non-adjacent sorted positions', () => {
    // After sort: configA, configB, zebra — prefix detected between configA and configB
    const files = [
      makeFile('src/main/zebra.ts'),
      makeFile('src/main/configA.ts'),
      makeFile('src/main/configB.ts'),
    ];
    expect(hasAnyPrefixGroup(files)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Spot-checks for existing utilities (regression guard)
// ---------------------------------------------------------------------------

describe('toKebabCase', () => {
  it('converts camelCase to kebab-case', () => {
    expect(toKebabCase('myComponentUtils')).toBe('my-component-utils');
  });
  it('strips non-alphanumeric characters', () => {
    expect(toKebabCase('foo_bar baz')).toBe('foo-bar-baz');
  });
});

describe('toLabel', () => {
  it('converts kebab to title case', () => {
    expect(toLabel('file-tree')).toBe('File Tree');
  });
});

describe('longestCommonPrefix', () => {
  it('returns the shared prefix of two strings', () => {
    expect(longestCommonPrefix('configSchema', 'configSchemaTail')).toBe('configSchema');
  });
  it('returns empty string when no shared prefix', () => {
    expect(longestCommonPrefix('alpha', 'beta')).toBe('');
  });
});

describe('normalizeSeparators', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeSeparators('src\\main\\foo.ts')).toBe('src/main/foo.ts');
  });
});

describe('normalizedDirname', () => {
  it('returns the parent directory with forward slashes', () => {
    expect(normalizedDirname('src/main/foo.ts')).toBe('src/main');
  });
  it('returns "." for root-level files', () => {
    expect(normalizedDirname('index.ts')).toBe('.');
  });
});

describe('basenameWithoutExtension', () => {
  it('strips the extension', () => {
    expect(basenameWithoutExtension('src/main/foo.ts')).toBe('foo');
  });
  it('strips .d.ts as a compound extension', () => {
    expect(basenameWithoutExtension('src/types/electron.d.ts')).toBe('electron');
  });
});

describe('isSourceFile', () => {
  it('returns true for .ts', () => {
    expect(isSourceFile('.ts')).toBe(true);
  });
  it('returns false for .md', () => {
    expect(isSourceFile('.md')).toBe(false);
  });
});

describe('isTestFile', () => {
  it('returns true for .test.ts', () => {
    expect(isTestFile('foo.test.ts')).toBe(true);
  });
  it('returns true for .spec.tsx', () => {
    expect(isTestFile('bar.spec.tsx')).toBe(true);
  });
  it('returns false for regular source', () => {
    expect(isTestFile('foo.ts')).toBe(false);
  });
});

describe('isWithinDepthLimit', () => {
  it('returns true for depth exactly 3 below src/', () => {
    expect(isWithinDepthLimit('src/a/b/c')).toBe(true);
  });
  it('returns false for depth 4 below src/', () => {
    expect(isWithinDepthLimit('src/a/b/c/d')).toBe(false);
  });
});

describe('isConfigFile', () => {
  it('returns true for package.json', () => {
    expect(isConfigFile('package.json')).toBe(true);
  });
  it('returns true for tsconfig.node.json (prefix match)', () => {
    expect(isConfigFile('tsconfig.node.json')).toBe(true);
  });
  it('returns false for a random source file', () => {
    expect(isConfigFile('myModule.ts')).toBe(false);
  });
});
