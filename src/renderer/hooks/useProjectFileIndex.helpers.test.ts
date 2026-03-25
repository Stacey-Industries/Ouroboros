import { describe, expect, it } from 'vitest';
import type { FileChangeEvent } from '../types/electron';
import { applyWatchChange, createFileEntry, processWatchChanges, shouldIgnoreIndexedPath } from './useProjectFileIndex.helpers';

const root = '/workspace';
const shouldIgnore = (name: string): boolean => name === 'node_modules' || name.endsWith('.log');

function change(type: FileChangeEvent['type'], path: string): FileChangeEvent {
  return { type, path };
}

describe('useProjectFileIndex helpers', () => {
  it('adds a file and keeps the list sorted', () => {
    const files = [
      createFileEntry(root, '/workspace/src/main.ts'),
      createFileEntry(root, '/workspace/README.md'),
    ];

    const result = applyWatchChange(files, change('add', '/workspace/src/utils/math.ts'), {
      root,
      shouldIgnore,
    });

    expect(result.map((file) => file.relativePath)).toEqual([
      'README.md',
      'src/main.ts',
      'src/utils/math.ts',
    ]);
  });

  it('ignores files under ignored path segments', () => {
    const files = [createFileEntry(root, '/workspace/src/main.ts')];

    const result = applyWatchChange(files, change('add', '/workspace/node_modules/pkg/index.js'), {
      root,
      shouldIgnore,
    });

    expect(result).toBe(files);
    expect(shouldIgnoreIndexedPath(root, '/workspace/node_modules/pkg/index.js', shouldIgnore)).toBe(true);
  });

  it('removes a single file on unlink', () => {
    const files = [
      createFileEntry(root, '/workspace/src/main.ts'),
      createFileEntry(root, '/workspace/src/utils/math.ts'),
    ];

    const result = applyWatchChange(files, change('unlink', '/workspace/src/main.ts'), {
      root,
      shouldIgnore,
    });

    expect(result.map((file) => file.relativePath)).toEqual(['src/utils/math.ts']);
  });

  it('removes an entire subtree on unlinkDir', () => {
    const files = [
      createFileEntry(root, '/workspace/src/main.ts'),
      createFileEntry(root, '/workspace/src/utils/math.ts'),
      createFileEntry(root, '/workspace/test/spec.ts'),
    ];

    const result = applyWatchChange(files, change('unlinkDir', '/workspace/src'), {
      root,
      shouldIgnore,
    });

    expect(result.map((file) => file.relativePath)).toEqual(['test/spec.ts']);
  });

  it('merges scanned subtree files on addDir without duplicating existing paths', () => {
    const files = [
      createFileEntry(root, '/workspace/src/main.ts'),
      createFileEntry(root, '/workspace/src/new-folder/keep.ts'),
    ];

    const result = applyWatchChange(files, change('addDir', '/workspace/src/new-folder'), {
      addedFiles: [
        createFileEntry(root, '/workspace/src/new-folder/keep.ts'),
        createFileEntry(root, '/workspace/src/new-folder/deep/index.ts'),
      ],
      root,
      shouldIgnore,
    });

    expect(result.map((file) => file.relativePath)).toEqual([
      'src/main.ts',
      'src/new-folder/keep.ts',
      'src/new-folder/deep/index.ts',
    ]);
  });

  it('processes a mixed watch batch using addDir scans and incremental removals', async () => {
    const files = [
      createFileEntry(root, '/workspace/README.md'),
      createFileEntry(root, '/workspace/src/old.ts'),
      createFileEntry(root, '/workspace/tmp/debug.log'),
    ];

    const scanFilesForAddedDirectory = async (dirPath: string) => {
      if (dirPath === '/workspace/src/new-folder') {
        return [
          createFileEntry(root, '/workspace/src/new-folder/index.ts'),
          createFileEntry(root, '/workspace/src/new-folder/nested/util.ts'),
        ];
      }

      return [];
    };

    const result = await processWatchChanges(
      files,
      [
        change('unlink', '/workspace/src/old.ts'),
        change('addDir', '/workspace/src/new-folder'),
        change('add', '/workspace/node_modules/pkg/index.js'),
        change('unlinkDir', '/workspace/tmp'),
      ],
      {
        root,
        scanFilesForAddedDirectory,
        shouldIgnore,
      },
    );

    expect(result.map((file) => file.relativePath)).toEqual([
      'README.md',
      'src/new-folder/index.ts',
      'src/new-folder/nested/util.ts',
    ]);
  });
});
