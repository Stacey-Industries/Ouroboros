/**
 * usePermalinkBridge.test.ts
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OPEN_THREAD_EVENT } from './appEventNames';
import { usePermalinkBridge } from './usePermalinkBridge';

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).electronAPI;
});

describe('usePermalinkBridge', () => {
  it('no-ops when electronAPI is missing', () => {
    renderHook(() => usePermalinkBridge());
    // Just verifying no throw
    expect(true).toBe(true);
  });

  it('dispatches OPEN_THREAD_EVENT when IPC callback fires', () => {
    let ipcCallback: ((payload: { threadId: string; messageId?: string }) => void) | null = null;
    const cleanup = vi.fn();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      app: {
        onNavigateToPermalink: (cb: typeof ipcCallback) => {
          ipcCallback = cb;
          return cleanup;
        },
      },
    };

    const dispatched: CustomEvent[] = [];
    const listener = (e: Event): void => { dispatched.push(e as CustomEvent); };
    window.addEventListener(OPEN_THREAD_EVENT, listener);

    renderHook(() => usePermalinkBridge());
    expect(ipcCallback).not.toBeNull();
    ipcCallback?.({ threadId: 'abc', messageId: 'm1' });

    window.removeEventListener(OPEN_THREAD_EVENT, listener);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].detail).toEqual({ threadId: 'abc', messageId: 'm1' });
  });

  it('returns the IPC cleanup on unmount', () => {
    const cleanup = vi.fn();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      app: { onNavigateToPermalink: () => cleanup },
    };
    const { unmount } = renderHook(() => usePermalinkBridge());
    unmount();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
