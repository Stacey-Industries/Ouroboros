/**
 * @vitest-environment jsdom
 *
 * useMemoryEntries.test.ts — Unit tests for the memory entries hook.
 *
 * Covers:
 *   - Empty initial state before IPC resolves
 *   - Populates after IPC resolves successfully
 *   - Re-fetches when memory:changed fires
 *   - Cleans up listener and cancels setState on unmount
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryEntry } from '../types/electron-memory';
import { useMemoryEntries } from './useMemoryEntries';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENTRY_A: MemoryEntry = {
  id: 'constraints',
  title: 'Constraints',
  description: 'Max subscription, no API key',
  section: 'Constraints',
  filePath: '/home/user/.claude/projects/C--project/memory/constraints.md',
  exists: true,
};

const ENTRY_B: MemoryEntry = {
  id: 'philosophy',
  title: 'Product Philosophy',
  description: 'Amplifier not replacement',
  section: 'Product Philosophy',
  filePath: '/home/user/.claude/projects/C--project/memory/philosophy.md',
  exists: true,
};

// ─── Electron API mock helpers ────────────────────────────────────────────────

type ChangedCallback = () => void;

function makeMemoryApi(entries: MemoryEntry[] = []) {
  let changeListener: ChangedCallback | null = null;

  const api = {
    list: vi.fn().mockResolvedValue({ success: true, entries }),
    read: vi.fn().mockResolvedValue({ success: true, content: '' }),
    onChanged: vi.fn((cb: ChangedCallback) => {
      changeListener = cb;
      return () => {
        changeListener = null;
      };
    }),
    fireChanged: () => changeListener?.(),
  };

  return api;
}

function installApi(api: ReturnType<typeof makeMemoryApi>): void {
  Object.defineProperty(window, 'electronAPI', {
    value: { memory: api },
    writable: true,
    configurable: true,
  });
}

function removeApi(): void {
  Object.defineProperty(window, 'electronAPI', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  removeApi();
});

describe('useMemoryEntries', () => {
  it('returns empty array as initial state', () => {
    installApi(makeMemoryApi([]));
    const { result } = renderHook(() => useMemoryEntries('/project'));
    // Before the IPC promise resolves, state is still []
    expect(result.current).toEqual([]);
  });

  it('populates entries after IPC resolves', async () => {
    installApi(makeMemoryApi([ENTRY_A, ENTRY_B]));
    const { result } = renderHook(() => useMemoryEntries('/project'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toHaveLength(2);
    expect(result.current[0].id).toBe('constraints');
    expect(result.current[1].id).toBe('philosophy');
  });

  it('re-fetches when memory:changed fires', async () => {
    const api = makeMemoryApi([ENTRY_A]);
    installApi(api);
    const { result } = renderHook(() => useMemoryEntries('/project'));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toHaveLength(1);

    // Update the mock to return an extra entry on next call
    api.list.mockResolvedValueOnce({ success: true, entries: [ENTRY_A, ENTRY_B] });

    await act(async () => {
      api.fireChanged();
      await Promise.resolve();
    });
    expect(result.current).toHaveLength(2);
  });

  it('cleans up the onChanged listener on unmount', async () => {
    const api = makeMemoryApi([ENTRY_A]);
    installApi(api);
    const { unmount } = renderHook(() => useMemoryEntries('/project'));

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    // The teardown returned by onChanged should have been called,
    // so firing changed should not trigger another list call.
    const callCountBeforeFire = api.list.mock.calls.length;
    api.fireChanged();
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.list.mock.calls.length).toBe(callCountBeforeFire);
  });

  it('returns empty array when electronAPI is unavailable', () => {
    removeApi();
    const { result } = renderHook(() => useMemoryEntries('/project'));
    expect(result.current).toEqual([]);
  });

  it('returns empty array when IPC returns success: false', async () => {
    const api = makeMemoryApi();
    api.list.mockResolvedValue({ success: false, error: 'not found' });
    installApi(api);
    const { result } = renderHook(() => useMemoryEntries('/project'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual([]);
  });
});
