import { describe, expect, it } from 'vitest';
import { buildIgnorePredicate, getNodeGitStatus, parentDir, pathJoin, relPath, sortNodes } from './fileTreeUtils';
import type { TreeNode } from './FileTreeItem';
import type { GitFileStatus } from '../../types/electron';

function createNode(name: string, path: string, isDirectory: boolean): TreeNode {
  return {
    name,
    path,
    relativePath: name,
    isDirectory,
    depth: 0,
    isExpanded: false,
    isLoading: false,
  };
}

describe('fileTreeUtils', () => {
  it('buildIgnorePredicate combines base ignores with extra patterns', () => {
    const shouldIgnore = buildIgnorePredicate(['dist', '*.log']);

    expect(shouldIgnore('.git')).toBe(true);
    expect(shouldIgnore('__pycache__')).toBe(true);
    expect(shouldIgnore('dist')).toBe(true);
    expect(shouldIgnore('server.log')).toBe(true);
    expect(shouldIgnore('src')).toBe(false);
  });

  it('normalizes relative paths across slash styles', () => {
    expect(relPath('C:\\repo', 'C:\\repo\\src\\App.tsx')).toBe('src/App.tsx');
    expect(relPath('/repo', '/repo/src/App.tsx')).toBe('src/App.tsx');
  });

  it('sorts directories before files and compares names case-insensitively', () => {
    const nodes = [
      createNode('zeta.ts', '/repo/zeta.ts', false),
      createNode('alpha', '/repo/alpha', true),
      createNode('Beta.ts', '/repo/Beta.ts', false),
    ];

    expect(sortNodes(nodes).map((node) => node.name)).toEqual(['alpha', 'Beta.ts', 'zeta.ts']);
  });

  it('rolls directory git status up to the highest-priority child status', () => {
    const node = {
      ...createNode('src', '/repo/src', true),
      relativePath: 'src',
    };
    const gitStatusMap = new Map<string, GitFileStatus>([
      ['src/added.ts', 'A'],
      ['src/deleted.ts', 'D'],
      ['src/modified.ts', 'M'],
    ]);

    expect(getNodeGitStatus(node, gitStatusMap)).toBe('D');
  });

  it('joins and resolves parent directories for both slash styles', () => {
    expect(pathJoin('/repo/src', 'App.tsx')).toBe('/repo/src/App.tsx');
    expect(pathJoin('C:\\repo\\src', 'App.tsx')).toBe('C:\\repo\\src\\App.tsx');
    expect(parentDir('/repo/src/App.tsx')).toBe('/repo/src');
    expect(parentDir('C:\\repo\\src\\App.tsx')).toBe('C:\\repo\\src');
  });
});
