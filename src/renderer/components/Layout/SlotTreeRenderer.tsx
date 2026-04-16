/**
 * SlotTreeRenderer.tsx — Wave 28 Phase C
 *
 * Recursively renders a SlotNode binary tree using CSS flex with ratio-driven
 * flex-basis for splits. When the tree is all leaves in the 6 named positions,
 * rendering is identical to the legacy layout (zero visual change).
 *
 * A SplitNode renders as a flex row (vertical split) or column (horizontal
 * split). The first child receives `flex-basis` of `ratio * 100%` (default
 * 50%); the second child takes the remainder.
 *
 * No resize handles yet — those arrive in Phase D/E.
 */

import React from 'react';

import type { LeafSlot, SlotNode, SplitNode } from './layoutPresets/slotTree';
import { isLeaf } from './layoutPresets/slotTree';

// ---------------------------------------------------------------------------
// Leaf renderer — supplied by AppLayout via render prop
// ---------------------------------------------------------------------------

export type LeafRenderer = (leaf: LeafSlot) => React.ReactNode;

// ---------------------------------------------------------------------------
// SplitNode renderer
// ---------------------------------------------------------------------------

interface SplitRendererProps {
  node: SplitNode;
  renderLeaf: LeafRenderer;
}

function SplitRenderer({ node, renderLeaf }: SplitRendererProps): React.ReactElement {
  const ratio = node.ratio ?? 0.5;
  const firstBasis = `${ratio * 100}%`;
  const flexDir = node.direction === 'horizontal' ? 'column' : 'row';

  return (
    <div
      data-split={node.direction}
      className="flex min-h-0 min-w-0 flex-1"
      style={{ flexDirection: flexDir }}
    >
      <div style={{ flexBasis: firstBasis, flexShrink: 0, flexGrow: 0 }} className="min-h-0 min-w-0 overflow-hidden">
        <SlotNodeRenderer node={node.children[0]} renderLeaf={renderLeaf} />
      </div>
      <div style={{ flex: 1 }} className="min-h-0 min-w-0 overflow-hidden">
        <SlotNodeRenderer node={node.children[1]} renderLeaf={renderLeaf} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlotNodeRenderer — dispatches leaf vs split
// ---------------------------------------------------------------------------

interface SlotNodeRendererProps {
  node: SlotNode;
  renderLeaf: LeafRenderer;
}

function SlotNodeRenderer({ node, renderLeaf }: SlotNodeRendererProps): React.ReactElement {
  if (isLeaf(node)) {
    return <>{renderLeaf(node)}</>;
  }
  return <SplitRenderer node={node} renderLeaf={renderLeaf} />;
}

// ---------------------------------------------------------------------------
// Public: SlotTreeRenderer
// ---------------------------------------------------------------------------

export interface SlotTreeRendererProps {
  tree: SlotNode;
  renderLeaf: LeafRenderer;
}

/**
 * SlotTreeRenderer — entry point for recursive tree rendering.
 *
 * Wraps the root node in a flex container so splits fill available space.
 * When the tree is a single leaf, the wrapper is transparent and the legacy
 * slot content renders unchanged.
 */
export function SlotTreeRenderer({ tree, renderLeaf }: SlotTreeRendererProps): React.ReactElement {
  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <SlotNodeRenderer node={tree} renderLeaf={renderLeaf} />
    </div>
  );
}
