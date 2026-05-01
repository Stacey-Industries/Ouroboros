/**
 * repoMapGeneratorRanking.test.ts — Wave 69 Phase B2 unit tests.
 * Covers comparator behavior and the soft-fallback path (no graph controller).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModuleIdentity } from './contextLayerTypes';

vi.mock('../codebaseGraph/graphControllerSupport', () => ({
  getGraphController: vi.fn(),
}));

import { getGraphController } from '../codebaseGraph/graphControllerSupport';
import {
  compareByHotspotThenFileCount,
  computeAllModuleHotspotScores,
} from './repoMapGeneratorRanking';

const mockedGetGraphController = vi.mocked(getGraphController);

function makeModule(id: string, rootPath: string): ModuleIdentity {
  return { id, label: id, rootPath, pattern: 'feature-folder' };
}

describe('compareByHotspotThenFileCount', () => {
  it('sorts higher hotspot score first', () => {
    const scores = new Map([
      ['a', 10],
      ['b', 50],
    ]);
    const result = compareByHotspotThenFileCount(
      scores,
      { id: 'a', fileCount: 5 },
      { id: 'b', fileCount: 3 },
    );
    expect(result).toBeGreaterThan(0); // b before a
  });

  it('falls back to file count when scores are equal', () => {
    const scores = new Map([
      ['a', 10],
      ['b', 10],
    ]);
    const result = compareByHotspotThenFileCount(
      scores,
      { id: 'a', fileCount: 5 },
      { id: 'b', fileCount: 12 },
    );
    expect(result).toBeGreaterThan(0); // b (12 files) before a (5 files)
  });

  it('treats missing-from-map modules as score 0', () => {
    const scores = new Map([['a', 10]]);
    const result = compareByHotspotThenFileCount(
      scores,
      { id: 'a', fileCount: 1 },
      { id: 'unknown', fileCount: 99 },
    );
    expect(result).toBeLessThan(0); // a (score 10) before unknown (score 0)
  });

  it('returns 0 for fully equal entries', () => {
    const scores = new Map([
      ['a', 5],
      ['b', 5],
    ]);
    expect(
      compareByHotspotThenFileCount(scores, { id: 'a', fileCount: 3 }, { id: 'b', fileCount: 3 }),
    ).toBe(0);
  });
});

describe('computeAllModuleHotspotScores', () => {
  beforeEach(() => {
    mockedGetGraphController.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty map when the graph is not ready', async () => {
    mockedGetGraphController.mockReturnValue(null);
    const result = await computeAllModuleHotspotScores([makeModule('a', 'src/a')]);
    expect(result.size).toBe(0);
  });

  it('queries per module and aggregates the count rows', async () => {
    const queryGraph = vi
      .fn()
      .mockResolvedValueOnce([{ count: 42 }])
      .mockResolvedValueOnce([{ count: 7 }]);
    mockedGetGraphController.mockReturnValue({ queryGraph } as never);

    const modules = [makeModule('chat', 'src/main/chat'), makeModule('graph', 'src/main/graph')];
    const result = await computeAllModuleHotspotScores(modules);

    expect(result.get('chat')).toBe(42);
    expect(result.get('graph')).toBe(7);
    expect(queryGraph).toHaveBeenCalledTimes(2);
  });

  it('skips a module gracefully when its query throws', async () => {
    const queryGraph = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([{ count: 5 }]);
    mockedGetGraphController.mockReturnValue({ queryGraph } as never);

    const modules = [makeModule('a', 'src/a'), makeModule('b', 'src/b')];
    const result = await computeAllModuleHotspotScores(modules);

    expect(result.has('a')).toBe(false);
    expect(result.get('b')).toBe(5);
  });

  it('treats a missing count value as 0 without throwing', async () => {
    const queryGraph = vi.fn().mockResolvedValueOnce([{}]);
    mockedGetGraphController.mockReturnValue({ queryGraph } as never);

    const result = await computeAllModuleHotspotScores([makeModule('x', 'src/x')]);
    expect(result.get('x')).toBe(0);
  });
});
