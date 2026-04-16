/**
 * useSideChat.test.ts — Wave 23 Phase C
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSideChat } from './useSideChat';

// ── electronAPI mock ──────────────────────────────────────────────────────────

function installElectronApi(forkResult: { success: boolean; thread?: { id: string }; error?: string }): void {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      agentChat: {
        forkThread: vi.fn().mockResolvedValue(forkResult),
      },
    },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  installElectronApi({ success: true, thread: { id: 'side-1' } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSideChat', () => {
  it('initialises with empty state', () => {
    const { result } = renderHook(() => useSideChat());
    expect(result.current.sideChats).toEqual([]);
    expect(result.current.activeSideChatId).toBeNull();
  });

  it('openSideChat forks and appends the new thread ID', async () => {
    const { result } = renderHook(() => useSideChat());

    let returnedId: string | null = null;
    await act(async () => {
      returnedId = await result.current.openSideChat('parent-1', 'msg-1', false);
    });

    expect(returnedId).toBe('side-1');
    expect(result.current.sideChats).toEqual(['side-1']);
    expect(result.current.activeSideChatId).toBe('side-1');
  });

  it('openSideChat does not duplicate an already-open thread', async () => {
    const { result } = renderHook(() => useSideChat());

    await act(async () => { await result.current.openSideChat('parent-1', 'msg-1'); });
    await act(async () => { await result.current.openSideChat('parent-1', 'msg-1'); });

    // forkThread is called twice but the ID returned is the same mock value
    expect(result.current.sideChats).toEqual(['side-1']);
  });

  it('openSideChat returns null when forkThread fails', async () => {
    installElectronApi({ success: false, error: 'oops' });
    const { result } = renderHook(() => useSideChat());

    let returnedId: string | null = 'not-null';
    await act(async () => {
      returnedId = await result.current.openSideChat('parent-1', 'msg-1');
    });

    expect(returnedId).toBeNull();
    expect(result.current.sideChats).toEqual([]);
  });

  it('closeSideChat removes the thread from the list', async () => {
    const { result } = renderHook(() => useSideChat());
    await act(async () => { await result.current.openSideChat('parent-1', 'msg-1'); });

    act(() => { result.current.closeSideChat('side-1'); });

    expect(result.current.sideChats).toEqual([]);
    expect(result.current.activeSideChatId).toBeNull();
  });

  it('closeSideChat does not clear activeSideChatId when closing a different tab', async () => {
    // open two distinct side chats
    installElectronApi({ success: true, thread: { id: 'side-1' } });
    const { result } = renderHook(() => useSideChat());
    await act(async () => { await result.current.openSideChat('parent-1', 'msg-1'); });

    // manually inject a second entry
    act(() => { result.current.setActive('side-1'); });

    act(() => { result.current.closeSideChat('other-id'); });

    expect(result.current.activeSideChatId).toBe('side-1');
  });

  it('setActive changes the active thread', async () => {
    const { result } = renderHook(() => useSideChat());
    await act(async () => { await result.current.openSideChat('parent-1', 'msg-1'); });

    act(() => { result.current.setActive(null); });
    expect(result.current.activeSideChatId).toBeNull();

    act(() => { result.current.setActive('side-1'); });
    expect(result.current.activeSideChatId).toBe('side-1');
  });
});
