/**
 * slotTree.ts — Wave 28 Phase C
 *
 * Binary tree model for split-slot layouts.
 *
 * - LeafSlot: a named slot region containing a component descriptor.
 * - SplitNode: a horizontal or vertical pair of child SlotNodes with an
 *   optional size ratio (0..1, default 0.5).
 *
 * All types are JSON-serialisable: no React refs, no functions. The tree can
 * be round-tripped via JSON.parse(JSON.stringify(tree)) without data loss.
 *
 * Helpers follow a purely functional style — no mutation.
 */

import type { ComponentDescriptor, SlotName } from './types';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface LeafSlot {
  kind: 'leaf';
  slotName: SlotName;
  component: ComponentDescriptor;
}

export interface SplitNode {
  kind: 'split';
  direction: 'horizontal' | 'vertical';
  /** Always exactly two children. */
  children: [SlotNode, SlotNode];
  /**
   * Size ratio of the first child relative to the container (0..1).
   * Default 0.5. Phase D/E will add resize handles to mutate this.
   */
  ratio?: number;
}

export type SlotNode = LeafSlot | SplitNode;

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

export function isLeaf(node: SlotNode): node is LeafSlot {
  return node.kind === 'leaf';
}

export function isSplit(node: SlotNode): node is SplitNode {
  return node.kind === 'split';
}

// ---------------------------------------------------------------------------
// Traversal helpers
// ---------------------------------------------------------------------------

/**
 * Map over every node in the tree, replacing each with the return value of fn.
 * fn receives the node and must return a SlotNode (can be a different kind).
 * Children are mapped bottom-up (leaves first).
 */
export function mapTree(node: SlotNode, fn: (n: SlotNode) => SlotNode): SlotNode {
  if (isLeaf(node)) return fn(node);
  const mapped: SplitNode = {
    ...node,
    children: [mapTree(node.children[0], fn), mapTree(node.children[1], fn)],
  };
  return fn(mapped);
}

/**
 * Find the first leaf matching the predicate via depth-first search.
 * Returns undefined if no match is found.
 */
export function findLeaf(
  node: SlotNode,
  predicate: (leaf: LeafSlot) => boolean,
): LeafSlot | undefined {
  if (isLeaf(node)) return predicate(node) ? node : undefined;
  return findLeaf(node.children[0], predicate) ?? findLeaf(node.children[1], predicate);
}

/**
 * Call fn for every leaf in the tree, left-to-right depth-first.
 */
export function traverseLeaves(node: SlotNode, fn: (leaf: LeafSlot) => void): void {
  if (isLeaf(node)) {
    fn(node);
    return;
  }
  traverseLeaves(node.children[0], fn);
  traverseLeaves(node.children[1], fn);
}

/**
 * Collect all leaves as an array, left-to-right.
 */
export function collectLeaves(node: SlotNode): LeafSlot[] {
  const leaves: LeafSlot[] = [];
  traverseLeaves(node, (l) => leaves.push(l));
  return leaves;
}
