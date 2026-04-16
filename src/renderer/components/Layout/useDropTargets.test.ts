/**
 * @vitest-environment jsdom
 *
 * useDropTargets — unit tests for Wave 28 Phase B.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock useLayoutPreset so tests control swapSlots without a provider
// ---------------------------------------------------------------------------
vi.mock('./layoutPresets/LayoutPresetResolver', () => ({
  useLayoutPreset: vi.fn(),
}));

import { useLayoutPreset } from './layoutPresets/LayoutPresetResolver';
import { useDropTargets } from './useDropTargets';

const mockUseLayoutPreset = vi.mocked(useLayoutPreset);

function makeSwapSpy() {
  const swapSlots = vi.fn();
  mockUseLayoutPreset.mockReturnValue({
    preset: { id: 'ide-primary', name: 'IDE', slots: {}, panelSizes: {}, visiblePanels: {} },
    slotTree: { kind: 'leaf', slotName: 'editorContent', component: { componentKey: 'editorContent' } },
    swapSlots,
    splitSlot: vi.fn(),
  });
  return swapSlots;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useDropTargets', () => {
  it('calls swapSlots when source and target are valid distinct SlotNames', () => {
    const swapSlots = makeSwapSpy();
    const { result } = renderHook(() => useDropTargets());

    result.current.onDragEnd({
      active: { id: 'terminalContent' },
      over: { id: 'editorContent' },
    } as never);

    expect(swapSlots).toHaveBeenCalledOnce();
    expect(swapSlots).toHaveBeenCalledWith('terminalContent', 'editorContent');
  });

  it('no-ops when over is null (drop outside any target)', () => {
    const swapSlots = makeSwapSpy();
    const { result } = renderHook(() => useDropTargets());

    result.current.onDragEnd({
      active: { id: 'terminalContent' },
      over: null,
    } as never);

    expect(swapSlots).not.toHaveBeenCalled();
  });

  it('no-ops when source and target are the same slot', () => {
    const swapSlots = makeSwapSpy();
    const { result } = renderHook(() => useDropTargets());

    result.current.onDragEnd({
      active: { id: 'editorContent' },
      over: { id: 'editorContent' },
    } as never);

    expect(swapSlots).not.toHaveBeenCalled();
  });

  it('no-ops when source id is not a valid SlotName', () => {
    const swapSlots = makeSwapSpy();
    const { result } = renderHook(() => useDropTargets());

    result.current.onDragEnd({
      active: { id: 'unknown-panel' },
      over: { id: 'editorContent' },
    } as never);

    expect(swapSlots).not.toHaveBeenCalled();
  });

  it('no-ops when target id is not a valid SlotName', () => {
    const swapSlots = makeSwapSpy();
    const { result } = renderHook(() => useDropTargets());

    result.current.onDragEnd({
      active: { id: 'terminalContent' },
      over: { id: 'not-a-slot' },
    } as never);

    expect(swapSlots).not.toHaveBeenCalled();
  });

  it('swaps all valid SlotName pairs without throwing', () => {
    const swapSlots = makeSwapSpy();
    const { result } = renderHook(() => useDropTargets());

    const pairs: [string, string][] = [
      ['sidebarHeader', 'sidebarContent'],
      ['editorTabBar', 'editorContent'],
      ['agentCards', 'terminalContent'],
    ];

    for (const [src, tgt] of pairs) {
      result.current.onDragEnd({ active: { id: src }, over: { id: tgt } } as never);
    }

    expect(swapSlots).toHaveBeenCalledTimes(3);
  });
});
