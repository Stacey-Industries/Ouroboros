/**
 * approvalWaiter.test.ts — Integration tests for the approval.wait pipe-handshake:
 * respondToApproval → notifyWaiters → waitForResolution promise resolution.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules that have Electron / native dependencies
vi.mock('./windowManager', () => ({ getAllActiveWindows: () => [] }));
vi.mock('./web/webServer', () => ({ broadcastToWebClients: vi.fn() }));
vi.mock('./config', () => ({ getConfigValue: vi.fn(() => undefined) }));
vi.mock('./hooksLifecycleHandlers', () => ({ getPermissionContext: vi.fn(() => undefined) }));
vi.mock('./fdPressureDiagnostics', () => ({ describeFdPressure: () => 'fd:0' }));
vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock fs so respondToApproval doesn't hit the real filesystem
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
    },
  };
});

import {
  respondToApproval,
  startApprovalManagerCleanup,
  stopApprovalManagerCleanup,
  waitForResolution,
} from './approvalManager';

beforeEach(() => {
  startApprovalManagerCleanup();
});

afterEach(() => {
  stopApprovalManagerCleanup();
  vi.restoreAllMocks();
});

describe('waitForResolution (integration via respondToApproval)', () => {
  it('resolves when respondToApproval fires for the same requestId', async () => {
    const { promise } = waitForResolution('req-001', 5_000);
    await respondToApproval('req-001', { decision: 'approve' });
    const result = await promise;
    expect(result.decision).toBe('approve');
  });

  it('resolves with reject decision when respondToApproval rejects', async () => {
    const { promise } = waitForResolution('req-002', 5_000);
    await respondToApproval('req-002', { decision: 'reject', reason: 'denied' });
    const result = await promise;
    expect(result.decision).toBe('reject');
  });

  it('rejects after timeoutMs elapses', async () => {
    vi.useFakeTimers();
    const { promise } = waitForResolution('req-003', 100);
    vi.advanceTimersByTime(101);
    await expect(promise).rejects.toThrow(/timed out/);
    vi.useRealTimers();
  });

  it('race: resolves immediately if resolution fired before waitForResolution is called', async () => {
    await respondToApproval('req-004', { decision: 'approve' });
    const { promise } = waitForResolution('req-004', 5_000);
    const result = await promise;
    expect(result.decision).toBe('approve');
  });

  it('multiple concurrent waiters on different requestIds do not interfere', async () => {
    const { promise: p1 } = waitForResolution('req-ma', 5_000);
    const { promise: p2 } = waitForResolution('req-mb', 5_000);

    await respondToApproval('req-mb', { decision: 'reject', reason: 'denied-b' });
    await respondToApproval('req-ma', { decision: 'approve' });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.decision).toBe('approve');
    expect(r2.decision).toBe('reject');
  });

  it('cancel() removes the waiter without settling the promise', async () => {
    vi.useFakeTimers();
    const { promise, cancel } = waitForResolution('req-cancel', 5_000);
    cancel();
    vi.advanceTimersByTime(6_000);

    const sentinel = Symbol('not-settled');
    const raceResult = await Promise.race([
      promise.then(() => 'resolved').catch(() => 'rejected'),
      Promise.resolve(sentinel),
    ]);
    expect(raceResult).toBe(sentinel);
    vi.useRealTimers();
  });
});
