/**
 * repoMapGeneratorDeps.test.ts — Wave 69 Phase B3 unit tests.
 * Covers per-source-module aggregation, prefix matching, soft-fallback,
 * and self-loop suppression.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModuleIdentity } from './contextLayerTypes';

vi.mock('../codebaseGraph/graphControllerSupport', () => ({
  getGraphController: vi.fn(),
}));

import { getGraphController } from '../codebaseGraph/graphControllerSupport';
import { buildCrossModuleDependenciesFromGraph } from './repoMapGeneratorDeps';

const mockedGetGraphController = vi.mocked(getGraphController);

function makeModule(id: string, rootPath: string): ModuleIdentity {
  return { id, label: id, rootPath, pattern: 'feature-folder' };
}

describe('buildCrossModuleDependenciesFromGraph', () => {
  beforeEach(() => {
    mockedGetGraphController.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when the graph is unavailable', async () => {
    mockedGetGraphController.mockReturnValue(null);
    const result = await buildCrossModuleDependenciesFromGraph([
      makeModule('a', 'src/a'),
      makeModule('b', 'src/b'),
    ]);
    expect(result).toEqual([]);
  });

  it('aggregates CALLS + IMPORTS edges by source/target module pair', async () => {
    const queryGraph = vi
      .fn()
      // Module 'a': 2 CALLS to b/foo.ts, 1 CALLS to c/bar.ts
      .mockResolvedValueOnce([
        { caller_file_path: 'src/a/x.ts', callee_file_path: 'src/b/foo.ts' },
        { caller_file_path: 'src/a/x.ts', callee_file_path: 'src/b/foo.ts' },
        { caller_file_path: 'src/a/y.ts', callee_file_path: 'src/c/bar.ts' },
      ])
      // Module 'a': 1 IMPORTS to b/foo.ts
      .mockResolvedValueOnce([{ caller_file_path: 'src/a/x.ts', callee_file_path: 'src/b/foo.ts' }])
      // Module 'b': no edges
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      // Module 'c': no edges
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockedGetGraphController.mockReturnValue({ queryGraph } as never);

    const modules = [makeModule('a', 'src/a'), makeModule('b', 'src/b'), makeModule('c', 'src/c')];
    const result = await buildCrossModuleDependenciesFromGraph(modules);

    // a → b: 2 calls + 1 import = 3
    // a → c: 1 call
    expect(result).toEqual(
      expect.arrayContaining([
        { from: 'a', to: 'b', weight: 3 },
        { from: 'a', to: 'c', weight: 1 },
      ]),
    );
    expect(result.length).toBe(2);
  });

  it('drops self-edges where source and target resolve to the same module', async () => {
    const queryGraph = vi
      .fn()
      // Module 'a' calls itself
      .mockResolvedValueOnce([{ caller_file_path: 'src/a/x.ts', callee_file_path: 'src/a/y.ts' }])
      .mockResolvedValueOnce([]);
    mockedGetGraphController.mockReturnValue({ queryGraph } as never);

    const result = await buildCrossModuleDependenciesFromGraph([makeModule('a', 'src/a')]);
    expect(result).toEqual([]);
  });

  it('drops edges whose target file_path does not match any module', async () => {
    const queryGraph = vi
      .fn()
      .mockResolvedValueOnce([
        { caller_file_path: 'src/a/x.ts', callee_file_path: 'node_modules/somewhere.ts' },
      ])
      .mockResolvedValueOnce([]);
    mockedGetGraphController.mockReturnValue({ queryGraph } as never);

    const result = await buildCrossModuleDependenciesFromGraph([makeModule('a', 'src/a')]);
    expect(result).toEqual([]);
  });

  it('drops rows with null callee.file_path (e.g. Package import targets)', async () => {
    const queryGraph = vi
      .fn()
      .mockResolvedValueOnce([
        { caller_file_path: 'src/a/x.ts', callee_file_path: null },
        { caller_file_path: 'src/a/x.ts', callee_file_path: 'src/b/foo.ts' },
      ])
      .mockResolvedValueOnce([]);
    mockedGetGraphController.mockReturnValue({ queryGraph } as never);

    const modules = [makeModule('a', 'src/a'), makeModule('b', 'src/b')];
    const result = await buildCrossModuleDependenciesFromGraph(modules);
    expect(result).toEqual([{ from: 'a', to: 'b', weight: 1 }]);
  });

  it('prefix-matches the most-specific module (longer rootPath wins)', async () => {
    const queryGraph = vi
      .fn()
      // Module 'main' (broad) calls into 'main/chat' (specific)
      .mockResolvedValueOnce([
        { caller_file_path: 'src/main/foo.ts', callee_file_path: 'src/main/chat/widget.ts' },
      ])
      .mockResolvedValueOnce([])
      // Module 'chat' has no outbound edges
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockedGetGraphController.mockReturnValue({ queryGraph } as never);

    const result = await buildCrossModuleDependenciesFromGraph([
      makeModule('main', 'src/main'),
      makeModule('chat', 'src/main/chat'),
    ]);
    expect(result).toEqual([{ from: 'main', to: 'chat', weight: 1 }]);
  });

  it('continues past a per-module query failure', async () => {
    const queryGraph = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ caller_file_path: 'src/b/x.ts', callee_file_path: 'src/c/y.ts' }])
      .mockResolvedValueOnce([]);
    mockedGetGraphController.mockReturnValue({ queryGraph } as never);

    const result = await buildCrossModuleDependenciesFromGraph([
      makeModule('a', 'src/a'),
      makeModule('b', 'src/b'),
      makeModule('c', 'src/c'),
    ]);
    expect(result).toEqual([{ from: 'b', to: 'c', weight: 1 }]);
  });
});
