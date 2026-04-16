/**
 * useFolders.test.ts — Unit tests for the useFolders hook.
 *
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionFolder } from '../../types/electron';
import { useFolders } from './useFolders';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeFolder(id: string, name = 'Test Folder'): SessionFolder {
  return { id, name, sessionIds: [], createdAt: 1000, order: 0 };
}

// ─── electronAPI mock ─────────────────────────────────────────────────────────

let onChangedCleanup = vi.fn();
let onChangedCallback: ((folders: SessionFolder[]) => void) | null = null;

const mockFolderCrud = {
  list: vi.fn(),
  onChanged: vi.fn((cb: (folders: SessionFolder[]) => void) => {
    onChangedCallback = cb;
    return onChangedCleanup;
  }),
};

beforeEach(() => {
  onChangedCallback = null;
  onChangedCleanup = vi.fn();

  mockFolderCrud.list.mockResolvedValue({ success: true, folders: [] });
  mockFolderCrud.onChanged.mockImplementation((cb: (folders: SessionFolder[]) => void) => {
    onChangedCallback = cb;
    return onChangedCleanup;
  });

  Object.defineProperty(window, 'electronAPI', {
    value: { folderCrud: mockFolderCrud },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useFolders', () => {
  it('starts with isLoading true and empty folders', () => {
    mockFolderCrud.list.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useFolders());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.folders).toEqual([]);
  });

  it('populates folders after load resolves', async () => {
    const f = makeFolder('f-1');
    mockFolderCrud.list.mockResolvedValue({ success: true, folders: [f] });
    const { result } = renderHook(() => useFolders());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.folders).toHaveLength(1);
    expect(result.current.folders[0]?.id).toBe('f-1');
  });

  it('live-updates folders when onChanged fires', async () => {
    const { result } = renderHook(() => useFolders());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const updated = [makeFolder('f-live-1'), makeFolder('f-live-2')];
    act(() => { onChangedCallback?.(updated); });

    expect(result.current.folders).toHaveLength(2);
    expect(result.current.folders[0]?.id).toBe('f-live-1');
  });

  it('calls onChanged cleanup on unmount', async () => {
    const { unmount } = renderHook(() => useFolders());
    await waitFor(() => expect(mockFolderCrud.onChanged).toHaveBeenCalled());
    unmount();
    expect(onChangedCleanup).toHaveBeenCalledOnce();
  });

  it('refresh triggers a new list fetch', async () => {
    const { result } = renderHook(() => useFolders());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsBefore = mockFolderCrud.list.mock.calls.length;
    act(() => { result.current.refresh(); });
    await waitFor(() =>
      expect(mockFolderCrud.list.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it('returns empty folders when list result is not success', async () => {
    mockFolderCrud.list.mockResolvedValue({ success: false, error: 'store not ready' });
    const { result } = renderHook(() => useFolders());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.folders).toEqual([]);
  });

  it('returns empty folders when electronAPI is absent', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electronAPI;
    const { result } = renderHook(() => useFolders());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.folders).toEqual([]);
  });
});
