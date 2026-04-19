/**
 * @vitest-environment jsdom
 *
 * persistence.integration.test.ts — Wave 41 Phase J (test 9)
 *
 * Split-pane persistence round-trip integration tests.
 *
 * Scope:
 *  - persistence.save is called when swapSlots is invoked (wired in provider)
 *  - persistence.clear is called on resetLayout
 *  - undoLayout restores prior tree (in-memory undo stack)
 *  - getCustomLayout is called on mount with the correct sessionId
 *
 * Known production gap (reported separately — do not fix in this phase):
 *  - `useSplitSlotCallback` does NOT call `persistence.save`. Phase E deferred
 *    this to Phase P; Phase P did not implement it. See the gap-documentation
 *    describe block at the bottom of this file.
 *  - `useProviderCore`'s `useEffect([basePreset])` races against the async
 *    `getCustomLayout` load. The saved tree is only applied when `basePreset`
 *    changes (flag async load); if persistence resolves after the flag,
 *    the tree is never applied.
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Viewport breakpoint mock ──────────────────────────────────────────────────

vi.mock('../../../hooks/useViewportBreakpoint', () => ({
  useViewportBreakpoint: () => 'desktop',
}));

// ── Persistence mock ──────────────────────────────────────────────────────────

const mockGetCustomLayout = vi.fn();
const mockSetCustomLayout = vi.fn().mockResolvedValue({ success: true });
const mockDeleteCustomLayout = vi.fn().mockResolvedValue({ success: true });
const mockPromoteToGlobal = vi.fn().mockResolvedValue({ success: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).electronAPI = {
  config: {
    getAll: vi.fn().mockResolvedValue({ layout: { presets: { v2: true } } }),
  },
  layout: {
    getCustomLayout: mockGetCustomLayout,
    setCustomLayout: mockSetCustomLayout,
    deleteCustomLayout: mockDeleteCustomLayout,
    promoteToGlobal: mockPromoteToGlobal,
  },
};

// ── Subject ───────────────────────────────────────────────────────────────────

import { useLayoutPreset } from './LayoutPresetResolver';
import { LayoutPresetResolverProvider } from './LayoutPresetResolverProvider';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper(sessionId = 'test-session'): React.FC<{ children: React.ReactNode }> {
  // eslint-disable-next-line react/prop-types
  return function Wrapper({ children }) {
    return React.createElement(
      LayoutPresetResolverProvider,
      { sessionId },
      children,
    );
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCustomLayout.mockResolvedValue({ success: true, tree: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI.config.getAll = vi.fn().mockResolvedValue({
    layout: { presets: { v2: true } },
  });
});

afterEach(() => {
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('persistence round-trip — getCustomLayout is called on mount', () => {
  it('calls getCustomLayout with the correct sessionId on mount', async () => {
    const { result } = renderHook(() => useLayoutPreset(), {
      wrapper: makeWrapper('sess-round-trip'),
    });

    await waitFor(() => {
      expect(mockGetCustomLayout).toHaveBeenCalledWith('sess-round-trip');
    });

    // Context functions are exposed
    expect(typeof result.current.splitSlot).toBe('function');
    expect(typeof result.current.swapSlots).toBe('function');
    expect(typeof result.current.resetLayout).toBe('function');
  });

  it('does not call getCustomLayout when sessionId is empty', async () => {
    renderHook(() => useLayoutPreset(), {
      wrapper: makeWrapper(''),
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(mockGetCustomLayout).not.toHaveBeenCalled();
  });
});

describe('persistence round-trip — swapSlots persists via setCustomLayout', () => {
  it('swapSlots calls setCustomLayout after the debounce', async () => {
    const { result } = renderHook(() => useLayoutPreset(), {
      wrapper: makeWrapper('sess-swap'),
    });

    await waitFor(() => {
      expect(typeof result.current.swapSlots).toBe('function');
    });

    act(() => {
      result.current.swapSlots('editorContent', 'sidebarContent');
    });

    // Flush the debounce (250ms) and any pending microtasks
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
    });

    await waitFor(() => {
      expect(mockSetCustomLayout).toHaveBeenCalledWith('sess-swap', expect.any(Object));
    }, { timeout: 2000 });
  });
});

describe('persistence round-trip — resetLayout clears persistence', () => {
  it('resetLayout calls deleteCustomLayout', async () => {
    const { result } = renderHook(() => useLayoutPreset(), {
      wrapper: makeWrapper('sess-reset'),
    });

    await waitFor(() => {
      expect(typeof result.current.resetLayout).toBe('function');
    });

    act(() => {
      result.current.resetLayout();
    });

    await waitFor(() => {
      expect(mockDeleteCustomLayout).toHaveBeenCalledWith('sess-reset');
    });
  });

  it('slotTree returns to leaf after resetLayout', async () => {
    const { result } = renderHook(() => useLayoutPreset(), {
      wrapper: makeWrapper('sess-reset-leaf'),
    });

    await waitFor(() => {
      expect(typeof result.current.resetLayout).toBe('function');
    });

    // First swap to get into a non-default state
    act(() => {
      result.current.swapSlots('editorContent', 'sidebarContent');
    });

    // Then reset
    act(() => {
      result.current.resetLayout();
    });

    // After reset, the tree should be a leaf (preset default)
    await waitFor(() => {
      expect(result.current.slotTree.kind).toBe('leaf');
    });
  });
});

describe('persistence round-trip — undo stack behaviour', () => {
  it('canUndo starts false, becomes true after swapSlots, false again after undo', async () => {
    const { result } = renderHook(() => useLayoutPreset(), {
      wrapper: makeWrapper('sess-undo'),
    });

    await waitFor(() => {
      expect(typeof result.current.undoLayout).toBe('function');
    });

    expect(result.current.canUndo).toBe(false);

    act(() => {
      result.current.swapSlots('editorContent', 'sidebarContent');
    });

    await waitFor(() => {
      expect(result.current.canUndo).toBe(true);
    });

    act(() => {
      result.current.undoLayout();
    });

    await waitFor(() => {
      expect(result.current.canUndo).toBe(false);
    });
  });

  it('undoLayout calls persistence.save with the previous tree', async () => {
    const { result } = renderHook(() => useLayoutPreset(), {
      wrapper: makeWrapper('sess-undo-save'),
    });

    await waitFor(() => {
      expect(result.current.canUndo).toBe(false);
    });

    act(() => {
      result.current.swapSlots('editorContent', 'sidebarContent');
    });

    await waitFor(() => {
      expect(result.current.canUndo).toBe(true);
    });

    mockSetCustomLayout.mockClear();

    act(() => {
      result.current.undoLayout();
    });

    // undoLayout calls persistence.save immediately (no debounce on undo path)
    await waitFor(() => {
      expect(mockSetCustomLayout).toHaveBeenCalled();
    });
  });
});

// ── Known gap documentation ───────────────────────────────────────────────────

describe('KNOWN GAP — useSplitSlotCallback persistence not wired (Wave 41 CRIT-A)', () => {
  /**
   * useSplitSlotCallback in LayoutPresetResolver.tsx calls setSlotTree but
   * does NOT call persistence.save. This means split-pane layouts are lost
   * on page reload even though swapSlots layouts persist correctly.
   *
   * Root cause: Phase E.3 plan called for persistence.save inside
   * useSplitSlotCallback but the implementation was deferred and never
   * completed. Phase P commit message referenced diff review stale detection
   * but did not add split persistence.
   *
   * Fix required: Inside useSplitSlotCallback's setSlotTree updater,
   * compute `next` explicitly, then call persistence.save(next) after setting.
   * This requires threading `persistence` through to useSplitSlotCallback,
   * either via ProviderState or by wrapping in the provider where persistence
   * is available.
   */
  it('splitSlot updates in-memory slotTree and persists via setCustomLayout (CRIT-A fix)', async () => {
    const { result } = renderHook(() => useLayoutPreset(), {
      wrapper: makeWrapper('sess-split-gap'),
    });

    await waitFor(() => {
      expect(typeof result.current.splitSlot).toBe('function');
    });

    const initialKind = result.current.slotTree.kind;
    expect(initialKind).toBe('leaf');

    act(() => {
      result.current.splitSlot('editorContent', 'terminalContent', 'horizontal', 'end');
    });

    // Wait for the debounce window (save is debounced by useCustomLayoutPersistence)
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
    });

    // Wave 41 CRIT-A fix: splitSlot now persists the tree via persistence.save,
    // so setCustomLayout must be called at least once after the debounce window.
    expect(mockSetCustomLayout).toHaveBeenCalledWith('sess-split-gap', expect.any(Object));
  });
});
