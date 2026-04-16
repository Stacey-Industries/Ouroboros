/**
 * @vitest-environment jsdom
 *
 * SlotTreeRenderer — unit tests for Wave 28 Phase C.
 *
 * Verifies recursive tree rendering: single leaf passes through unchanged,
 * split nodes produce flex containers with correct direction and ratio styles,
 * and deeply nested trees render all leaves.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { LeafSlot, SlotNode, SplitNode } from './layoutPresets/slotTree';
import type { LeafRenderer } from './SlotTreeRenderer';
import { SlotTreeRenderer } from './SlotTreeRenderer';

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

const editor = makeLeaf('editorContent');
const terminal = makeLeaf('terminalContent');
const sidebar = makeLeaf('sidebarContent');

/** Simple leaf renderer: renders a div with a data-slot attribute */
const renderLeaf: LeafRenderer = (leaf) => (
  <div data-testid={`slot-${leaf.slotName}`} data-slot={leaf.slotName} />
);

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Single leaf (legacy-compatible path)
// ---------------------------------------------------------------------------

describe('SlotTreeRenderer — single leaf', () => {
  it('renders the leaf via renderLeaf without a split container', () => {
    const { getByTestId, container } = render(
      <SlotTreeRenderer tree={editor} renderLeaf={renderLeaf} />,
    );
    expect(getByTestId('slot-editorContent')).toBeDefined();
    // No split containers expected
    expect(container.querySelectorAll('[data-split]')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Horizontal split (top/bottom)
// ---------------------------------------------------------------------------

describe('SlotTreeRenderer — horizontal split', () => {
  it('renders a flex column container for a horizontal split', () => {
    const tree = makeSplit(editor, terminal, 'horizontal');
    const { container } = render(
      <SlotTreeRenderer tree={tree} renderLeaf={renderLeaf} />,
    );
    const splitEl = container.querySelector('[data-split="horizontal"]');
    expect(splitEl).not.toBeNull();
    expect((splitEl as HTMLElement).style.flexDirection).toBe('column');
  });

  it('renders both children of a horizontal split', () => {
    const tree = makeSplit(editor, terminal, 'horizontal');
    const { getByTestId } = render(
      <SlotTreeRenderer tree={tree} renderLeaf={renderLeaf} />,
    );
    expect(getByTestId('slot-editorContent')).toBeDefined();
    expect(getByTestId('slot-terminalContent')).toBeDefined();
  });

  it('applies 50% flex-basis to first child when ratio is not set', () => {
    const tree = makeSplit(editor, terminal, 'horizontal');
    const { container } = render(
      <SlotTreeRenderer tree={tree} renderLeaf={renderLeaf} />,
    );
    const splitEl = container.querySelector('[data-split="horizontal"]');
    const firstChild = splitEl?.firstElementChild as HTMLElement | null;
    expect(firstChild?.style.flexBasis).toBe('50%');
  });

  it('applies custom ratio as flex-basis to first child', () => {
    const tree = makeSplit(editor, terminal, 'horizontal', 0.3);
    const { container } = render(
      <SlotTreeRenderer tree={tree} renderLeaf={renderLeaf} />,
    );
    const splitEl = container.querySelector('[data-split="horizontal"]');
    const firstChild = splitEl?.firstElementChild as HTMLElement | null;
    expect(firstChild?.style.flexBasis).toBe('30%');
  });
});

// ---------------------------------------------------------------------------
// Vertical split (left/right)
// ---------------------------------------------------------------------------

describe('SlotTreeRenderer — vertical split', () => {
  it('renders a flex row container for a vertical split', () => {
    const tree = makeSplit(editor, sidebar, 'vertical');
    const { container } = render(
      <SlotTreeRenderer tree={tree} renderLeaf={renderLeaf} />,
    );
    const splitEl = container.querySelector('[data-split="vertical"]');
    expect(splitEl).not.toBeNull();
    expect((splitEl as HTMLElement).style.flexDirection).toBe('row');
  });
});

// ---------------------------------------------------------------------------
// Nested / deep tree
// ---------------------------------------------------------------------------

describe('SlotTreeRenderer — nested tree', () => {
  it('renders all three leaves in a two-level nested tree', () => {
    const tree = makeSplit(makeSplit(editor, terminal, 'vertical'), sidebar, 'horizontal');
    const { getByTestId, container } = render(
      <SlotTreeRenderer tree={tree} renderLeaf={renderLeaf} />,
    );
    expect(getByTestId('slot-editorContent')).toBeDefined();
    expect(getByTestId('slot-terminalContent')).toBeDefined();
    expect(getByTestId('slot-sidebarContent')).toBeDefined();
    // Two split containers expected
    expect(container.querySelectorAll('[data-split]')).toHaveLength(2);
  });
});
