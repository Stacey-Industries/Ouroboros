/**
 * bridgeTimeout.test.ts — Unit tests for withTimeout<T>.
 *
 * Wave 33a Phase F.
 *
 * Covers:
 *  - Short / normal / long budget enforcement via fake timers.
 *  - Timeout response error format (TimeoutError).
 *  - Handler resolves within budget → passes through.
 *  - Late handler resolution after timeout → discarded (no double-settle).
 *  - Timeout increments the per-class metric counter.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../mobileAccess/capabilityGate', () => ({
  getTimeoutMs: vi.fn((channel: string) => {
    if (channel.startsWith('short:')) return 10_000;
    if (channel.startsWith('long:')) return 120_000;
    return 30_000; // normal default
  }),
}));

vi.mock('../mobileAccess/timeoutMetrics', () => ({
  incrementTimeout: vi.fn(),
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getTimeoutMs } from '../mobileAccess/capabilityGate';
import { incrementTimeout } from '../mobileAccess/timeoutMetrics';
import { TimeoutError, withTimeout } from './bridgeTimeout';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function never<T>(): Promise<T> {
  return new Promise<T>(() => { /* never resolves */ });
}

function resolveAfter<T>(ms: number, value: T): Promise<T> {
  return new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
}

function rejectAfter(ms: number, err: Error): Promise<never> {
  return new Promise<never>((_, reject) => setTimeout(() => reject(err), ms));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when handler completes before budget', async () => {
    const promise = withTimeout(Promise.resolve(42), 'normal:op');
    const result = await promise;
    expect(result).toBe(42);
  });

  it('passes through handler rejection before budget', async () => {
    const err = new Error('handler error');
    const promise = withTimeout(Promise.reject(err), 'normal:op');
    await expect(promise).rejects.toThrow('handler error');
  });

  // ── Short class (10 s) ────────────────────────────────────────────────────

  it('rejects with TimeoutError after short budget (10 000 ms)', async () => {
    const promise = withTimeout(never<void>(), 'short:health');
    vi.advanceTimersByTime(9_999);
    // Not yet
    let settled = false;
    promise.catch(() => { settled = true; });
    await Promise.resolve(); // flush microtasks
    expect(settled).toBe(false);

    vi.advanceTimersByTime(1);
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });

  it('TimeoutError carries channel and budgetMs for short class', async () => {
    const promise = withTimeout(never<void>(), 'short:health');
    vi.advanceTimersByTime(10_000);
    try {
      await promise;
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).channel).toBe('short:health');
      expect((err as TimeoutError).budgetMs).toBe(10_000);
    }
  });

  // ── Normal class (30 s) ───────────────────────────────────────────────────

  it('rejects with TimeoutError after normal budget (30 000 ms)', async () => {
    const promise = withTimeout(never<void>(), 'normal:op');
    vi.advanceTimersByTime(29_999);
    let rejected = false;
    promise.catch(() => { rejected = true; });
    await Promise.resolve();
    expect(rejected).toBe(false);

    vi.advanceTimersByTime(1);
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });

  it('does NOT timeout before normal budget when handler resolves in time', async () => {
    const inner = resolveAfter(15_000, 'done');
    const promise = withTimeout(inner, 'normal:op');
    vi.advanceTimersByTime(15_000);
    const result = await promise;
    expect(result).toBe('done');
  });

  // ── Long class (120 s) ────────────────────────────────────────────────────

  it('rejects with TimeoutError after long budget (120 000 ms)', async () => {
    const promise = withTimeout(never<void>(), 'long:chat');
    vi.advanceTimersByTime(119_999);
    let rejected = false;
    promise.catch(() => { rejected = true; });
    await Promise.resolve();
    expect(rejected).toBe(false);

    vi.advanceTimersByTime(1);
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });

  it('TimeoutError carries channel and budgetMs for long class', async () => {
    const promise = withTimeout(never<void>(), 'long:chat');
    vi.advanceTimersByTime(120_000);
    try {
      await promise;
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).channel).toBe('long:chat');
      expect((err as TimeoutError).budgetMs).toBe(120_000);
    }
  });

  // ── Metric counter ─────────────────────────────────────────────────────────

  it('calls incrementTimeout on timeout', async () => {
    const promise = withTimeout(never<void>(), 'short:ping');
    vi.advanceTimersByTime(10_000);
    await promise.catch(() => {});
    expect(incrementTimeout).toHaveBeenCalledWith('short:ping');
    expect(incrementTimeout).toHaveBeenCalledTimes(1);
  });

  it('does NOT call incrementTimeout when handler resolves in time', async () => {
    await withTimeout(Promise.resolve('ok'), 'short:ping');
    expect(incrementTimeout).not.toHaveBeenCalled();
  });

  // ── Double-resolve prevention ─────────────────────────────────────────────

  it('does not double-settle when handler resolves after timeout', async () => {
    // Handler resolves 5s after the budget fires
    const inner = resolveAfter(15_000, 'late');
    const promise = withTimeout(inner, 'short:health'); // budget = 10 000
    vi.advanceTimersByTime(10_000);
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);

    // Advance past handler resolve — should NOT cause a second settle
    vi.advanceTimersByTime(5_000);
    await Promise.resolve(); // flush
    expect(incrementTimeout).toHaveBeenCalledTimes(1); // still just the one timeout
  });

  it('does not double-settle when handler rejects after timeout', async () => {
    const inner = rejectAfter(20_000, new Error('late err'));
    const promise = withTimeout(inner, 'short:health');
    vi.advanceTimersByTime(10_000);
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);

    vi.advanceTimersByTime(10_000);
    await Promise.resolve();
    expect(incrementTimeout).toHaveBeenCalledTimes(1);
  });

  // ── getTimeoutMs integration ───────────────────────────────────────────────

  it('delegates budget lookup to getTimeoutMs', async () => {
    await withTimeout(Promise.resolve('x'), 'short:test');
    expect(getTimeoutMs).toHaveBeenCalledWith('short:test');
  });
});
