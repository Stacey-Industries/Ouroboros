/**
 * graphHandlersNeighbourhood.ts — IPC handlers for graph neighbourhood + blast-radius.
 *
 * Extracted from graphHandlers.ts to stay under the 300-line ESLint limit.
 * Registers: graph:getNeighbourhood, graph:getBlastRadius.
 *
 * Reuses existing DB helpers: bfsTraversal, getNode, getNodeDegree from
 * GraphDatabase — no graph traversal is re-implemented here.
 */

import { ipcMain } from 'electron';

import type {
  GraphBlastRadiusResult,
  GraphNeighbourhoodResult,
} from '../../renderer/types/electron-graph';
import type { CompatHandle } from '../codebaseGraph/graphControllerCompat';
import { toSystem1GraphNode } from '../codebaseGraph/graphControllerCompatAdapters';
import { getGraphController } from '../codebaseGraph/graphControllerSupport';
import type { GraphDatabase } from '../codebaseGraph/graphDatabase';
import type { GraphNode } from '../codebaseGraph/graphDatabaseTypes';

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];

const GRAPH_NOT_INIT = { success: false as const, error: 'Graph not initialized' };
const CAP = 50;
const CRITICAL_CALLER_THRESHOLD = 5;
const HIGH_CALLER_THRESHOLD = 2;

function reg(channels: ChannelList, channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

// ─── Criticality ──────────────────────────────────────────────────────────────

function classifyCriticality(
  node: GraphNode,
  inDegree: number,
): 'critical' | 'high' | 'medium' | 'low' {
  const label = node.label as string;
  if (inDegree >= CRITICAL_CALLER_THRESHOLD) return 'critical';
  if (inDegree >= HIGH_CALLER_THRESHOLD) return 'high';
  if (label === 'Function' || label === 'Method' || label === 'Class') return 'medium';
  return 'low';
}

// ─── Resolve symbol node ──────────────────────────────────────────────────────

function resolveNode(db: GraphDatabase, projectName: string, symbolId: string): GraphNode | null {
  const direct = db.getNode(symbolId);
  if (direct) return direct;
  if (!symbolId.includes('::')) return null;
  const name = symbolId.split('::')[1] ?? '';
  const result = db.searchNodes({ project: projectName, namePattern: name, caseSensitive: true, limit: 10 });
  return result.nodes.find((n) => n.name === name) ?? null;
}

// ─── BFS helpers ──────────────────────────────────────────────────────────────

interface BfsArgs {
  db: GraphDatabase;
  startId: string;
  edgeTypes: string[];
  direction: 'outbound' | 'inbound';
  depth: number;
}

function collectBfsNodes(args: BfsArgs): GraphNode[] {
  const { db, startId, edgeTypes, direction, depth } = args;
  const bfsRows = db.bfsTraversal({ startNodeId: startId, edgeTypes, direction, maxDepth: depth, maxNodes: CAP });
  const nodes: GraphNode[] = [];
  for (const row of bfsRows) {
    const node = db.getNode(row.id);
    if (node) nodes.push(node);
    if (nodes.length >= CAP) break;
  }
  return nodes;
}

// ─── Neighbourhood build ──────────────────────────────────────────────────────

const CALL_TYPES = ['CALLS', 'ASYNC_CALLS', 'HTTP_CALLS'];
const IMPORT_TYPES = ['IMPORTS'];

function buildNeighbourhood(handle: CompatHandle, symbolId: string, depth: number): GraphNeighbourhoodResult {
  const { db, projectName } = handle;
  const node = resolveNode(db, projectName, symbolId);
  if (!node) return { success: false, error: `Symbol not found: ${symbolId}` };
  const callerNodes = collectBfsNodes({ db, startId: node.id, edgeTypes: CALL_TYPES, direction: 'inbound', depth });
  const calleeNodes = collectBfsNodes({ db, startId: node.id, edgeTypes: CALL_TYPES, direction: 'outbound', depth });
  const importNodes = collectBfsNodes({ db, startId: node.id, edgeTypes: IMPORT_TYPES, direction: 'inbound', depth });
  return {
    success: true,
    symbol: toSystem1GraphNode(node),
    callers: callerNodes.map(toSystem1GraphNode),
    callees: calleeNodes.map(toSystem1GraphNode),
    imports: importNodes.map(toSystem1GraphNode),
  };
}

// ─── Blast-radius build ───────────────────────────────────────────────────────

const BLAST_EDGE_TYPES = ['CALLS', 'ASYNC_CALLS', 'HTTP_CALLS', 'USAGE', 'IMPORTS'];

function buildBlastRadius(handle: CompatHandle, symbolId: string, depth: number): GraphBlastRadiusResult {
  const { db, projectName } = handle;
  const node = resolveNode(db, projectName, symbolId);
  if (!node) return { success: false, error: `Symbol not found: ${symbolId}` };
  const bfsRows = db.bfsTraversal({ startNodeId: node.id, edgeTypes: BLAST_EDGE_TYPES, direction: 'inbound', maxDepth: depth, maxNodes: CAP });
  const affectedSymbols = bfsRows
    .map((row) => {
      const affectedNode = db.getNode(row.id);
      if (!affectedNode) return null;
      const inDegree = db.getNodeDegree(row.id, undefined, 'in');
      return { node: toSystem1GraphNode(affectedNode), distance: row.depth, criticality: classifyCriticality(affectedNode, inDegree) };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  return { success: true, symbol: toSystem1GraphNode(node), affectedSymbols };
}

// ─── Compat handle accessor ───────────────────────────────────────────────────

function getCompatHandle(ctrl: ReturnType<typeof getGraphController>): CompatHandle | null {
  if (!ctrl) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing compat internal handle field
  return (ctrl as any).handle ?? null;
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerGraphNeighbourhoodChannels(channels: ChannelList): void {
  reg(channels, 'graph:getNeighbourhood', async (_event, symbolId: string, depth: number = 1) => {
    const ctrl = getGraphController();
    if (!ctrl) return GRAPH_NOT_INIT;
    const handle = getCompatHandle(ctrl);
    if (!handle) return { success: false, error: 'Graph handle not available' };
    return buildNeighbourhood(handle, symbolId, Math.min(Math.max(depth, 1), 3));
  });
  reg(channels, 'graph:getBlastRadius', async (_event, symbolId: string, depth: number = 2) => {
    const ctrl = getGraphController();
    if (!ctrl) return GRAPH_NOT_INIT;
    const handle = getCompatHandle(ctrl);
    if (!handle) return { success: false, error: 'Graph handle not available' };
    return buildBlastRadius(handle, symbolId, Math.min(Math.max(depth, 1), 5));
  });
}
