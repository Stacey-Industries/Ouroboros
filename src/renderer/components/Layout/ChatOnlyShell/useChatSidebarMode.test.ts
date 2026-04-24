/**
 * @vitest-environment jsdom
 *
 * useChatSidebarMode — unit tests (Wave 44 Phase B).
 *
 * Covers:
 *  - Default mode is 'pinned' when config returns no value.
 *  - cycleMode transitions: pinned → collapsed → hidden → pinned.
 *  - CYCLE_CHAT_SIDEBAR_MODE_EVENT DOM event triggers a cycle.
 *  - Config.set is called with the next mode on each cycle.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CYCLE_CHAT_SIDEBAR_MODE_EVENT } from '../../../hooks/appEventNames';
import { useChatSidebarMode } from './useChatSidebarMode';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfigApi(overrides: Record<string, unknown> = {}) {
  return {
    getAll: vi.fn().mockResolvedValue({ layout: { chatSidebarMode: 'pinned', ...overrides } }),
    set: vi.fn().mockResolvedValue({ success: true }),
    onExternalChange: vi.fn().mockReturnValue(() => undefined),
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let configApi: ReturnType<typeof makeConfigApi>;

beforeEach(() => {
  configApi = makeConfigApi();
  Object.defineProperty(window, 'electronAPI', {
    value: { config: configApi },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useChatSidebarMode', () => {
  it('starts in pinned mode by default', async () => {
    const { result } = renderHook(() => useChatSidebarMode());
    // Initial synchronous value is 'pinned' (sync fallback matches config default)
    expect(result.current.mode).toBe('pinned');
  });

  it('reads persisted mode from config on mount', async () => {
    configApi.getAll.mockResolvedValueOnce({ layout: { chatSidebarMode: 'collapsed' } });
    const { result } = renderHook(() => useChatSidebarMode());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.mode).toBe('collapsed');
  });

  it('cycles pinned → collapsed on first cycleMode call', async () => {
    const { result } = renderHook(() => useChatSidebarMode());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      result.current.cycleMode();
    });
    expect(result.current.mode).toBe('collapsed');
  });

  it('cycles collapsed → hidden on second cycleMode call', async () => {
    configApi.getAll.mockResolvedValueOnce({ layout: { chatSidebarMode: 'collapsed' } });
    const { result } = renderHook(() => useChatSidebarMode());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      result.current.cycleMode();
    });
    expect(result.current.mode).toBe('hidden');
  });

  it('cycles hidden → pinned (wraps around)', async () => {
    configApi.getAll.mockResolvedValueOnce({ layout: { chatSidebarMode: 'hidden' } });
    const { result } = renderHook(() => useChatSidebarMode());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      result.current.cycleMode();
    });
    expect(result.current.mode).toBe('pinned');
  });

  it('calls config.set when mode changes', async () => {
    const { result } = renderHook(() => useChatSidebarMode());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      result.current.cycleMode();
    });
    expect(configApi.set).toHaveBeenCalledWith(
      'layout',
      expect.objectContaining({ chatSidebarMode: 'collapsed' }),
    );
  });

  it('responds to CYCLE_CHAT_SIDEBAR_MODE_EVENT DOM event', async () => {
    const { result } = renderHook(() => useChatSidebarMode());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(CYCLE_CHAT_SIDEBAR_MODE_EVENT));
    });
    expect(result.current.mode).toBe('collapsed');
  });

  it('removes DOM event listener on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useChatSidebarMode());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith(CYCLE_CHAT_SIDEBAR_MODE_EVENT, expect.any(Function));
  });
});
