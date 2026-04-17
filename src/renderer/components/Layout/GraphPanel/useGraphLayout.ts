/**
 * useGraphLayout.ts — deterministic BFS hierarchical layout for graph nodes.
 *
 * Takes raw nodes + edges from the IPC layer and returns positioned
 * LaidOutNode[] + LaidOutEdge[]. Memoised via useMemo so the layout only
 * recomputes when the input data reference changes.
 */

import { useMemo } from 'react';

import type { RawGraphEdge, RawGraphNode } from '../../../types/electron-graph';
import type { LaidOutEdge, LaidOutNode } from './GraphPanelTypes';
import { LAYER_GAP_Y, NODE_HEIGHT, NODE_WIDTH, SIBLING_GAP_X } from './GraphPanelTypes';

// ── BFS layer assignment ──────────────────────────────────────────────────────

function buildAdjacency(edges: RawGraphEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push(edge.target);
  }
  return adj;
}

function seedRoots(nodeIds: string[], adj: Map<string, string[]>): { layers: Map<string, number>; queue: string[] } {
  const hasIncoming = new Set([...adj.values()].flat());
  const layers = new Map<string, number>();
  const queue: string[] = [];
  for (const id of nodeIds) {
    if (!hasIncoming.has(id)) { layers.set(id, 0); queue.push(id); }
  }
  return { layers, queue };
}

function bfsLayers(adj: Map<string, string[]>, layers: Map<string, number>, queue: string[]): void {
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentLayer = layers.get(current) ?? 0;
    for (const neighbour of adj.get(current) ?? []) {
      const proposed = currentLayer + 1;
      if ((layers.get(neighbour) ?? -1) < proposed) {
        layers.set(neighbour, proposed);
        queue.push(neighbour);
      }
    }
  }
}

function assignLayers(nodeIds: string[], adj: Map<string, string[]>): Map<string, number> {
  const { layers, queue } = seedRoots(nodeIds, adj);
  bfsLayers(adj, layers, queue);
  for (const id of nodeIds) { if (!layers.has(id)) layers.set(id, 0); }
  return layers;
}

// ── Position computation ──────────────────────────────────────────────────────

function groupByLayer(nodes: RawGraphNode[], layers: Map<string, number>): Map<number, string[]> {
  const byLayer = new Map<number, string[]>();
  for (const node of nodes) {
    const layer = layers.get(node.id) ?? 0;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(node.id);
  }
  return byLayer;
}

function computePositions(nodes: RawGraphNode[], layers: Map<string, number>): Map<string, { x: number; y: number }> {
  const byLayer = groupByLayer(nodes, layers);
  const positions = new Map<string, { x: number; y: number }>();
  const stride = NODE_WIDTH + SIBLING_GAP_X;
  for (const [layer, ids] of byLayer) {
    const startX = -(ids.length * stride - SIBLING_GAP_X) / 2;
    ids.forEach((id, i) => {
      positions.set(id, { x: startX + i * stride, y: layer * (NODE_HEIGHT + LAYER_GAP_Y) });
    });
  }
  return positions;
}

// ── Public layout function (pure — usable outside React) ─────────────────────

export interface GraphLayoutResult {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
}

export function computeLayout(rawNodes: RawGraphNode[], rawEdges: RawGraphEdge[]): GraphLayoutResult {
  const adj = buildAdjacency(rawEdges);
  const layers = assignLayers(rawNodes.map((n) => n.id), adj);
  const positions = computePositions(rawNodes, layers);

  const nodes: LaidOutNode[] = rawNodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    return { id: n.id, type: n.type, name: n.name, filePath: n.filePath, x: pos.x, y: pos.y, width: NODE_WIDTH, height: NODE_HEIGHT };
  });
  const edges: LaidOutEdge[] = rawEdges.map((e) => ({ source: e.source, target: e.target, edgeType: e.type }));

  return { nodes, edges };
}

// ── React hook wrapper ────────────────────────────────────────────────────────

export function useGraphLayout(rawNodes: RawGraphNode[], rawEdges: RawGraphEdge[]): GraphLayoutResult {
  return useMemo(() => computeLayout(rawNodes, rawEdges), [rawNodes, rawEdges]);
}
