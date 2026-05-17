import { describe, expect, it } from 'vitest';

import type { ModuleContextEntry, ModuleStructuralSummary, RepoMap } from './contextLayerTypes';
import { enforceSizeCap } from './repoMapGeneratorSizeCap';

function makeSummary(id: string, fileCount: number, exportCount = 10): ModuleStructuralSummary {
  return {
    module: {
      id,
      label: id,
      rootPath: `/repo/${id}`,
      pattern: 'feature-folder',
    },
    fileCount,
    totalLines: fileCount * 100,
    languages: ['typescript'],
    exports: Array.from({ length: exportCount }, (_, i) => ({
      name: `${id}_export_${i}`,
      kind: 'Function' as const,
      signature: null,
    })),
    imports: [`/repo/${id}/dep.ts`],
    entryPoints: [],
    recentlyChanged: false,
    lastModified: 1000,
    contentHash: `hash-${id}`,
  };
}

function makeEntry(id: string, fileCount: number, exportCount = 10): ModuleContextEntry {
  return { structural: makeSummary(id, fileCount, exportCount) };
}

function makeRepoMap(modules: ModuleContextEntry[]): RepoMap {
  return {
    version: 1,
    generatedAt: 1000,
    workspaceRoot: '/repo',
    projectName: 'repo',
    languages: ['typescript'],
    frameworks: [],
    moduleCount: modules.length,
    totalFileCount: modules.reduce((sum, m) => sum + m.structural.fileCount, 0),
    modules,
    crossModuleDependencies: modules.flatMap((m, i) =>
      modules.slice(i + 1).map((other, j) => ({
        from: m.structural.module.id,
        to: other.structural.module.id,
        weight: (j % 3) + 1,
      })),
    ),
  };
}

describe('enforceSizeCap', () => {
  it('returns input unchanged when serialized size is under the cap', () => {
    const repoMap = makeRepoMap([makeEntry('a', 1, 2)]);
    const result = enforceSizeCap(repoMap, new Map(), 'claude-opus-4-7');
    expect(result).toBe(repoMap);
  });

  it('trims exports and drops imports at Step 1 when over the cap', () => {
    const modules = Array.from({ length: 20 }, (_, i) => makeEntry(`mod${i}`, 5, 50));
    const repoMap = makeRepoMap(modules);
    const result = enforceSizeCap(repoMap, new Map(), undefined);
    for (const m of result.modules) {
      expect(m.structural.exports.length).toBeLessThanOrEqual(5);
      expect(m.structural.imports).toEqual([]);
    }
  });

  it('drops low-weight cross-module deps at Step 2', () => {
    const modules = Array.from({ length: 25 }, (_, i) => makeEntry(`mod${i}`, 10, 50));
    const repoMap = makeRepoMap(modules);
    const result = enforceSizeCap(repoMap, new Map(), undefined);
    for (const dep of result.crossModuleDependencies) {
      expect(dep.weight).toBeGreaterThanOrEqual(2);
    }
  });

  it('caps modules to top-N by hotspot score at Step 3 when still over', () => {
    const modules = Array.from({ length: 60 }, (_, i) => makeEntry(`mod${i}`, 10, 50));
    const repoMap = makeRepoMap(modules);
    const scores = new Map<string, number>();
    for (let i = 0; i < 60; i++) scores.set(`mod${i}`, i);
    const result = enforceSizeCap(repoMap, scores, undefined);
    expect(result.modules.length).toBeLessThanOrEqual(30);
    expect(result.moduleCount).toBe(result.modules.length);
    // Highest-score module (mod59) must survive.
    expect(result.modules.some((m) => m.structural.module.id === 'mod59')).toBe(true);
    // Cross-module deps must reference only surviving module ids.
    const survivingIds = new Set(result.modules.map((m) => m.structural.module.id));
    for (const dep of result.crossModuleDependencies) {
      expect(survivingIds.has(dep.from)).toBe(true);
      expect(survivingIds.has(dep.to)).toBe(true);
    }
  });
});
