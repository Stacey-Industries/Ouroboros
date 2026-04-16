/**
 * splitSlot.test.ts — Wave 28 Phase C
 *
 * Tests for pure tree-mutation helpers: splitLeafWith, unsplitIfOrphan,
 * removeLeaf, replaceLeaf, edgeToSplitParams, parseEdgeDropId.
 */

import { describe, expect, it } from 'vitest';

import type { LeafSlot, SplitNode } from './slotTree';
import { collectLeaves, isLeaf, isSplit } from './slotTree';
import {
  edgeToSplitParams,
  parseEdgeDropId,
  removeLeaf,
  replaceLeaf,
  splitLeafWith,
  unsplitIfOrphan,
} from './splitSlot';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function leaf(slotName: 'editorContent' | 'terminalContent' | 'sidebarContent' | 'agentCards'): LeafSlot {
  return { kind: 'leaf', slotName, component: { componentKey: slotName } };
}

const editor = leaf('editorContent');
const terminal = leaf('terminalContent');
const sidebar = leaf('sidebarContent');

// ---------------------------------------------------------------------------
// splitLeafWith
// ---------------------------------------------------------------------------

describe('splitLeafWith', () => {
  it('splits north: source placed before target (horizontal, start)', () => {
    const result = splitLeafWith({
      tree: editor,
      targetSlot: 'editorContent',
      source: terminal,
      direction: 'horizontal',
      position: 'start',
    });
    expect(isSplit(result)).toBe(true);
    const split = result as SplitNode;
    expect(split.direction).toBe('horizontal');
    expect((split.children[0] as LeafSlot).slotName).toBe('terminalContent');
    expect((split.children[1] as LeafSlot).slotName).toBe('editorContent');
  });

  it('splits south: source placed after target (horizontal, end)', () => {
    const result = splitLeafWith({
      tree: editor,
      targetSlot: 'editorContent',
      source: terminal,
      direction: 'horizontal',
      position: 'end',
    });
    const split = result as SplitNode;
    expect((split.children[0] as LeafSlot).slotName).toBe('editorContent');
    expect((split.children[1] as LeafSlot).slotName).toBe('terminalContent');
  });

  it('splits west: vertical split, source first', () => {
    const result = splitLeafWith({
      tree: editor,
      targetSlot: 'editorContent',
      source: sidebar,
      direction: 'vertical',
      position: 'start',
    });
    const split = result as SplitNode;
    expect(split.direction).toBe('vertical');
    expect((split.children[0] as LeafSlot).slotName).toBe('sidebarContent');
  });

  it('splits east: vertical split, source last', () => {
    const result = splitLeafWith({
      tree: editor,
      targetSlot: 'editorContent',
      source: sidebar,
      direction: 'vertical',
      position: 'end',
    });
    const split = result as SplitNode;
    expect((split.children[1] as LeafSlot).slotName).toBe('sidebarContent');
  });

  it('returns original tree when targetSlot is not found', () => {
    const result = splitLeafWith({
      tree: editor,
      targetSlot: 'agentCards',
      source: terminal,
      direction: 'horizontal',
      position: 'end',
    });
    expect(result).toBe(editor);
  });

  it('splits a leaf deep inside a nested tree', () => {
    const tree: SplitNode = { kind: 'split', direction: 'horizontal', children: [editor, terminal] };
    const result = splitLeafWith({
      tree,
      targetSlot: 'terminalContent',
      source: sidebar,
      direction: 'vertical',
      position: 'end',
    });
    const leaves = collectLeaves(result);
    expect(leaves.map((l) => l.slotName)).toEqual([
      'editorContent',
      'terminalContent',
      'sidebarContent',
    ]);
  });
});

// ---------------------------------------------------------------------------
// removeLeaf
// ---------------------------------------------------------------------------

describe('removeLeaf', () => {
  it('returns null when the root leaf is removed', () => {
    expect(removeLeaf(editor, 'editorContent')).toBeNull();
  });

  it('collapses the split when one child is removed', () => {
    const tree: SplitNode = { kind: 'split', direction: 'horizontal', children: [editor, terminal] };
    const result = removeLeaf(tree, 'editorContent');
    expect(result).not.toBeNull();
    expect(isLeaf(result!)).toBe(true);
    expect((result as LeafSlot).slotName).toBe('terminalContent');
  });

  it('returns the original tree when slotName is not found', () => {
    const result = removeLeaf(editor, 'agentCards');
    expect(result).toBe(editor);
  });
});

// ---------------------------------------------------------------------------
// replaceLeaf
// ---------------------------------------------------------------------------

describe('replaceLeaf', () => {
  it('replaces the matching leaf at root', () => {
    const result = replaceLeaf(editor, 'editorContent', terminal);
    expect(isLeaf(result)).toBe(true);
    expect((result as LeafSlot).slotName).toBe('terminalContent');
  });

  it('replaces a leaf deep in the tree', () => {
    const tree: SplitNode = { kind: 'split', direction: 'vertical', children: [editor, terminal] };
    const result = replaceLeaf(tree, 'terminalContent', sidebar);
    const leaves = collectLeaves(result);
    expect(leaves.map((l) => l.slotName)).toEqual(['editorContent', 'sidebarContent']);
  });

  it('returns original tree when slotName not found', () => {
    const result = replaceLeaf(editor, 'agentCards', terminal);
    expect(result).toBe(editor);
  });
});

// ---------------------------------------------------------------------------
// unsplitIfOrphan
// ---------------------------------------------------------------------------

describe('unsplitIfOrphan', () => {
  it('leaves a valid two-child split unchanged', () => {
    const tree: SplitNode = { kind: 'split', direction: 'horizontal', children: [editor, terminal] };
    const result = unsplitIfOrphan(tree);
    expect(result).toBe(tree);
  });

  it('collapses a split after one child is removed via removeLeaf', () => {
    const tree: SplitNode = { kind: 'split', direction: 'horizontal', children: [editor, terminal] };
    const removed = removeLeaf(tree, 'terminalContent');
    expect(removed).not.toBeNull();
    const collapsed = unsplitIfOrphan(removed!);
    expect(isLeaf(collapsed)).toBe(true);
    expect((collapsed as LeafSlot).slotName).toBe('editorContent');
  });

  it('returns a leaf node unchanged', () => {
    const result = unsplitIfOrphan(editor);
    expect(result).toBe(editor);
  });
});

// ---------------------------------------------------------------------------
// edgeToSplitParams
// ---------------------------------------------------------------------------

describe('edgeToSplitParams', () => {
  it('north → horizontal split, source at start', () => {
    const p = edgeToSplitParams('north');
    expect(p).toEqual({ direction: 'horizontal', position: 'start' });
  });

  it('south → horizontal split, source at end', () => {
    const p = edgeToSplitParams('south');
    expect(p).toEqual({ direction: 'horizontal', position: 'end' });
  });

  it('west → vertical split, source at start', () => {
    const p = edgeToSplitParams('west');
    expect(p).toEqual({ direction: 'vertical', position: 'start' });
  });

  it('east → vertical split, source at end', () => {
    const p = edgeToSplitParams('east');
    expect(p).toEqual({ direction: 'vertical', position: 'end' });
  });
});

// ---------------------------------------------------------------------------
// parseEdgeDropId
// ---------------------------------------------------------------------------

describe('parseEdgeDropId', () => {
  it('parses a valid edge drop ID', () => {
    const result = parseEdgeDropId('editorContent:edge:north');
    expect(result).toEqual({ slotName: 'editorContent', edge: 'north' });
  });

  it('returns null for a plain slot name (center drop)', () => {
    expect(parseEdgeDropId('editorContent')).toBeNull();
  });

  it('returns null for an unknown slot name', () => {
    expect(parseEdgeDropId('unknownSlot:edge:north')).toBeNull();
  });

  it('returns null for an unknown edge direction', () => {
    expect(parseEdgeDropId('editorContent:edge:diagonal')).toBeNull();
  });
});
