/**
 * sessionDispatchRunnerLifecycle.ts — Wave 34 Phase C.
 *
 * Tick-loop, interval management, and per-job timeout timers for the
 * dispatch runner. Extracted from sessionDispatchRunner.ts to keep both
 * files under the 300-line ESLint limit.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LifecycleState {
  intervalId: ReturnType<typeof setInterval> | null;
  /** Job timeouts keyed by jobId. */
  timeouts: Map<string, ReturnType<typeof setTimeout>>;
}

export type TickCallback = () => void;
export type TimeoutCallback = (jobId: string) => void;

// ── Interval management ───────────────────────────────────────────────────────

/**
 * Starts a 250 ms polling interval that calls `onTick` each cycle.
 * Returns the updated state. No-op if an interval is already running.
 */
export function startInterval(
  state: LifecycleState,
  onTick: TickCallback,
): LifecycleState {
  if (state.intervalId !== null) return state;
  const id = setInterval(onTick, 250);
  return { ...state, intervalId: id };
}

/**
 * Stops the polling interval. Returns updated state.
 */
export function stopInterval(state: LifecycleState): LifecycleState {
  if (state.intervalId === null) return state;
  clearInterval(state.intervalId);
  return { ...state, intervalId: null };
}

// ── Per-job timeout management ────────────────────────────────────────────────

/**
 * Registers a timeout for `jobId`. When it fires, calls `onTimeout(jobId)`.
 * If a timeout already exists for the job, replaces it.
 */
export function registerJobTimeout(
  state: LifecycleState,
  jobId: string,
  timeoutMs: number,
  onTimeout: TimeoutCallback,
): LifecycleState {
  const existing = state.timeouts.get(jobId);
  if (existing !== undefined) clearTimeout(existing);

  const next = new Map(state.timeouts);

  const id = setTimeout(() => {
    next.delete(jobId);
    onTimeout(jobId);
  }, timeoutMs);

  next.set(jobId, id);
  return { ...state, timeouts: next };
}

/**
 * Cancels and removes the timeout for `jobId`. No-op if none registered.
 */
export function clearJobTimeout(
  state: LifecycleState,
  jobId: string,
): LifecycleState {
  const id = state.timeouts.get(jobId);
  if (id === undefined) return state;
  clearTimeout(id);
  const next = new Map(state.timeouts);
  next.delete(jobId);
  return { ...state, timeouts: next };
}

/**
 * Clears all registered job timeouts.
 */
export function clearAllTimeouts(state: LifecycleState): LifecycleState {
  for (const id of state.timeouts.values()) clearTimeout(id);
  return { ...state, timeouts: new Map() };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function makeLifecycleState(): LifecycleState {
  return { intervalId: null, timeouts: new Map() };
}
