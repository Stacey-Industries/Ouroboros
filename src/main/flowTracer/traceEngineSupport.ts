/**
 * traceEngineSupport.ts — Wave 85 Phase 2.
 *
 * Helper types and functions extracted from traceEngine.ts to keep both
 * files under the ESLint max-lines-per-function (40) and complexity (10)
 * limits. Not part of the public API — import from traceEngine.ts instead.
 */

import type { FlowEdge, FlowStep, LayerKind, SymbolRef } from '../../shared/types/flowTracer';
import type { BoundaryRegistry } from './boundaryRegistry';

// ─── Layer classification ─────────────────────────────────────────────────────

const MAIN_PREFIXES = ['src/main/', 'src\\main\\'];
const PRELOAD_PREFIXES = ['src/preload/', 'src\\preload\\'];
const RENDERER_PREFIXES = ['src/renderer/', 'src\\renderer\\'];

export const CLI_SYMBOLS = new Set(['spawnClaude', 'spawnCodex', 'spawn', 'execFile', 'fork']);

export const FS_SYMBOLS = new Set([
  'writeFile',
  'readFile',
  'readFileSync',
  'writeFileSync',
  'mkdir',
  'unlink',
]);

export function classifyLayer(filePath: string | null, symbol: string): LayerKind {
  if (!filePath) return 'main';
  if (PRELOAD_PREFIXES.some((p) => filePath.startsWith(p))) return 'preload';
  if (RENDERER_PREFIXES.some((p) => filePath.startsWith(p))) return 'renderer';
  if (CLI_SYMBOLS.has(symbol)) return 'cli';
  if (filePath.includes('pty') || filePath.includes('spawn')) return 'cli';
  if (MAIN_PREFIXES.some((p) => filePath.startsWith(p))) return 'main';
  return 'main';
}

export function detectStepKind(symbol: string, filePath: string | null): FlowStep['kind'] {
  if (CLI_SYMBOLS.has(symbol)) return 'spawn';
  if (FS_SYMBOLS.has(symbol)) return 'fs';
  if (PRELOAD_PREFIXES.some((p) => (filePath ?? '').startsWith(p))) return 'ipc-bridge';
  if (symbol.startsWith('<handler:') || symbol.includes('Handler')) return 'ipc-handler';
  return 'function';
}

// ─── Boundary channel resolution ─────────────────────────────────────────────

function channelFromBridge(toStep: FlowStep, registry: BoundaryRegistry): string | null {
  const bridge = registry.preloadBridge.get(`${toStep.layer}.${toStep.symbol}`);
  if (bridge) return bridge.channel;

  for (const entry of registry.preloadBridge.values()) {
    if (entry.method === toStep.symbol || entry.channel.includes(toStep.symbol)) {
      return entry.channel;
    }
  }
  return null;
}

function channelFromHandler(toStep: FlowStep, registry: BoundaryRegistry): string | null {
  for (const [channel, handler] of registry.ipcMainHandlers) {
    if (handler.handlerFile === toStep.file) return channel;
  }
  return null;
}

export function detectEdgeKind(
  fromStep: FlowStep,
  toStep: FlowStep,
  registry: BoundaryRegistry,
): { kind: FlowEdge['kind']; boundaryChannel?: string } {
  if (fromStep.layer === toStep.layer) {
    const isAsync = toStep.kind === 'spawn' || fromStep.kind === 'spawn';
    return { kind: isAsync ? 'async' : 'sync' };
  }

  const channel =
    channelFromBridge(toStep, registry) ??
    (toStep.kind === 'ipc-handler' ? channelFromHandler(toStep, registry) : null) ??
    `${fromStep.layer}→${toStep.layer}`;

  return { kind: 'boundary', boundaryChannel: channel };
}

// ─── Step building ────────────────────────────────────────────────────────────

export interface GraphPathNode {
  id?: string;
  name?: string;
  filePath?: string | null;
  startLine?: number | null;
  depth?: number;
}

export interface TraceAccumulator {
  steps: FlowStep[];
  edges: FlowEdge[];
  visited: Set<string>;
  depthCapHit: boolean;
}

export function makeDepthCapStep(parentStepId: string): { step: FlowStep; edge: FlowEdge } {
  const id = `depth-cap-${parentStepId}`;
  const step: FlowStep = {
    id,
    layer: 'main',
    symbol: '→ continues, depth limit reached',
    file: '',
    line: 0,
    kind: 'function',
    narration: null,
  };
  return { step, edge: { from: parentStepId, to: id, kind: 'sync' } };
}

function resolveStepId(
  nodeId: string,
  index: number,
  acc: TraceAccumulator,
  cycleRef: { count: number },
): string {
  if (!acc.visited.has(nodeId)) {
    acc.visited.add(nodeId);
    return `step-${index}`;
  }
  cycleRef.count += 1;
  return `${nodeId}#cycle${cycleRef.count}`;
}

function appendEdge(
  prevStep: FlowStep,
  step: FlowStep,
  acc: TraceAccumulator,
  registry: BoundaryRegistry,
): void {
  const { kind, boundaryChannel } = detectEdgeKind(prevStep, step, registry);
  acc.edges.push({ from: prevStep.id, to: step.id, kind, boundaryChannel });
}

export interface ProcessNodeOpts {
  node: GraphPathNode;
  index: number;
  maxDepth: number;
  registry: BoundaryRegistry;
  cycleRef: { count: number };
}

function appendDepthCap(acc: TraceAccumulator): void {
  const lastStep = acc.steps.at(-1);
  if (!lastStep) return;
  const { step, edge } = makeDepthCapStep(lastStep.id);
  acc.steps.push(step);
  acc.edges.push(edge);
}

function buildStep(
  node: GraphPathNode,
  index: number,
  acc: TraceAccumulator,
  cycleRef: { count: number },
): FlowStep {
  const nodeId = node.id ?? node.name ?? `node-${index}`;
  const symbol = node.name ?? nodeId;
  return {
    id: resolveStepId(nodeId, index, acc, cycleRef),
    layer: classifyLayer(node.filePath ?? null, symbol),
    symbol,
    file: node.filePath ?? '',
    line: node.startLine ?? 0,
    kind: detectStepKind(symbol, node.filePath ?? null),
    narration: null,
  };
}

/** Returns false when the caller should stop iterating (depth cap reached). */
export function processNode(acc: TraceAccumulator, opts: ProcessNodeOpts): boolean {
  const { node, index, maxDepth, registry, cycleRef } = opts;
  if ((node.depth ?? index) >= maxDepth) {
    acc.depthCapHit = true;
    appendDepthCap(acc);
    return false;
  }
  const step = buildStep(node, index, acc, cycleRef);
  acc.steps.push(step);
  const prevStep = acc.steps.at(-2);
  if (prevStep) appendEdge(prevStep, step, acc, registry);
  return true;
}

// ─── Minimal-contract enforcement ────────────────────────────────────────────

function addRendererStubStep(
  entry: SymbolRef,
  steps: FlowStep[],
  edges: FlowEdge[],
  registry: BoundaryRegistry,
): void {
  const rendererStep: FlowStep = {
    id: 'renderer-stub',
    layer: 'renderer',
    symbol: `window.electronAPI.${entry.symbol}`,
    file: 'src/renderer',
    line: 0,
    kind: 'ipc-bridge',
    narration: null,
  };

  const mainStep = steps[0];
  let boundaryChannel = `→${entry.symbol}`;
  if (mainStep) {
    for (const [ch, handler] of registry.ipcMainHandlers) {
      if (handler.handlerFile === mainStep.file) {
        boundaryChannel = ch;
        break;
      }
    }
  }

  steps.unshift(rendererStep);
  edges.unshift({
    from: 'renderer-stub',
    to: mainStep?.id ?? 'entry-fallback',
    kind: 'boundary',
    boundaryChannel,
  });
}

export function ensureMinimalContract(
  entry: SymbolRef,
  steps: FlowStep[],
  edges: FlowEdge[],
  registry: BoundaryRegistry,
): void {
  if (steps.length < 1) {
    steps.push({
      id: 'entry-fallback',
      layer: classifyLayer(entry.file, entry.symbol),
      symbol: entry.symbol,
      file: entry.file,
      line: entry.line,
      kind: 'ipc-handler',
      narration: null,
    });
  }

  const multiLayer = new Set(steps.map((s) => s.layer)).size >= 2;
  const hasBoundary = edges.some((e) => e.kind === 'boundary');
  if (!multiLayer || !hasBoundary) {
    addRendererStubStep(entry, steps, edges, registry);
  }
}
