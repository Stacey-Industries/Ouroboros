/**
 * sessionDispatchRunnerLifecycle.test.ts — Wave 34 Phase C.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllTimeouts,
  clearJobTimeout,
  makeLifecycleState,
  registerJobTimeout,
  startInterval,
  stopInterval,
} from './sessionDispatchRunnerLifecycle';

describe('sessionDispatchRunnerLifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // ── interval ────────────────────────────────────────────────────────────────

  describe('startInterval / stopInterval', () => {
    it('calls onTick on each 250 ms cycle', () => {
      const onTick = vi.fn();
      let state = makeLifecycleState();
      state = startInterval(state, onTick);

      vi.advanceTimersByTime(750);
      expect(onTick).toHaveBeenCalledTimes(3);

      stopInterval(state);
      vi.advanceTimersByTime(500);
      expect(onTick).toHaveBeenCalledTimes(3); // no additional calls after stop
    });

    it('startInterval is idempotent — second call is a no-op', () => {
      const onTick = vi.fn();
      let state = makeLifecycleState();
      state = startInterval(state, onTick);
      const firstId = state.intervalId;
      state = startInterval(state, onTick); // second call
      expect(state.intervalId).toBe(firstId);
      stopInterval(state);
    });

    it('stopInterval on idle state is a no-op', () => {
      const state = makeLifecycleState();
      expect(() => stopInterval(state)).not.toThrow();
    });

    it('stopInterval clears intervalId to null', () => {
      let state = makeLifecycleState();
      state = startInterval(state, vi.fn());
      state = stopInterval(state);
      expect(state.intervalId).toBeNull();
    });
  });

  // ── per-job timeout ─────────────────────────────────────────────────────────

  describe('registerJobTimeout', () => {
    it('fires onTimeout after timeoutMs', () => {
      const onTimeout = vi.fn();
      const state = makeLifecycleState();
      registerJobTimeout(state, 'j1', 1000, onTimeout);

      vi.advanceTimersByTime(999);
      expect(onTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledOnce();
      expect(onTimeout).toHaveBeenCalledWith('j1');
    });

    it('replaces existing timeout for same jobId', () => {
      const onTimeout = vi.fn();
      const base = makeLifecycleState();
      const after1 = registerJobTimeout(base, 'j1', 1000, onTimeout);
      registerJobTimeout(after1, 'j1', 5000, onTimeout); // replaces

      vi.advanceTimersByTime(1000);
      expect(onTimeout).not.toHaveBeenCalled(); // old timer cancelled

      vi.advanceTimersByTime(4000);
      expect(onTimeout).toHaveBeenCalledOnce();
    });

    it('removes jobId from timeouts map after firing', () => {
      let state = makeLifecycleState();
      state = registerJobTimeout(state, 'j1', 100, () => undefined);
      expect(state.timeouts.has('j1')).toBe(true);

      vi.advanceTimersByTime(100);
      expect(state.timeouts.has('j1')).toBe(false);
    });
  });

  describe('clearJobTimeout', () => {
    it('cancels a registered timeout and removes it from map', () => {
      const onTimeout = vi.fn();
      let state = makeLifecycleState();
      state = registerJobTimeout(state, 'j1', 1000, onTimeout);
      state = clearJobTimeout(state, 'j1');

      vi.advanceTimersByTime(2000);
      expect(onTimeout).not.toHaveBeenCalled();
      expect(state.timeouts.has('j1')).toBe(false);
    });

    it('is a no-op for unknown jobId', () => {
      const state = makeLifecycleState();
      expect(() => clearJobTimeout(state, 'unknown')).not.toThrow();
    });
  });

  describe('clearAllTimeouts', () => {
    it('cancels all registered timeouts', () => {
      const onTimeout = vi.fn();
      let state = makeLifecycleState();
      state = registerJobTimeout(state, 'j1', 1000, onTimeout);
      state = registerJobTimeout(state, 'j2', 2000, onTimeout);
      state = clearAllTimeouts(state);

      vi.advanceTimersByTime(3000);
      expect(onTimeout).not.toHaveBeenCalled();
      expect(state.timeouts.size).toBe(0);
    });
  });
});
