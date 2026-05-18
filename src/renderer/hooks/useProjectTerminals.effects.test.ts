/**
 * @vitest-environment jsdom
 *
 * useProjectTerminals.effects.test.ts — Wave 94 Phase B
 *
 * Contracts verified:
 *  - useProjectTerminalsMap: starts with empty map; seeds an empty entry when
 *    activeProjectPath becomes non-null for a path not yet in the map.
 *  - useProjectTerminalsMap.setProjectState: merges a patch into the named
 *    project's state without mutating other projects.
 *  - useProjectTerminalsMap: cold-boot hydration from electronAPI.config.get.
 *  - useProjectTerminalsPersist: calls electronAPI.config.set after debounce.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectTerminalsMap, useProjectTerminalsPersist } from './useProjectTerminals.effects';

// ---------------------------------------------------------------------------
// electronAPI mock
// ---------------------------------------------------------------------------

const mockGet = vi.fn();
const mockSet = vi.fn();

beforeEach(() => {
  mockGet.mockResolvedValue({});
  mockSet.mockResolvedValue(undefined);
  Object.defineProperty(window, 'electronAPI', {
    value: { config: { get: mockGet, set: mockSet } },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// useProjectTerminalsMap
// ---------------------------------------------------------------------------

describe('useProjectTerminalsMap', () => {
  it('starts with an empty map before cold-boot resolves', () => {
    // mockGet never resolves synchronously — map is {} until the Promise settles.
    mockGet.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useProjectTerminalsMap(null));
    expect(result.current.map).toEqual({});
  });

  it('hydrates from electronAPI.config.get on mount', async () => {
    const persisted = {
      '/proj/a': {
        primary: [{ id: 's1', title: 'bash', isClaude: false }],
        secondary: [],
        activeSessionPerSlot: { primary: 's1', secondary: null },
      },
    };
    mockGet.mockResolvedValue(persisted);
    const { result } = renderHook(() => useProjectTerminalsMap('/proj/a'));
    await waitFor(() => {
      expect(result.current.map['/proj/a']).toBeDefined();
      expect(result.current.map['/proj/a'].primary[0].id).toBe('s1');
    });
  });

  it('seeds an empty entry when activeProjectPath has no persisted state', async () => {
    mockGet.mockResolvedValue({});
    const { result } = renderHook(() => useProjectTerminalsMap('/new/project'));
    await waitFor(() => {
      expect(result.current.map['/new/project']).toBeDefined();
      expect(result.current.map['/new/project'].primary).toEqual([]);
      expect(result.current.map['/new/project'].secondary).toEqual([]);
    });
  });

  it('does not seed an entry when activeProjectPath is null', async () => {
    mockGet.mockResolvedValue({});
    const { result } = renderHook(() => useProjectTerminalsMap(null));
    await act(async () => {
      await Promise.resolve();
    });
    expect(Object.keys(result.current.map)).toHaveLength(0);
  });

  it('setProjectState merges patch into the target project without touching others', async () => {
    mockGet.mockResolvedValue({});
    const { result } = renderHook(() => useProjectTerminalsMap('/proj/a'));
    await waitFor(() => expect(result.current.map['/proj/a']).toBeDefined());

    act(() => {
      result.current.setProjectState('/proj/a', {
        activeSessionPerSlot: { primary: 's1', secondary: null },
      });
    });
    expect(result.current.map['/proj/a'].activeSessionPerSlot.primary).toBe('s1');
  });

  it('setProjectState for project B does not affect project A', async () => {
    const persisted = {
      '/proj/a': {
        primary: [],
        secondary: [],
        activeSessionPerSlot: { primary: 'orig', secondary: null },
      },
      '/proj/b': {
        primary: [],
        secondary: [],
        activeSessionPerSlot: { primary: null, secondary: null },
      },
    };
    mockGet.mockResolvedValue(persisted);
    const { result } = renderHook(() => useProjectTerminalsMap('/proj/a'));
    await waitFor(() => expect(result.current.map['/proj/a']).toBeDefined());

    act(() => {
      result.current.setProjectState('/proj/b', {
        activeSessionPerSlot: { primary: 's2', secondary: null },
      });
    });
    // Project A untouched.
    expect(result.current.map['/proj/a'].activeSessionPerSlot.primary).toBe('orig');
    expect(result.current.map['/proj/b'].activeSessionPerSlot.primary).toBe('s2');
  });
});

// ---------------------------------------------------------------------------
// useProjectTerminalsPersist
// ---------------------------------------------------------------------------

describe('useProjectTerminalsPersist', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls electronAPI.config.set after the 300ms debounce', async () => {
    const map = {
      '/proj/a': {
        primary: [],
        secondary: [],
        activeSessionPerSlot: { primary: null, secondary: null },
      },
    };
    renderHook(() => useProjectTerminalsPersist(map));

    expect(mockSet).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSet).toHaveBeenCalledWith('terminalSessionsPerProject', map);
  });

  it('does not call set before debounce fires', () => {
    const map = {};
    renderHook(() => useProjectTerminalsPersist(map));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('cancels the previous timer when the map changes before debounce', () => {
    const { rerender } = renderHook(
      ({ m }: { m: Record<string, unknown> }) => useProjectTerminalsPersist(m as never),
      { initialProps: { m: {} } },
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ m: { '/proj/a': {} } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Only one call should fire (the second one after full 300ms from last change).
    expect(mockSet).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(mockSet).toHaveBeenCalledTimes(1);
  });
});
