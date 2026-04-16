/**
 * @vitest-environment jsdom
 *
 * useDropTargets.split.test.ts — Wave 28 Phase C
 *
 * Tests for the extended onDragEnd handler:
 *  - edge drop IDs trigger splitSlot with correct direction/position
 *  - center drops (plain slot name) still call swapSlots
 *  - unknown IDs, same-source-target, and null over are all no-ops
 */

import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock LayoutPresetResolver context
// ---------------------------------------------------------------------------

const mockSwapSlots = vi.fn();
const mockSplitSlot = vi.fn();

vi.mock('./layoutPresets/LayoutPresetResolver', () => ({
  useLayoutPreset: () => ({
    preset: { slots: {} },
    slotTree: { kind: 'leaf', slotName: 'editorContent', component: { componentKey: 'editorContent' } },
    swapSlots: mockSwapSlots,
    splitSlot: mockSplitSlot,
  }),
}));

import { renderHook } from '@testing-library/react';
import { afterEach } from 'vitest';

import { useDropTargets } from './useDropTargets';

afterEach(() => {
  vi.clearAllMocks();
});

function makeDragEnd(sourceId: string, targetId: string | null) {
  return {
    active: { id: sourceId },
    over: targetId !== null ? { id: targetId } : null,
  } as never;
}

// ---------------------------------------------------------------------------
// Edge drop → splitSlot
// ---------------------------------------------------------------------------

describe('useDropTargets — edge drops', () => {
  it('calls splitSlot with horizontal/start for north edge', () => {
    const { result } = renderHook(() => useDropTargets());
    result.current.onDragEnd(makeDragEnd('terminalContent', 'editorContent:edge:north'));
    expect(mockSplitSlot).toHaveBeenCalledWith('editorContent', 'terminalContent', 'horizontal', 'start');
    expect(mockSwapSlots).not.toHaveBeenCalled();
  });

  it('calls splitSlot with horizontal/end for south edge', () => {
    const { result } = renderHook(() => useDropTargets());
    result.current.onDragEnd(makeDragEnd('sidebarContent', 'editorContent:edge:south'));
    expect(mockSplitSlot).toHaveBeenCalledWith('editorContent', 'sidebarContent', 'horizontal', 'end');
  });

  it('calls splitSlot with vertical/start for west edge', () => {
    const { result } = renderHook(() => useDropTargets());
    result.current.onDragEnd(makeDragEnd('terminalContent', 'editorContent:edge:west'));
    expect(mockSplitSlot).toHaveBeenCalledWith('editorContent', 'terminalContent', 'vertical', 'start');
  });

  it('calls splitSlot with vertical/end for east edge', () => {
    const { result } = renderHook(() => useDropTargets());
    result.current.onDragEnd(makeDragEnd('terminalContent', 'editorContent:edge:east'));
    expect(mockSplitSlot).toHaveBeenCalledWith('editorContent', 'terminalContent', 'vertical', 'end');
  });

  it('is a no-op when source and edge target slot are the same', () => {
    const { result } = renderHook(() => useDropTargets());
    result.current.onDragEnd(makeDragEnd('editorContent', 'editorContent:edge:north'));
    expect(mockSplitSlot).not.toHaveBeenCalled();
    expect(mockSwapSlots).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Center drop → swapSlots (Phase B path preserved)
// ---------------------------------------------------------------------------

describe('useDropTargets — center drops', () => {
  it('calls swapSlots when target is a plain slot name', () => {
    const { result } = renderHook(() => useDropTargets());
    result.current.onDragEnd(makeDragEnd('terminalContent', 'editorContent'));
    expect(mockSwapSlots).toHaveBeenCalledWith('terminalContent', 'editorContent');
    expect(mockSplitSlot).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// No-ops
// ---------------------------------------------------------------------------

describe('useDropTargets — no-ops', () => {
  it('is a no-op when over is null', () => {
    const { result } = renderHook(() => useDropTargets());
    result.current.onDragEnd(makeDragEnd('editorContent', null));
    expect(mockSwapSlots).not.toHaveBeenCalled();
    expect(mockSplitSlot).not.toHaveBeenCalled();
  });

  it('is a no-op when source is not a valid slot name', () => {
    const { result } = renderHook(() => useDropTargets());
    result.current.onDragEnd(makeDragEnd('unknown-drag-handle', 'editorContent'));
    expect(mockSwapSlots).not.toHaveBeenCalled();
    expect(mockSplitSlot).not.toHaveBeenCalled();
  });

  it('is a no-op for an unknown over ID (neither slot nor edge)', () => {
    const { result } = renderHook(() => useDropTargets());
    result.current.onDragEnd(makeDragEnd('terminalContent', 'garbage:id:format:extra'));
    expect(mockSwapSlots).not.toHaveBeenCalled();
    expect(mockSplitSlot).not.toHaveBeenCalled();
  });
});
