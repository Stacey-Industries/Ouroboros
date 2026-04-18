/**
 * @vitest-environment jsdom
 *
 * DispatchNotificationBanner.test.tsx — tests for the dispatch notification banner.
 *
 * Covers: completed toast fires success type, failed fires error type,
 * banner is capped at MAX_QUEUED=3, cleanup called on unmount.
 */

import { act,renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  toasts: [] as unknown[],
  cleanup: vi.fn(),
  onDispatchNotification: vi.fn(),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToastContext: () => ({
    toast: mocks.toast,
    toasts: mocks.toasts,
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { DispatchNotificationBanner } from './DispatchNotificationBanner';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type NotifPayload = { jobId: string; title: string; body: string; status: 'completed' | 'failed' };
type NotifCallback = (payload: NotifPayload) => void;

function setupElectronAPI(cb?: (handler: NotifCallback) => void) {
  mocks.onDispatchNotification.mockImplementation((handler: NotifCallback) => {
    cb?.(handler);
    return mocks.cleanup;
  });
  Object.defineProperty(globalThis, 'window', {
    value: {
      electronAPI: {
        sessions: { onDispatchNotification: mocks.onDispatchNotification },
      },
    },
    writable: true,
    configurable: true,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.toasts.length = 0;
});

afterEach(() => { vi.clearAllMocks(); });

describe('DispatchNotificationBanner — completed job', () => {
  it('fires a success toast with job title and body', () => {
    let capturedHandler: NotifCallback | undefined;
    setupElectronAPI((h) => { capturedHandler = h; });

    renderHook(() => DispatchNotificationBanner());

    act(() => {
      capturedHandler?.({
        jobId: 'j1',
        title: 'Job completed',
        body: '"My Task" finished successfully.',
        status: 'completed',
      });
    });

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.stringContaining('Job completed'),
      'success',
      expect.objectContaining({ duration: 6000 }),
    );
  });
});

describe('DispatchNotificationBanner — failed job', () => {
  it('fires an error toast', () => {
    let capturedHandler: NotifCallback | undefined;
    setupElectronAPI((h) => { capturedHandler = h; });

    renderHook(() => DispatchNotificationBanner());

    act(() => {
      capturedHandler?.({
        jobId: 'j2',
        title: 'Job failed',
        body: '"My Task" failed: timeout',
        status: 'failed',
      });
    });

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.stringContaining('Job failed'),
      'error',
      expect.any(Object),
    );
  });
});

describe('DispatchNotificationBanner — queue cap', () => {
  it('suppresses new toasts when already at MAX_QUEUED (3)', () => {
    // Simulate 3 visible toasts already queued
    (mocks.toasts as unknown[]).push({}, {}, {});
    let capturedHandler: NotifCallback | undefined;
    setupElectronAPI((h) => { capturedHandler = h; });

    renderHook(() => DispatchNotificationBanner());

    act(() => {
      capturedHandler?.({ jobId: 'j3', title: 'T', body: 'B', status: 'completed' });
    });

    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('fires toast when queue has room (fewer than 3)', () => {
    (mocks.toasts as unknown[]).push({}, {});
    let capturedHandler: NotifCallback | undefined;
    setupElectronAPI((h) => { capturedHandler = h; });

    renderHook(() => DispatchNotificationBanner());

    act(() => {
      capturedHandler?.({ jobId: 'j4', title: 'T', body: 'B', status: 'completed' });
    });

    expect(mocks.toast).toHaveBeenCalledOnce();
  });
});

describe('DispatchNotificationBanner — cleanup', () => {
  it('calls cleanup fn on unmount', () => {
    setupElectronAPI();
    const { unmount } = renderHook(() => DispatchNotificationBanner());
    unmount();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
});

describe('DispatchNotificationBanner — missing API', () => {
  it('does not throw when electronAPI.sessions is absent', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: {} },
      writable: true,
      configurable: true,
    });
    expect(() => renderHook(() => DispatchNotificationBanner())).not.toThrow();
  });
});
