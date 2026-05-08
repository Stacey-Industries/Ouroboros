/**
 * traceEngineSupport.test.ts — Wave 85 Phase 2.
 *
 * Unit tests for the pure helper functions in traceEngineSupport.ts:
 * classifyLayer, detectStepKind, detectEdgeKind, processNode,
 * makeDepthCapStep, ensureMinimalContract.
 */

import { describe, expect, it } from 'vitest';

import type { FlowEdge, FlowStep } from '../../shared/types/flowTracer';
import type { BoundaryRegistry } from './boundaryRegistry';
import type { GraphPathNode, ProcessNodeOpts, TraceAccumulator } from './traceEngineSupport';
import {
  classifyLayer,
  detectEdgeKind,
  detectStepKind,
  ensureMinimalContract,
  makeDepthCapStep,
  processNode,
} from './traceEngineSupport';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function emptyRegistry(): BoundaryRegistry {
  return {
    ipcMainHandlers: new Map(),
    preloadBridge: new Map(),
    builtAt: Date.now(),
  };
}

function emptyAcc(): TraceAccumulator {
  return { steps: [], edges: [], visited: new Set(), depthCapHit: false };
}

function makeStep(
  id: string,
  layer: FlowStep['layer'],
  kind: FlowStep['kind'] = 'function',
): FlowStep {
  return { id, layer, symbol: id, file: '', line: 0, kind, narration: null };
}

// ─── classifyLayer ────────────────────────────────────────────────────────────

describe('classifyLayer', () => {
  it('returns main for null path', () => {
    expect(classifyLayer(null, 'anything')).toBe('main');
  });

  it('classifies src/main/ paths as main', () => {
    expect(classifyLayer('src/main/ipc-handlers/foo.ts', 'foo')).toBe('main');
  });

  it('classifies src/preload/ paths as preload', () => {
    expect(classifyLayer('src/preload/preload.ts', 'foo')).toBe('preload');
  });

  it('classifies src/renderer/ paths as renderer', () => {
    expect(classifyLayer('src/renderer/App.tsx', 'foo')).toBe('renderer');
  });

  it('classifies CLI symbols as cli regardless of path', () => {
    expect(classifyLayer('src/main/pty.ts', 'spawnClaude')).toBe('cli');
  });

  it('classifies pty paths as cli', () => {
    expect(classifyLayer('src/main/pty.ts', 'unknownFn')).toBe('cli');
  });
});

// ─── detectStepKind ──────────────────────────────────────────────────────────

describe('detectStepKind', () => {
  it('returns spawn for CLI symbols', () => {
    expect(detectStepKind('spawnClaude', 'src/main/pty.ts')).toBe('spawn');
  });

  it('returns fs for FS symbols', () => {
    expect(detectStepKind('readFile', 'src/main/files.ts')).toBe('fs');
  });

  it('returns ipc-bridge for preload paths', () => {
    expect(detectStepKind('traceFlow', 'src/preload/preloadSupplementalFlowTracerApis.ts')).toBe(
      'ipc-bridge',
    );
  });

  it('returns ipc-handler for handler-named symbols in main', () => {
    expect(detectStepKind('<handler:pty:spawn>', 'src/main/ipc-handlers/pty.ts')).toBe(
      'ipc-handler',
    );
  });

  it('returns function for regular symbols', () => {
    expect(detectStepKind('myFunction', 'src/main/util.ts')).toBe('function');
  });
});

// ─── detectEdgeKind ──────────────────────────────────────────────────────────

describe('detectEdgeKind', () => {
  it('returns sync for same-layer non-spawn steps', () => {
    const a = makeStep('a', 'main');
    const b = makeStep('b', 'main');
    expect(detectEdgeKind(a, b, emptyRegistry()).kind).toBe('sync');
  });

  it('returns async when either step is spawn', () => {
    const a = makeStep('a', 'main', 'spawn');
    const b = makeStep('b', 'main');
    expect(detectEdgeKind(a, b, emptyRegistry()).kind).toBe('async');
  });

  it('returns boundary for cross-layer steps', () => {
    const a = makeStep('a', 'renderer');
    const b = makeStep('b', 'main');
    const { kind } = detectEdgeKind(a, b, emptyRegistry());
    expect(kind).toBe('boundary');
  });

  it('populates boundaryChannel from registry bridge', () => {
    const reg = emptyRegistry();
    reg.preloadBridge.set('preload.myMethod', {
      channel: 'ns:myMethod',
      namespace: 'ns',
      method: 'myMethod',
    });
    const a = makeStep('a', 'renderer');
    const b = makeStep('myMethod', 'preload', 'ipc-bridge');
    const { boundaryChannel } = detectEdgeKind(a, b, reg);
    expect(boundaryChannel).toBe('ns:myMethod');
  });

  it('populates boundaryChannel from ipcMainHandlers for handler steps', () => {
    const reg = emptyRegistry();
    reg.ipcMainHandlers.set('foo:bar', {
      handlerSymbol: 'fooHandler',
      handlerFile: 'src/main/handlers.ts',
      handlerLine: 1,
    });
    const a = makeStep('a', 'preload');
    const b = makeStep('fooHandler', 'main', 'ipc-handler');
    b.file = 'src/main/handlers.ts';
    const { boundaryChannel } = detectEdgeKind(a, b, reg);
    expect(boundaryChannel).toBe('foo:bar');
  });
});

// ─── makeDepthCapStep ─────────────────────────────────────────────────────────

describe('makeDepthCapStep', () => {
  it('creates a step and edge with correct ids', () => {
    const { step, edge } = makeDepthCapStep('parent-1');
    expect(step.id).toBe('depth-cap-parent-1');
    expect(edge.from).toBe('parent-1');
    expect(edge.to).toBe('depth-cap-parent-1');
  });

  it('step symbol contains depth-cap text', () => {
    const { step } = makeDepthCapStep('x');
    expect(step.symbol).toContain('depth limit reached');
  });
});

// ─── processNode ─────────────────────────────────────────────────────────────

describe('processNode', () => {
  function makeOpts(partial: Partial<ProcessNodeOpts> & { node: GraphPathNode }): ProcessNodeOpts {
    return {
      index: 0,
      maxDepth: 6,
      registry: emptyRegistry(),
      cycleRef: { count: 0 },
      ...partial,
    };
  }

  it('adds a step and returns true on normal node', () => {
    const acc = emptyAcc();
    const node: GraphPathNode = { name: 'foo', filePath: 'src/main/foo.ts', startLine: 1 };
    const cont = processNode(acc, makeOpts({ node }));
    expect(cont).toBe(true);
    expect(acc.steps.length).toBe(1);
    expect(acc.steps[0]?.symbol).toBe('foo');
  });

  it('adds edge between consecutive nodes', () => {
    const acc = emptyAcc();
    const reg = emptyRegistry();
    const n1: GraphPathNode = { name: 'a', filePath: 'src/main/a.ts' };
    const n2: GraphPathNode = { name: 'b', filePath: 'src/main/b.ts' };
    processNode(acc, makeOpts({ node: n1, index: 0, registry: reg }));
    processNode(acc, makeOpts({ node: n2, index: 1, registry: reg }));
    expect(acc.edges.length).toBe(1);
  });

  it('returns false and sets depthCapHit when depth >= maxDepth', () => {
    const acc = emptyAcc();
    acc.steps.push(makeStep('prev', 'main'));
    const node: GraphPathNode = { name: 'deep', depth: 6 };
    const cont = processNode(acc, makeOpts({ node, maxDepth: 6 }));
    expect(cont).toBe(false);
    expect(acc.depthCapHit).toBe(true);
    expect(acc.steps.some((s) => s.symbol.includes('depth limit'))).toBe(true);
  });

  it('detects cycles and gives unique step ids', () => {
    const acc = emptyAcc();
    const cycleRef = { count: 0 };
    const node: GraphPathNode = { id: 'shared-id', name: 'fn' };
    processNode(acc, makeOpts({ node, index: 0, cycleRef }));
    processNode(acc, makeOpts({ node, index: 1, cycleRef }));
    const ids = acc.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(ids[1]).toContain('#cycle');
  });
});

// ─── ensureMinimalContract ────────────────────────────────────────────────────

describe('ensureMinimalContract', () => {
  const entry = { symbol: 'myHandler', file: 'src/main/handlers.ts', line: 1 };

  it('adds a renderer stub when steps span only one layer', () => {
    const steps: FlowStep[] = [makeStep('s1', 'main', 'ipc-handler')];
    const edges: FlowEdge[] = [];
    ensureMinimalContract(entry, steps, edges, emptyRegistry());
    const layers = new Set(steps.map((s) => s.layer));
    expect(layers.size).toBeGreaterThanOrEqual(2);
    expect(edges.some((e) => e.kind === 'boundary')).toBe(true);
  });

  it('adds entry step when steps array is empty', () => {
    const steps: FlowStep[] = [];
    const edges: FlowEdge[] = [];
    ensureMinimalContract(entry, steps, edges, emptyRegistry());
    expect(steps.length).toBeGreaterThanOrEqual(1);
  });

  it('does not modify already-compliant steps', () => {
    const steps: FlowStep[] = [makeStep('r', 'renderer'), makeStep('m', 'main')];
    const edges: FlowEdge[] = [{ from: 'r', to: 'm', kind: 'boundary', boundaryChannel: 'x:y' }];
    const originalLen = steps.length;
    ensureMinimalContract(entry, steps, edges, emptyRegistry());
    expect(steps.length).toBe(originalLen);
  });
});
