/**
 * contextLayerRefresher.test.ts — Smoke tests for the simplified refresher
 * after Wave 69 Phase D removed the import-graph / cohesion seams.
 */

import { describe, expect, it } from 'vitest';

import type { CachedModuleData, DetectedModule } from './contextLayerControllerHelpers';
import {
  countRefreshedModules,
  type ModuleCacheState,
  refreshDirtyModuleCache,
  updateModuleCache,
} from './contextLayerRefresher';

function makeModule(id: string): DetectedModule {
  return {
    id,
    label: id,
    rootPath: `src/${id}`,
    pattern: 'feature-folder',
    files: [],
    exports: [],
    cohesion: 0,
    boundarySignals: {
      hasBarrel: false,
      barrelImportCount: 0,
      directImportCount: 0,
      boundaryStrength: 'weak',
    },
    recentlyChanged: false,
  } as DetectedModule;
}

function makeState(): ModuleCacheState {
  return {
    cachedModules: new Map<string, CachedModuleData>(),
    cachedRepoMap: null,
    lastSnapshotCacheKey: null,
    dirtyModuleIds: new Set(),
  };
}

function makeSnapshot(): {
  roots: Array<{ rootPath: string; files: []; workspaceFact: { languages: [] } }>;
  cache: { key: string };
} {
  return {
    roots: [{ rootPath: '/repo', files: [], workspaceFact: { languages: [] } }],
    cache: { key: 'snap-1' },
  };
}

describe('updateModuleCache', () => {
  it('inserts new modules into the cache', () => {
    const state = makeState();
    const modules = [makeModule('a'), makeModule('b')];
    updateModuleCache(state, modules, makeSnapshot() as never);
    expect(state.cachedModules.size).toBe(2);
    expect(state.cachedModules.has('a')).toBe(true);
    expect(state.cachedModules.has('b')).toBe(true);
  });

  it('drops cached modules that are no longer in the module list', () => {
    const state = makeState();
    updateModuleCache(state, [makeModule('a'), makeModule('b')], makeSnapshot() as never);
    expect(state.cachedModules.size).toBe(2);

    updateModuleCache(state, [makeModule('a')], makeSnapshot() as never);
    expect(state.cachedModules.size).toBe(1);
    expect(state.cachedModules.has('b')).toBe(false);
  });

  it('clears dirtyModuleIds after a full update', () => {
    const state = makeState();
    state.dirtyModuleIds.add('a');
    updateModuleCache(state, [makeModule('a')], makeSnapshot() as never);
    expect(state.dirtyModuleIds.size).toBe(0);
  });
});

describe('refreshDirtyModuleCache', () => {
  it('refreshes only modules in dirtyModuleIds', () => {
    const state = makeState();
    state.dirtyModuleIds.add('a');
    refreshDirtyModuleCache(state, [makeModule('a'), makeModule('b')], makeSnapshot() as never);
    expect(state.cachedModules.has('a')).toBe(true);
    expect(state.cachedModules.has('b')).toBe(false);
  });
});

describe('countRefreshedModules', () => {
  it('counts cached modules that have not been AI-enriched', () => {
    const cached = new Map<string, CachedModuleData>([
      ['a', { module: makeModule('a'), summary: {} as never, stateHash: 'h1', aiEnriched: false }],
      ['b', { module: makeModule('b'), summary: {} as never, stateHash: 'h2', aiEnriched: true }],
    ]);
    const result = countRefreshedModules([makeModule('a'), makeModule('b')], cached);
    expect(result).toBe(1);
  });
});
