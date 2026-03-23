import { describe, expect, it } from 'vitest';

import {
  buildResolvedImportGraph,
  computeModuleCohesion,
  type ImportGraph,
  type ResolvedImport,
} from './importGraphAnalyzer';
import { refineModuleAssignments } from './importGraphAnalyzerSupport';
import type { RootRepoIndexSnapshot } from '../orchestration/repoIndexer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(
  relativePath: string,
  imports: string[] = [],
): RootRepoIndexSnapshot['files'][0] {
  const dotIndex = relativePath.lastIndexOf('.');
  const extension = dotIndex >= 0 ? relativePath.slice(dotIndex) : '';
  return { relativePath, extension, imports, size: 100, modifiedAt: 0 };
}

function makeRoot(files: RootRepoIndexSnapshot['files']): RootRepoIndexSnapshot {
  return { rootPath: '/repo', files } as unknown as RootRepoIndexSnapshot;
}

function makeGraph(
  edges: ResolvedImport[],
  unresolvedCount = 0,
  totalRelativeImports = edges.length,
): ImportGraph {
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const { fromFile, toFile } of edges) {
    if (!outgoing.has(fromFile)) outgoing.set(fromFile, new Set());
    outgoing.get(fromFile)!.add(toFile);
    if (!incoming.has(toFile)) incoming.set(toFile, new Set());
    incoming.get(toFile)!.add(fromFile);
  }
  return { edges, outgoing, incoming, unresolvedCount, totalRelativeImports };
}

// ---------------------------------------------------------------------------
// Part 1: resolveRelativeImport (via buildResolvedImportGraph)
// ---------------------------------------------------------------------------

describe('buildResolvedImportGraph — relative import resolution', () => {
  it('resolves a sibling relative import', () => {
    const root = makeRoot([
      makeFile('src/a.ts', ['./b']),
      makeFile('src/b.ts'),
    ]);
    const graph = buildResolvedImportGraph([root]);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ fromFile: 'src/a.ts', toFile: 'src/b.ts' });
  });

  it('resolves a parent-relative import (../)', () => {
    const root = makeRoot([
      makeFile('src/utils/helper.ts', ['../core']),
      makeFile('src/core.ts'),
    ]);
    const graph = buildResolvedImportGraph([root]);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ fromFile: 'src/utils/helper.ts', toFile: 'src/core.ts' });
  });

  it('resolves import without extension by appending .ts', () => {
    const root = makeRoot([
      makeFile('src/index.ts', ['./utils']),
      makeFile('src/utils.ts'),
    ]);
    const graph = buildResolvedImportGraph([root]);
    expect(graph.edges[0]).toMatchObject({ toFile: 'src/utils.ts' });
  });

  it('resolves extensionless import to index.ts in subdirectory', () => {
    const root = makeRoot([
      makeFile('src/app.ts', ['./components']),
      makeFile('src/components/index.ts'),
    ]);
    const graph = buildResolvedImportGraph([root]);
    expect(graph.edges[0]).toMatchObject({ toFile: 'src/components/index.ts' });
  });

  it('resolves import to .tsx file', () => {
    const root = makeRoot([
      makeFile('src/app.ts', ['./Button']),
      makeFile('src/Button.tsx'),
    ]);
    const graph = buildResolvedImportGraph([root]);
    expect(graph.edges[0]).toMatchObject({ toFile: 'src/Button.tsx' });
  });

  it('ignores self-imports', () => {
    const root = makeRoot([
      makeFile('src/a.ts', ['./a']),
    ]);
    const graph = buildResolvedImportGraph([root]);
    // Self-import should be filtered out
    expect(graph.edges).toHaveLength(0);
  });

  it('skips non-code file extensions', () => {
    const root = makeRoot([
      makeFile('src/image.png', ['./something']),
      makeFile('src/something.ts'),
    ]);
    const graph = buildResolvedImportGraph([root]);
    // .png is not a code file — its imports are never processed
    expect(graph.edges).toHaveLength(0);
  });

  it('returns empty graph for empty input', () => {
    const graph = buildResolvedImportGraph([]);
    expect(graph.edges).toHaveLength(0);
    expect(graph.outgoing.size).toBe(0);
    expect(graph.incoming.size).toBe(0);
    expect(graph.unresolvedCount).toBe(0);
    expect(graph.totalRelativeImports).toBe(0);
  });

  it('counts unresolved imports', () => {
    const root = makeRoot([
      makeFile('src/a.ts', ['./missing', './alsoMissing']),
    ]);
    const graph = buildResolvedImportGraph([root]);
    expect(graph.unresolvedCount).toBe(2);
    expect(graph.totalRelativeImports).toBe(2);
    expect(graph.edges).toHaveLength(0);
  });

  it('ignores absolute/package imports (no leading dot)', () => {
    const root = makeRoot([
      makeFile('src/a.ts', ['react', 'lodash']),
    ]);
    const graph = buildResolvedImportGraph([root]);
    // Package imports can't be resolved to local files
    expect(graph.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Part 1: buildResolvedImportGraph — adjacency maps
// ---------------------------------------------------------------------------

describe('buildResolvedImportGraph — adjacency maps', () => {
  it('populates outgoing map correctly', () => {
    const root = makeRoot([
      makeFile('src/a.ts', ['./b', './c']),
      makeFile('src/b.ts'),
      makeFile('src/c.ts'),
    ]);
    const graph = buildResolvedImportGraph([root]);
    const outEdges = graph.outgoing.get('src/a.ts');
    expect(outEdges).toBeDefined();
    expect(outEdges!.has('src/b.ts')).toBe(true);
    expect(outEdges!.has('src/c.ts')).toBe(true);
  });

  it('populates incoming map correctly', () => {
    const root = makeRoot([
      makeFile('src/a.ts', ['./shared']),
      makeFile('src/b.ts', ['./shared']),
      makeFile('src/shared.ts'),
    ]);
    const graph = buildResolvedImportGraph([root]);
    const inEdges = graph.incoming.get('src/shared.ts');
    expect(inEdges).toBeDefined();
    expect(inEdges!.has('src/a.ts')).toBe(true);
    expect(inEdges!.has('src/b.ts')).toBe(true);
  });

  it('handles multiple roots', () => {
    const root1 = makeRoot([makeFile('pkg1/a.ts', ['./b']), makeFile('pkg1/b.ts')]);
    const root2 = makeRoot([makeFile('pkg2/x.ts', ['./y']), makeFile('pkg2/y.ts')]);
    const graph = buildResolvedImportGraph([root1, root2]);
    expect(graph.edges).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Part 1: Circular import handling
// ---------------------------------------------------------------------------

describe('buildResolvedImportGraph — circular imports', () => {
  it('handles direct circular imports (A → B → A)', () => {
    const root = makeRoot([
      makeFile('src/a.ts', ['./b']),
      makeFile('src/b.ts', ['./a']),
    ]);
    const graph = buildResolvedImportGraph([root]);
    expect(graph.edges).toHaveLength(2);
    const fromA = graph.edges.find((e) => e.fromFile === 'src/a.ts');
    const fromB = graph.edges.find((e) => e.fromFile === 'src/b.ts');
    expect(fromA?.toFile).toBe('src/b.ts');
    expect(fromB?.toFile).toBe('src/a.ts');
  });

  it('handles three-node cycles (A → B → C → A)', () => {
    const root = makeRoot([
      makeFile('src/a.ts', ['./b']),
      makeFile('src/b.ts', ['./c']),
      makeFile('src/c.ts', ['./a']),
    ]);
    const graph = buildResolvedImportGraph([root]);
    expect(graph.edges).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Part 2: computeModuleCohesion
// ---------------------------------------------------------------------------

describe('computeModuleCohesion', () => {
  it('returns 0 cohesion for a module with no outgoing imports', () => {
    const modules = [{ id: 'A', files: [{ relativePath: 'src/a.ts' }] }];
    const graph = makeGraph([]);
    const metrics = computeModuleCohesion(modules, graph);
    expect(metrics).toHaveLength(1);
    expect(metrics[0].internalCohesion).toBe(0);
    expect(metrics[0].totalImports).toBe(0);
  });

  it('returns cohesion 1.0 when all imports are within the same module', () => {
    const modules = [
      {
        id: 'moduleA',
        files: [{ relativePath: 'src/a.ts' }, { relativePath: 'src/b.ts' }],
      },
    ];
    const graph = makeGraph([{ fromFile: 'src/a.ts', toFile: 'src/b.ts', specifier: './b' }]);
    const metrics = computeModuleCohesion(modules, graph);
    expect(metrics[0].internalCohesion).toBe(1);
    expect(metrics[0].internalImports).toBe(1);
    expect(metrics[0].totalImports).toBe(1);
  });

  it('returns cohesion 0.0 when all imports go to external modules', () => {
    const modules = [
      { id: 'A', files: [{ relativePath: 'src/a.ts' }] },
      { id: 'B', files: [{ relativePath: 'src/b.ts' }] },
    ];
    // A imports from B only
    const graph = makeGraph([{ fromFile: 'src/a.ts', toFile: 'src/b.ts', specifier: './b' }]);
    const metricsA = computeModuleCohesion(modules, graph).find((m) => m.moduleId === 'A')!;
    expect(metricsA.internalCohesion).toBe(0);
    expect(metricsA.internalImports).toBe(0);
  });

  it('calculates partial cohesion correctly', () => {
    // Module A has 2 files: a1 and a2. Module B has b1.
    // a1 → a2 (internal), a1 → b1 (external)
    const modules = [
      { id: 'A', files: [{ relativePath: 'a1.ts' }, { relativePath: 'a2.ts' }] },
      { id: 'B', files: [{ relativePath: 'b1.ts' }] },
    ];
    const graph = makeGraph([
      { fromFile: 'a1.ts', toFile: 'a2.ts', specifier: './a2' },
      { fromFile: 'a1.ts', toFile: 'b1.ts', specifier: './b1' },
    ]);
    const metricsA = computeModuleCohesion(modules, graph).find((m) => m.moduleId === 'A')!;
    expect(metricsA.internalCohesion).toBeCloseTo(0.5);
    expect(metricsA.internalImports).toBe(1);
    expect(metricsA.totalImports).toBe(2);
  });

  it('identifies top external dependencies', () => {
    const modules = [
      { id: 'A', files: [{ relativePath: 'a.ts' }] },
      { id: 'B', files: [{ relativePath: 'b.ts' }] },
      { id: 'C', files: [{ relativePath: 'c.ts' }] },
    ];
    const graph = makeGraph([
      { fromFile: 'a.ts', toFile: 'b.ts', specifier: './b' },
      { fromFile: 'a.ts', toFile: 'c.ts', specifier: './c' },
    ]);
    const metricsA = computeModuleCohesion(modules, graph).find((m) => m.moduleId === 'A')!;
    expect(metricsA.topDependencies).toHaveLength(2);
    // Both B and C have importCount 1
    const ids = metricsA.topDependencies.map((d) => d.moduleId);
    expect(ids).toContain('B');
    expect(ids).toContain('C');
  });

  it('detects misplaced files with high affinity to another module', () => {
    // File x.ts is in module A but imports heavily from module B
    const modules = [
      { id: 'A', files: [{ relativePath: 'a/x.ts' }, { relativePath: 'a/y.ts' }] },
      {
        id: 'B',
        files: [
          { relativePath: 'b/b1.ts' },
          { relativePath: 'b/b2.ts' },
          { relativePath: 'b/b3.ts' },
        ],
      },
    ];
    // x.ts imports from B (3 times) and 0 internal — affinity to B = 1.0 > 0.6
    const graph = makeGraph([
      { fromFile: 'a/x.ts', toFile: 'b/b1.ts', specifier: '../b/b1' },
      { fromFile: 'a/x.ts', toFile: 'b/b2.ts', specifier: '../b/b2' },
      { fromFile: 'a/x.ts', toFile: 'b/b3.ts', specifier: '../b/b3' },
    ]);
    const metricsA = computeModuleCohesion(modules, graph).find((m) => m.moduleId === 'A')!;
    expect(metricsA.misplacedFiles).toHaveLength(1);
    expect(metricsA.misplacedFiles[0].filePath).toBe('a/x.ts');
    expect(metricsA.misplacedFiles[0].bestModuleId).toBe('B');
    expect(metricsA.misplacedFiles[0].affinityScore).toBeGreaterThan(0.6);
  });

  it('does not flag files as misplaced when affinity is below threshold (0.6)', () => {
    const modules = [
      { id: 'A', files: [{ relativePath: 'a/x.ts' }, { relativePath: 'a/y.ts' }] },
      { id: 'B', files: [{ relativePath: 'b/b1.ts' }] },
    ];
    // x.ts: 2 internal, 1 external → affinity to B = 1/3 ≈ 0.33, below 0.6
    const graph = makeGraph([
      { fromFile: 'a/x.ts', toFile: 'a/y.ts', specifier: './y' },
      { fromFile: 'a/x.ts', toFile: 'a/y.ts', specifier: './y' }, // duplicate — same edge
      { fromFile: 'a/x.ts', toFile: 'b/b1.ts', specifier: '../b/b1' },
    ]);
    const metricsA = computeModuleCohesion(modules, graph).find((m) => m.moduleId === 'A')!;
    // Should not be flagged
    expect(metricsA.misplacedFiles).toHaveLength(0);
  });

  it('returns empty metrics array for empty modules list', () => {
    const graph = makeGraph([]);
    const metrics = computeModuleCohesion([], graph);
    expect(metrics).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Part 3: refineModuleAssignments
// ---------------------------------------------------------------------------

describe('refineModuleAssignments', () => {
  it('makes no movements when modules already have high internal cohesion', () => {
    const modules = [
      { id: 'A', files: [{ relativePath: 'a/x.ts' }, { relativePath: 'a/y.ts' }] },
      { id: 'B', files: [{ relativePath: 'b/z.ts' }, { relativePath: 'b/w.ts' }] },
    ];
    // Internal only — no cross-module edges
    const graph = makeGraph([
      { fromFile: 'a/x.ts', toFile: 'a/y.ts', specifier: './y' },
      { fromFile: 'b/z.ts', toFile: 'b/w.ts', specifier: './w' },
    ]);
    const result = refineModuleAssignments(modules, graph);
    expect(result.movements).toHaveLength(0);
  });

  it('seeds initial assignments from modules', () => {
    const modules = [
      { id: 'A', files: [{ relativePath: 'a/x.ts' }] },
      { id: 'B', files: [{ relativePath: 'b/y.ts' }] },
    ];
    const graph = makeGraph([]);
    const result = refineModuleAssignments(modules, graph);
    expect(result.assignments.get('A')?.has('a/x.ts')).toBe(true);
    expect(result.assignments.get('B')?.has('b/y.ts')).toBe(true);
  });

  it('converges immediately when graph has no edges', () => {
    const modules = [
      { id: 'A', files: [{ relativePath: 'a/x.ts' }, { relativePath: 'a/y.ts' }] },
    ];
    const graph = makeGraph([]);
    const result = refineModuleAssignments(modules, graph);
    expect(result.iterations).toBe(1);
    expect(result.movements).toHaveLength(0);
  });

  it('does not move barrel files (index.ts)', () => {
    const modules = [
      {
        id: 'A',
        files: [{ relativePath: 'a/index.ts' }, { relativePath: 'a/helper.ts' }],
      },
      {
        id: 'B',
        files: [
          { relativePath: 'b/b1.ts' },
          { relativePath: 'b/b2.ts' },
          { relativePath: 'b/b3.ts' },
          { relativePath: 'b/b4.ts' },
        ],
      },
    ];
    // index.ts has strong affinity to B — but should be skipped
    const graph = makeGraph([
      { fromFile: 'a/index.ts', toFile: 'b/b1.ts', specifier: '../b/b1' },
      { fromFile: 'a/index.ts', toFile: 'b/b2.ts', specifier: '../b/b2' },
      { fromFile: 'a/index.ts', toFile: 'b/b3.ts', specifier: '../b/b3' },
      { fromFile: 'a/index.ts', toFile: 'b/b4.ts', specifier: '../b/b4' },
    ]);
    const result = refineModuleAssignments(modules, graph, { moveThreshold: 0.6 });
    const movedPaths = result.movements.map((m) => m.filePath);
    expect(movedPaths).not.toContain('a/index.ts');
  });

  it('does not move a file if it is the last member of its module', () => {
    const modules = [
      { id: 'A', files: [{ relativePath: 'a/lone.ts' }] },
      {
        id: 'B',
        files: [
          { relativePath: 'b/b1.ts' },
          { relativePath: 'b/b2.ts' },
          { relativePath: 'b/b3.ts' },
          { relativePath: 'b/b4.ts' },
        ],
      },
    ];
    const graph = makeGraph([
      { fromFile: 'a/lone.ts', toFile: 'b/b1.ts', specifier: '../b/b1' },
      { fromFile: 'a/lone.ts', toFile: 'b/b2.ts', specifier: '../b/b2' },
      { fromFile: 'a/lone.ts', toFile: 'b/b3.ts', specifier: '../b/b3' },
      { fromFile: 'a/lone.ts', toFile: 'b/b4.ts', specifier: '../b/b4' },
    ]);
    const result = refineModuleAssignments(modules, graph, { moveThreshold: 0.6 });
    // Module A has only 1 file — can't be emptied
    expect(result.movements.map((m) => m.filePath)).not.toContain('a/lone.ts');
  });

  it('does not move a file to a module in a different top-level directory', () => {
    // 'src/widget.ts' (top-level: 'src') vs 'lib/utils.ts' (top-level: 'lib')
    // Cross-directory moves must be blocked
    const modules = [
      {
        id: 'srcMod',
        files: [{ relativePath: 'src/widget.ts' }, { relativePath: 'src/other.ts' }],
      },
      {
        id: 'libMod',
        files: [
          { relativePath: 'lib/u1.ts' },
          { relativePath: 'lib/u2.ts' },
          { relativePath: 'lib/u3.ts' },
        ],
      },
    ];
    const graph = makeGraph([
      { fromFile: 'src/widget.ts', toFile: 'lib/u1.ts', specifier: '../lib/u1' },
      { fromFile: 'src/widget.ts', toFile: 'lib/u2.ts', specifier: '../lib/u2' },
      { fromFile: 'src/widget.ts', toFile: 'lib/u3.ts', specifier: '../lib/u3' },
    ]);
    const result = refineModuleAssignments(modules, graph, { moveThreshold: 0.5 });
    expect(result.movements.map((m) => m.filePath)).not.toContain('src/widget.ts');
  });

  it('does not move a file with fewer than MIN_CONNECTIONS_FOR_MOVE (3) connections', () => {
    const modules = [
      { id: 'A', files: [{ relativePath: 'a/x.ts' }, { relativePath: 'a/y.ts' }] },
      {
        id: 'B',
        files: [
          { relativePath: 'b/b1.ts' },
          { relativePath: 'b/b2.ts' },
          { relativePath: 'b/b3.ts' },
        ],
      },
    ];
    // Only 2 connections — below the MIN threshold of 3
    const graph = makeGraph([
      { fromFile: 'a/x.ts', toFile: 'b/b1.ts', specifier: '../b/b1' },
      { fromFile: 'a/x.ts', toFile: 'b/b2.ts', specifier: '../b/b2' },
    ]);
    const result = refineModuleAssignments(modules, graph, { moveThreshold: 0.5 });
    expect(result.movements.map((m) => m.filePath)).not.toContain('a/x.ts');
  });

  it('respects maxIterations option', () => {
    const modules = [
      { id: 'A', files: [{ relativePath: 'a/x.ts' }, { relativePath: 'a/y.ts' }] },
    ];
    const graph = makeGraph([]);
    const result = refineModuleAssignments(modules, graph, { maxIterations: 3 });
    expect(result.iterations).toBeLessThanOrEqual(3);
  });

  it('returns all module assignments (including unmoved)', () => {
    const modules = [
      { id: 'A', files: [{ relativePath: 'a/x.ts' }] },
      { id: 'B', files: [{ relativePath: 'b/y.ts' }] },
    ];
    const graph = makeGraph([]);
    const result = refineModuleAssignments(modules, graph);
    expect(result.assignments.has('A')).toBe(true);
    expect(result.assignments.has('B')).toBe(true);
  });
});
