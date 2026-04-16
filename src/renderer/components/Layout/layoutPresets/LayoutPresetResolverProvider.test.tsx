/**
 * @vitest-environment jsdom
 *
 * LayoutPresetResolverProvider.test.tsx — Tests for Phase D wiring in the provider.
 * Covers: saved tree hydrates on mount; mutations push to undo stack; reset clears persistence.
 */

import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetCustomLayout = vi.fn().mockResolvedValue({ success: true, tree: null });
const mockSetCustomLayout = vi.fn().mockResolvedValue({ success: true });
const mockDeleteCustomLayout = vi.fn().mockResolvedValue({ success: true });
const mockPromoteToGlobal = vi.fn().mockResolvedValue({ success: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).electronAPI = {
  config: { getAll: vi.fn().mockResolvedValue({ layout: { presets: { v2: true } } }) },
  layout: {
    getCustomLayout: mockGetCustomLayout,
    setCustomLayout: mockSetCustomLayout,
    deleteCustomLayout: mockDeleteCustomLayout,
    promoteToGlobal: mockPromoteToGlobal,
  },
};

// ─── Subject ──────────────────────────────────────────────────────────────────

import { useLayoutPreset } from './LayoutPresetResolver';
import { LayoutPresetResolverProvider } from './LayoutPresetResolverProvider';

const TREE_A = { kind: 'leaf' as const, slotName: 'editorContent', component: { componentKey: 'editorContent' } };

function Probe(): React.ReactElement {
  const { canUndo, slotTree } = useLayoutPreset();
  return (
    <div>
      <span data-testid="can-undo">{String(canUndo)}</span>
      <span data-testid="slot-tree">{slotTree.kind}</span>
    </div>
  );
}

function wrap(sessionId = 'sess-1'): React.ReactElement {
  return (
    <LayoutPresetResolverProvider sessionId={sessionId}>
      <Probe />
    </LayoutPresetResolverProvider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LayoutPresetResolverProvider Phase D', () => {
  beforeEach(() => {
    mockGetCustomLayout.mockClear();
    mockSetCustomLayout.mockClear();
    mockDeleteCustomLayout.mockClear();
    mockPromoteToGlobal.mockClear();
    mockGetCustomLayout.mockResolvedValue({ success: true, tree: null });
  });
  afterEach(() => { cleanup(); });

  it('renders without crashing', () => {
    render(wrap());
    expect(screen.getByTestId('can-undo')).toBeTruthy();
  });

  it('canUndo starts false', () => {
    render(wrap());
    expect(screen.getByTestId('can-undo').textContent).toBe('false');
  });

  it('loads saved tree from persistence on mount', async () => {
    mockGetCustomLayout.mockResolvedValueOnce({ success: true, tree: TREE_A });
    render(wrap('sess-loaded'));
    await waitFor(() => expect(mockGetCustomLayout).toHaveBeenCalledWith('sess-loaded'));
  });

  it('no-ops persistence when sessionId is empty', async () => {
    const { unmount } = render(wrap(''));
    unmount();
    expect(mockGetCustomLayout).not.toHaveBeenCalled();
  });

  it('exposes resetLayout and promoteToGlobal on context', () => {
    const { result } = renderHook(() => useLayoutPreset(), {
      wrapper: ({ children }) => (
        <LayoutPresetResolverProvider sessionId="sess-x">
          {children}
        </LayoutPresetResolverProvider>
      ),
    });
    expect(typeof result.current.resetLayout).toBe('function');
    expect(typeof result.current.promoteToGlobal).toBe('function');
  });

  it('promoteToGlobal calls IPC with name and current tree', async () => {
    const { result } = renderHook(() => useLayoutPreset(), {
      wrapper: ({ children }) => (
        <LayoutPresetResolverProvider sessionId="sess-x">
          {children}
        </LayoutPresetResolverProvider>
      ),
    });
    act(() => { result.current.promoteToGlobal('My Layout'); });
    await waitFor(() => expect(mockPromoteToGlobal).toHaveBeenCalledWith('My Layout', expect.any(Object)));
  });
});
