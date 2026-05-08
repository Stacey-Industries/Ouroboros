/**
 * traceEngine.ts — Wave 85 Phase 2.
 *
 * Public API: traceFlow(entry, opts) → Promise<FlowTrace>.
 *
 * Resolves arbitrary IPC entry-point symbols into a FlowTrace by walking the
 * codebase-memory graph (Layer 1 static call chain), detecting boundary
 * patterns (Layer 2), resolving IPC bridge crossings (Layer 3), and tagging
 * async edges (Layer 4). Falls back to the walking-skeleton stub when the
 * graph is unavailable (test environment or pre-first-index).
 *
 * Helper logic lives in traceEngineSupport.ts (kept there to satisfy the
 * 40-line / complexity-10 per-function ESLint limits).
 * Fallback data lives in traceEngineFallback.ts.
 *
 * Per Decision 9 (wave-85-decisions.md): depth-limited to
 * flowTracer.maxDepth (default 6, range 3-12).
 */

import type { FlowEdge, FlowStep, FlowTrace, SymbolRef } from '../../shared/types/flowTracer';
import type { GraphControllerLike } from '../codebaseGraph/graphControllerSupport';
import { getGraphController } from '../codebaseGraph/graphControllerSupport';
import { getConfigValue } from '../config';
import log from '../logger';
import type { BoundaryRegistry } from './boundaryRegistry';
import { getBoundaryRegistry } from './boundaryRegistry';
import { getWalkingSkeletonFallback } from './traceEngineFallback';
import type { GraphPathNode, TraceAccumulator } from './traceEngineSupport';
import { ensureMinimalContract, processNode } from './traceEngineSupport';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_DEPTH = 6;

// ─── Config ───────────────────────────────────────────────────────────────────

function resolveMaxDepth(): number {
  try {
    const cfg = getConfigValue('flowTracer');
    const d = cfg?.maxDepth;
    if (typeof d === 'number' && d >= 3 && d <= 12) return d;
  } catch {
    // config not available in test environment — use default
  }
  return DEFAULT_MAX_DEPTH;
}

// ─── Graph trace ──────────────────────────────────────────────────────────────

function buildSingleEntryTrace(entry: SymbolRef): { steps: FlowStep[]; edges: FlowEdge[] } {
  return {
    steps: [
      {
        id: 'entry-0',
        layer: 'main',
        symbol: entry.symbol,
        file: entry.file,
        line: entry.line,
        kind: 'ipc-handler',
        narration: null,
      },
    ],
    edges: [],
  };
}

function buildSteps(
  nodes: GraphPathNode[],
  maxDepth: number,
  registry: BoundaryRegistry,
): { steps: FlowStep[]; edges: FlowEdge[]; depthCapHit: boolean } {
  const acc: TraceAccumulator = {
    steps: [],
    edges: [],
    visited: new Set(),
    depthCapHit: false,
  };
  const cycleRef = { count: 0 };
  let i = 0;
  for (const node of nodes) {
    const cont = processNode(acc, {
      node: node as GraphPathNode,
      index: i,
      maxDepth,
      registry,
      cycleRef,
    });
    i += 1;
    if (!cont) break;
  }
  return { steps: acc.steps, edges: acc.edges, depthCapHit: acc.depthCapHit };
}

async function traceWithGraph(
  entry: SymbolRef,
  maxDepth: number,
  ctrl: GraphControllerLike,
  registry: BoundaryRegistry,
): Promise<{ steps: FlowStep[]; edges: FlowEdge[]; depthCapHit: boolean }> {
  const result = ctrl.traceCallPath(entry.symbol, '', maxDepth);
  const nodes = (result?.path as GraphPathNode[] | undefined) ?? [];
  if (nodes.length === 0) {
    const single = buildSingleEntryTrace(entry);
    return { steps: single.steps, edges: single.edges, depthCapHit: false };
  }
  return buildSteps(nodes, maxDepth, registry);
}

// ─── Graph version string ─────────────────────────────────────────────────────

function graphVersionString(ctrl: GraphControllerLike): string {
  try {
    const status = ctrl.getStatus();
    return status?.nodeCount ? `nodes:${status.nodeCount}` : 'graph';
  } catch {
    return 'graph';
  }
}

// ─── Fallback path ────────────────────────────────────────────────────────────

function getFallbackTrace(
  entry: SymbolRef,
  reason: string,
): { steps: FlowStep[]; edges: FlowEdge[]; depthCapHit: boolean; graphVersion: string } {
  log.info(`[traceEngine] ${reason} — using walking-skeleton fallback`);
  const fb = getWalkingSkeletonFallback(entry);
  return {
    steps: fb.steps,
    edges: fb.edges,
    depthCapHit: false,
    graphVersion: `fallback:${reason}`,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function traceFlow(
  entry: SymbolRef,
  opts: { maxDepth?: number } = {},
): Promise<FlowTrace> {
  const maxDepth = opts.maxDepth ?? resolveMaxDepth();
  const ctrl = getGraphController();
  const registry = await getBoundaryRegistry();

  let steps: FlowStep[], edges: FlowEdge[], depthCapHit: boolean, graphVersion: string;

  if (!ctrl) {
    ({ steps, edges, depthCapHit, graphVersion } = getFallbackTrace(entry, 'no-graph'));
  } else {
    try {
      const traced = await traceWithGraph(entry, maxDepth, ctrl, registry);
      steps = traced.steps;
      edges = traced.edges;
      depthCapHit = traced.depthCapHit;
      graphVersion = graphVersionString(ctrl);
    } catch (err) {
      log.warn('[traceEngine] graph trace error:', err);
      ({ steps, edges, depthCapHit, graphVersion } = getFallbackTrace(entry, 'graph-error'));
    }
  }

  ensureMinimalContract(entry, steps, edges, registry);

  const distinctLayers = new Set(steps.map((s) => s.layer));
  const boundaryEdges = edges.filter((e) => e.kind === 'boundary');

  return {
    id: `trace-${entry.symbol}-${Date.now()}`,
    title: `Trace: ${entry.symbol}`,
    entryPoint: entry,
    steps,
    edges,
    generatedAt: Date.now(),
    graphVersion,
    metadata: {
      layerCount: distinctLayers.size,
      boundaryCount: boundaryEdges.length,
      depthCapHit,
    },
  };
}
