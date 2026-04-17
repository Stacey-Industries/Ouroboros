/**
 * useGraphLayout.test.ts — unit tests for the BFS hierarchical layout.
 *
 * Tests the pure computeLayout function directly (no React rendering needed).
 */

import { describe, expect, it } from 'vitest';

import type { RawGraphEdge, RawGraphNode } from '../../../types/electron-graph';
import { computeLayout } from './useGraphLayout';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNode(id: string): RawGraphNode {
  return { id, type: 'function', name: id, filePath: `/${id}.ts`, line: 1 };
}

function makeEdge(source: string, target: string): RawGraphEdge {
  return { source, target, type: 'calls' };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeLayout', () => {
  it('returns positioned nodes for each input node', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const { nodes: laid } = computeLayout(nodes, edges);
    expect(laid).toHaveLength(3);
    for (const n of laid) {
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
      expect(n.width).toBeGreaterThan(0);
      expect(n.height).toBeGreaterThan(0);
    }
  });

  it('assigns deeper layers to nodes further from roots', () => {
    const nodes = [makeNode('root'), makeNode('mid'), makeNode('leaf')];
    const edges = [makeEdge('root', 'mid'), makeEdge('mid', 'leaf')];
    const { nodes: laid } = computeLayout(nodes, edges);
    const byId = Object.fromEntries(laid.map((n) => [n.id, n]));
    expect(byId['root'].y).toBeLessThan(byId['mid'].y);
    expect(byId['mid'].y).toBeLessThan(byId['leaf'].y);
  });

  it('handles disconnected components (no edges)', () => {
    const nodes = [makeNode('x'), makeNode('y'), makeNode('z')];
    const { nodes: laid } = computeLayout(nodes, []);
    expect(laid).toHaveLength(3);
    // All disconnected nodes are placed at layer 0 (same y)
    const ys = new Set(laid.map((n) => n.y));
    expect(ys.size).toBe(1);
  });

  it('is deterministic — same input produces same output', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('c', 'd')];
    const first = computeLayout(nodes, edges);
    const second = computeLayout(nodes, edges);
    expect(first.nodes).toEqual(second.nodes);
    expect(first.edges).toEqual(second.edges);
  });

  it('passes edge metadata through as edgeType', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];
    const { edges: laid } = computeLayout(nodes, edges);
    expect(laid[0].edgeType).toBe('calls');
  });

  it('preserves node id and type from raw input', () => {
    const nodes: RawGraphNode[] = [
      { id: 'cls1', type: 'class', name: 'MyClass', filePath: '/cls.ts', line: 5 },
    ];
    const { nodes: laid } = computeLayout(nodes, []);
    expect(laid[0].id).toBe('cls1');
    expect(laid[0].type).toBe('class');
    expect(laid[0].name).toBe('MyClass');
  });

  it('handles empty input without throwing', () => {
    const { nodes, edges } = computeLayout([], []);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});
