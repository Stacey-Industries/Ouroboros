/**
 * slotTree.test.ts — Wave 28 Phase C
 *
 * Tests for the SlotNode binary tree data model and traversal helpers.
 */

import { describe, expect, it } from 'vitest';

import type { LeafSlot, SlotNode, SplitNode } from './slotTree';
import {
  collectLeaves,
  findLeaf,
  isLeaf,
  isSplit,
  mapTree,
  traverseLeaves,
} from './slotTree';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLeaf(slotName: 'editorContent' | 'terminalContent' | 'sidebarContent'): LeafSlot {
  return { kind: 'leaf', slotName, component: { componentKey: slotName } };
}

function makeSplit(
  a: SlotNode,
  b: SlotNode,
  direction: 'horizontal' | 'vertical' = 'horizontal',
  ratio?: number,
): SplitNode {
  return { kind: 'split', direction, children: [a, b], ...(ratio !== undefined ? { ratio } : {}) };
}

const leafA = makeLeaf('editorContent');
const leafB = makeLeaf('terminalContent');
const leafC = makeLeaf('sidebarContent');

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

describe('isLeaf / isSplit', () => {
  it('identifies a leaf correctly', () => {
    expect(isLeaf(leafA)).toBe(true);
    expect(isSplit(leafA)).toBe(false);
  });

  it('identifies a split correctly', () => {
    const split = makeSplit(leafA, leafB);
    expect(isSplit(split)).toBe(true);
    expect(isLeaf(split)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// JSON round-trip
// ---------------------------------------------------------------------------

describe('JSON round-trip', () => {
  it('preserves a leaf through stringify → parse', () => {
    const roundTripped = JSON.parse(JSON.stringify(leafA)) as LeafSlot;
    expect(roundTripped).toEqual(leafA);
    expect(roundTripped.kind).toBe('leaf');
    expect(roundTripped.slotName).toBe('editorContent');
  });

  it('preserves a deep split tree through stringify → parse', () => {
    const tree = makeSplit(makeSplit(leafA, leafB, 'vertical', 0.3), leafC, 'horizontal');
    const roundTripped = JSON.parse(JSON.stringify(tree)) as SplitNode;
    expect(roundTripped).toEqual(tree);
    expect(roundTripped.kind).toBe('split');
    expect((roundTripped.children[0] as SplitNode).ratio).toBe(0.3);
  });

  it('deep clone via JSON is independent (no shared references)', () => {
    const tree = makeSplit(leafA, leafB);
    const clone = JSON.parse(JSON.stringify(tree)) as SplitNode;
    // Mutating the clone should not affect original
    (clone.children[0] as LeafSlot).slotName = 'sidebarContent' as never;
    expect((tree.children[0] as LeafSlot).slotName).toBe('editorContent');
  });
});

// ---------------------------------------------------------------------------
// findLeaf
// ---------------------------------------------------------------------------

describe('findLeaf', () => {
  it('finds a leaf at root level', () => {
    const result = findLeaf(leafA, (l) => l.slotName === 'editorContent');
    expect(result).toBe(leafA);
  });

  it('finds a leaf deep in the tree', () => {
    const tree = makeSplit(makeSplit(leafA, leafB), leafC);
    const result = findLeaf(tree, (l) => l.slotName === 'terminalContent');
    expect(result).toBe(leafB);
  });

  it('returns undefined when no leaf matches', () => {
    const tree = makeSplit(leafA, leafB);
    const result = findLeaf(tree, (l) => l.slotName === 'sidebarContent');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// traverseLeaves / collectLeaves
// ---------------------------------------------------------------------------

describe('traverseLeaves', () => {
  it('visits leaves left-to-right in a flat split', () => {
    const visited: string[] = [];
    traverseLeaves(makeSplit(leafA, leafB), (l) => visited.push(l.slotName));
    expect(visited).toEqual(['editorContent', 'terminalContent']);
  });

  it('visits all leaves in a nested tree', () => {
    const tree = makeSplit(makeSplit(leafA, leafB), leafC);
    const visited: string[] = [];
    traverseLeaves(tree, (l) => visited.push(l.slotName));
    expect(visited).toEqual(['editorContent', 'terminalContent', 'sidebarContent']);
  });
});

describe('collectLeaves', () => {
  it('collects all leaves from a nested tree', () => {
    const tree = makeSplit(makeSplit(leafA, leafB, 'vertical'), leafC);
    const leaves = collectLeaves(tree);
    expect(leaves).toHaveLength(3);
    expect(leaves.map((l) => l.slotName)).toEqual([
      'editorContent',
      'terminalContent',
      'sidebarContent',
    ]);
  });
});

// ---------------------------------------------------------------------------
// mapTree
// ---------------------------------------------------------------------------

describe('mapTree', () => {
  it('maps leaf nodes without affecting splits', () => {
    const result = mapTree(leafA, (n) => {
      if (!isLeaf(n)) return n;
      return { ...n, component: { componentKey: 'replaced' } };
    });
    expect(isLeaf(result)).toBe(true);
    expect((result as LeafSlot).component.componentKey).toBe('replaced');
  });

  it('replaces a specific leaf deep in the tree', () => {
    const tree = makeSplit(leafA, leafB);
    const result = mapTree(tree, (n) => {
      if (!isLeaf(n) || n.slotName !== 'terminalContent') return n;
      return { ...n, component: { componentKey: 'swapped' } };
    });
    const leaves = collectLeaves(result);
    expect(leaves[1].component.componentKey).toBe('swapped');
    expect(leaves[0].component.componentKey).toBe('editorContent');
  });
});
