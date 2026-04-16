/**
 * splitSlot.ts — Wave 28 Phase C
 *
 * Pure functions that mutate the SlotNode tree for split/remove/replace operations.
 *
 * All functions are immutable — they return new trees without modifying inputs.
 * All functions are ≤ 40 lines; recursion is used for tree traversal.
 */

import type { LeafSlot, SlotNode, SplitNode } from './slotTree';
import { isLeaf } from './slotTree';
import type { SlotName } from './types';

// ---------------------------------------------------------------------------
// replaceLeaf
// ---------------------------------------------------------------------------

/**
 * Replace the first leaf matching slotName with newLeaf.
 * Returns the original tree if no matching leaf is found.
 */
export function replaceLeaf(tree: SlotNode, slotName: SlotName, newLeaf: LeafSlot): SlotNode {
  if (isLeaf(tree)) {
    return tree.slotName === slotName ? newLeaf : tree;
  }
  const left = replaceLeaf(tree.children[0], slotName, newLeaf);
  const right = replaceLeaf(tree.children[1], slotName, newLeaf);
  if (left === tree.children[0] && right === tree.children[1]) return tree;
  return { ...tree, children: [left, right] };
}

// ---------------------------------------------------------------------------
// removeLeaf
// ---------------------------------------------------------------------------

/**
 * Remove the leaf matching slotName from the tree.
 * When a SplitNode loses one child, the remaining sibling collapses up.
 * Returns null if the root itself was the matching leaf.
 */
export function removeLeaf(tree: SlotNode, slotName: SlotName): SlotNode | null {
  if (isLeaf(tree)) {
    return tree.slotName === slotName ? null : tree;
  }
  const left = removeLeaf(tree.children[0], slotName);
  const right = removeLeaf(tree.children[1], slotName);
  if (left === null) return right;
  if (right === null) return left;
  if (left === tree.children[0] && right === tree.children[1]) return tree;
  return { ...tree, children: [left, right] };
}

// ---------------------------------------------------------------------------
// splitLeafWith
// ---------------------------------------------------------------------------

export interface SplitLeafOptions {
  tree: SlotNode;
  targetSlot: SlotName;
  source: LeafSlot;
  direction: 'horizontal' | 'vertical';
  /** 'start' places source before the target; 'end' places source after. */
  position: 'start' | 'end';
}

/**
 * Find the leaf matching targetSlot and replace it with a SplitNode
 * containing the original leaf and the source in the order given by position.
 * Returns the original tree if targetSlot is not found.
 */
export function splitLeafWith(opts: SplitLeafOptions): SlotNode {
  const { tree, targetSlot, source, direction, position } = opts;

  if (isLeaf(tree)) {
    if (tree.slotName !== targetSlot) return tree;
    const children: [SlotNode, SlotNode] =
      position === 'start' ? [source, tree] : [tree, source];
    const split: SplitNode = { kind: 'split', direction, children };
    return split;
  }

  const left = splitLeafWith({ ...opts, tree: tree.children[0] });
  const right = splitLeafWith({ ...opts, tree: tree.children[1] });
  if (left === tree.children[0] && right === tree.children[1]) return tree;
  return { ...tree, children: [left, right] };
}

// ---------------------------------------------------------------------------
// unsplitIfOrphan
// ---------------------------------------------------------------------------

/**
 * Collapse any SplitNode that has fewer than 2 live leaf descendants.
 * A SplitNode with one child is replaced by that child.
 * A SplitNode with zero children is replaced by null (caller handles).
 *
 * This is applied after removeLeaf to clean up degenerate splits.
 */
function collapseNode(node: SlotNode): SlotNode | null {
  if (isLeaf(node)) return node;
  const left = collapseNode(node.children[0]);
  const right = collapseNode(node.children[1]);
  if (left === null && right === null) return null;
  if (left === null) return right;
  if (right === null) return left;
  if (left === node.children[0] && right === node.children[1]) return node;
  return { ...node, children: [left, right] };
}

/**
 * Walk the tree and collapse any split that has only one real leaf child.
 * Returns the collapsed tree (may be a leaf if the root is the orphaned split).
 * Callers should pass a non-null root; the tree is unchanged if all splits are valid.
 */
export function unsplitIfOrphan(tree: SlotNode): SlotNode {
  return collapseNode(tree) ?? tree;
}

// ---------------------------------------------------------------------------
// splitDirection helpers — map edge to direction + position
// ---------------------------------------------------------------------------

export type EdgeDirection = 'north' | 'south' | 'east' | 'west';

export interface SplitParams {
  direction: 'horizontal' | 'vertical';
  position: 'start' | 'end';
}

/**
 * Map a drop edge to the split direction and child position.
 *
 * Edge → split axis:
 *   north/south → horizontal split (top/bottom halves)
 *   east/west   → vertical split (left/right halves)
 *
 * Edge → position of the *dropped* source:
 *   north/west → 'start' (source is first child)
 *   south/east → 'end'   (source is second child)
 */
export function edgeToSplitParams(edge: EdgeDirection): SplitParams {
  const map: Record<EdgeDirection, SplitParams> = {
    north: { direction: 'horizontal', position: 'start' },
    south: { direction: 'horizontal', position: 'end' },
    west:  { direction: 'vertical',   position: 'start' },
    east:  { direction: 'vertical',   position: 'end' },
  };
  return map[edge];
}

/**
 * Type-guard for EdgeDirection strings.
 */
export function isEdgeDirection(s: string): s is EdgeDirection {
  return s === 'north' || s === 'south' || s === 'east' || s === 'west';
}

// ---------------------------------------------------------------------------
// Drop ID helpers
// ---------------------------------------------------------------------------

/**
 * Edge drop IDs follow the format: `{slotName}:edge:{EdgeDirection}`
 * e.g. "editorContent:edge:north"
 *
 * Center (swap) drop IDs are just the plain slotName.
 */
export interface EdgeDropId {
  slotName: SlotName;
  edge: EdgeDirection;
}

const VALID_SLOT_NAMES = new Set<string>([
  'sidebarHeader',
  'sidebarContent',
  'editorTabBar',
  'editorContent',
  'agentCards',
  'terminalContent',
]);

export function parseEdgeDropId(id: string): EdgeDropId | null {
  const parts = id.split(':edge:');
  if (parts.length !== 2) return null;
  const [slotName, edge] = parts;
  if (!VALID_SLOT_NAMES.has(slotName)) return null;
  if (!isEdgeDirection(edge)) return null;
  return { slotName: slotName as SlotName, edge };
}
