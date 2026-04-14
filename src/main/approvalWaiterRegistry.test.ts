/**
 * approvalWaiterRegistry.test.ts — Tests for the waiter registry used by
 * the approval.wait pipe-handshake (notifyWaiters, waitForResolution).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { notifyWaiters, waitForResolution } from './approvalWaiterRegistry';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('waitForResolution', () => {
  it('resolves when notifyWaiters fires for the same requestId', async () => {
    const { promise } = waitForResolution('wr-001', 5_000);
    notifyWaiters('wr-001', { decision: 'approve' });
    const result = await promise;
    expect(result.decision).toBe('approve');
  });

  it('resolves with reject decision', async () => {
    const { promise } = waitForResolution('wr-002', 5_000);
    notifyWaiters('wr-002', { decision: 'reject', reason: 'denied' });
    const result = await promise;
    expect(result.decision).toBe('reject');
    expect(result.reason).toBe('denied');
  });

  it('rejects after timeoutMs', async () => {
    vi.useFakeTimers();
    const { promise } = waitForResolution('wr-003', 100);
    vi.advanceTimersByTime(101);
    await expect(promise).rejects.toThrow(/timed out/);
    vi.useRealTimers();
  });

  it('race: resolves immediately if notifyWaiters fired before waitForResolution', async () => {
    notifyWaiters('wr-004', { decision: 'approve' });
    const { promise } = waitForResolution('wr-004', 5_000);
    const result = await promise;
    expect(result.decision).toBe('approve');
  });

  it('multiple concurrent waiters on different requestIds do not interfere', async () => {
    const { promise: p1 } = waitForResolution('wr-a', 5_000);
    const { promise: p2 } = waitForResolution('wr-b', 5_000);

    notifyWaiters('wr-b', { decision: 'reject', reason: 'no' });
    notifyWaiters('wr-a', { decision: 'approve' });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.decision).toBe('approve');
    expect(r2.decision).toBe('reject');
  });

  it('cancel() removes the waiter without settling the promise', async () => {
    vi.useFakeTimers();
    const { promise, cancel } = waitForResolution('wr-cancel', 5_000);
    cancel();
    vi.advanceTimersByTime(6_000);

    const sentinel = Symbol('unsettled');
    const raceResult = await Promise.race([
      promise.then(() => 'resolved').catch(() => 'rejected'),
      Promise.resolve(sentinel),
    ]);
    expect(raceResult).toBe(sentinel);
    vi.useRealTimers();
  });
});
