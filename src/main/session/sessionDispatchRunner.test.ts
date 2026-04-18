/**
 * sessionDispatchRunner.test.ts — Wave 34 Phase C.
 *
 * Covers:
 *   - queued → starting → running → completed transition
 *   - concurrency cap enforcement
 *   - worktree branch (called when worktreeName present, skipped when absent)
 *   - job timeout fires with status=failed, error='timeout', kills session
 *   - cancel hook kills the session
 *   - stopDispatchRunner halts the interval; no further activity
 *   - broadcastJobStatus fires on every status change
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Fake timers: activated once for the entire suite ──────────────────────────
// Switching between real/fake timers between tests causes the previous test's
// setInterval to migrate from fake→real clock, producing spurious real-time
// ticks that fire into the next test. Keep fake timers on for the full suite.

beforeAll(() => vi.useFakeTimers());
afterAll(() => vi.useRealTimers());

// ── Config ────────────────────────────────────────────────────────────────────

const mockConfig = {
  sessionDispatch: { enabled: true, maxConcurrent: 1, jobTimeoutMs: 10_000, queue: [] },
  usePtyHost: false,
};

vi.mock('../config', () => ({
  getConfigValue: (k: string) => mockConfig[k as keyof typeof mockConfig],
}));

// ── Logger ────────────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Queue ─────────────────────────────────────────────────────────────────────

type CancelHook = (jobId: string) => void;

const mockNextQueued = vi.fn(() => null as import('./sessionDispatch').DispatchJob | null);
const mockUpdateJob = vi.fn();
const mockRegisterCancelHook = vi.fn();

vi.mock('./sessionDispatchQueue', () => ({
  nextQueued: () => mockNextQueued(),
  updateJob: (id: string, patch: object) => mockUpdateJob(id, patch),
  registerCancelHook: (fn: CancelHook) => mockRegisterCancelHook(fn),
}));

// ── Status broadcast ──────────────────────────────────────────────────────────

const mockBroadcastJobStatus = vi.fn();
vi.mock('./sessionDispatchRunnerStatus', () => ({
  broadcastJobStatus: (job: object) => mockBroadcastJobStatus(job),
}));

// ── Worktree manager ──────────────────────────────────────────────────────────

const mockWorktreeAdd = vi.fn(() => Promise.resolve({ path: '/worktrees/wt1' }));
vi.mock('./worktreeManager', () => ({
  getWorktreeManager: () => ({ add: mockWorktreeAdd }),
}));

// ── Spawn adapter ─────────────────────────────────────────────────────────────

type CompletionControl = { resolve: () => void; reject: (e: Error) => void };

const mockKillSession = vi.fn(() => Promise.resolve(undefined));
const mockSpawnAgentSession = vi.fn();

vi.mock('./sessionSpawnAdapter', () => ({
  spawnAgentSession: (...a: unknown[]) => mockSpawnAgentSession(...a),
  killSession: (...a: unknown[]) => mockKillSession(...a),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { DispatchJob } from './sessionDispatch';

function makeJob(overrides: Partial<DispatchJob> = {}): DispatchJob {
  return {
    id: 'job-1',
    status: 'queued',
    createdAt: new Date().toISOString(),
    request: { title: 'Test', prompt: 'Do something', projectPath: '/project' },
    ...overrides,
  };
}

/** Flush pending microtasks (N iterations covers nested async/await chains). */
async function flushMicrotasks(n = 200) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

/** Fires the 250 ms interval tick once and drains the resulting async chain. */
async function runOneTick() {
  vi.advanceTimersByTime(250);
  await flushMicrotasks();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sessionDispatchRunner', () => {
  // Imported once — module is stateful (activeHandles, running flag).
  // stopDispatchRunner() in beforeEach/afterEach ensures clean state.
  let runner: typeof import('./sessionDispatchRunner');
  let cancelHooks: CancelHook[];
  // Completion controllers registered per-test so beforeEach can drain chains.
  let pendingCompletions: CompletionControl[];

  /** Registers a fresh spawn mock and returns the completion controller. */
  function makeCompletionCtrl(): CompletionControl {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const completion = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    mockSpawnAgentSession.mockResolvedValueOnce({ ptyId: 'pty-abc', completion });
    const ctrl = { resolve, reject };
    pendingCompletions.push(ctrl);
    return ctrl;
  }

  beforeAll(async () => {
    runner = await import('./sessionDispatchRunner');
  });

  beforeEach(async () => {
    // 1. Force-reset module state: clears activeHandles, interval, timeouts.
    //    Unlike stopDispatchRunner(), this works even when running=false.
    runner._forceResetForTest();
    vi.clearAllTimers();

    // 2. Resolve all completions from the prior test so wireCompletion() chains
    //    settle. Because activeHandles is now empty, those chains are no-ops.
    if (pendingCompletions) {
      for (const ctrl of pendingCompletions) ctrl.resolve();
    }
    // Drain: all prior async chains complete against an empty activeHandles,
    // so they return early without touching mocks.
    await flushMicrotasks(200);

    // Force-reset again: in case any drained microtask snuck something into
    // activeHandles between the first reset and the flush.
    runner._forceResetForTest();

    // 3. Reset ALL mocks (clears call histories AND once-queues) after draining.
    //    vi.clearAllMocks() only clears call histories; once-queues (from
    //    mockReturnValueOnce / mockResolvedValueOnce) persist and contaminate
    //    subsequent tests. vi.resetAllMocks() clears everything.
    cancelHooks = [];
    pendingCompletions = [];
    vi.resetAllMocks();
    mockConfig.sessionDispatch = { enabled: true, maxConcurrent: 1, jobTimeoutMs: 10_000, queue: [] };
    mockRegisterCancelHook.mockImplementation((fn: CancelHook) => cancelHooks.push(fn));
    mockNextQueued.mockReturnValue(null);
    mockWorktreeAdd.mockResolvedValue({ path: '/worktrees/wt1' });
    mockKillSession.mockResolvedValue(undefined);

    // 4. Guard: activeHandles must be 0 after reset.
    expect(runner.getRunnerState().activeJobs).toBe(0);
  });

  // ── Status transitions ────────────────────────────────────────────────────

  it('transitions queued → starting → running → completed', async () => {
    const job = makeJob();
    mockNextQueued.mockReturnValueOnce(job).mockReturnValue(null);
    mockUpdateJob.mockImplementation((id, patch) => ({ ...job, ...patch }));
    const ctrl = makeCompletionCtrl();

    runner.startDispatchRunner();
    await runOneTick();

    expect(mockUpdateJob).toHaveBeenCalledWith('job-1',
      expect.objectContaining({ status: 'starting' }));
    expect(mockUpdateJob).toHaveBeenCalledWith('job-1',
      expect.objectContaining({ status: 'running', sessionId: 'pty-abc' }));

    ctrl.resolve();
    await flushMicrotasks();

    expect(mockUpdateJob).toHaveBeenCalledWith('job-1',
      expect.objectContaining({ status: 'completed' }));
  });

  it('broadcasts on every status transition', async () => {
    const job = makeJob();
    mockNextQueued.mockReturnValueOnce(job).mockReturnValue(null);
    mockUpdateJob.mockImplementation((id, patch) => ({ ...job, ...patch }));
    const ctrl = makeCompletionCtrl();

    runner.startDispatchRunner();
    await runOneTick();

    ctrl.resolve();
    await flushMicrotasks();

    // starting, running, completed = 3 broadcasts minimum
    expect(mockBroadcastJobStatus).toHaveBeenCalledTimes(3);
  });

  // ── Concurrency cap ───────────────────────────────────────────────────────

  it('does not start a second job while one is active (cap=1)', async () => {
    const job1 = makeJob({ id: 'job-1' });
    const job2 = makeJob({ id: 'job-2' });
    mockNextQueued
      .mockReturnValueOnce(job1)
      .mockReturnValueOnce(job2)
      .mockReturnValue(null);
    mockUpdateJob.mockImplementation((id, patch) => ({ id, ...patch }));
    makeCompletionCtrl(); // job1 — stays pending

    runner.startDispatchRunner();

    // First tick: job-1 starts
    await runOneTick();

    // Second tick while job-1 is still running: job-2 must NOT start
    await runOneTick();

    const runningCalls = mockUpdateJob.mock.calls.filter(
      ([, patch]) => (patch as Partial<DispatchJob>).status === 'running',
    );
    expect(runningCalls.length).toBe(1); // only job-1
  });

  it('starts second job after cap=2', async () => {
    mockConfig.sessionDispatch.maxConcurrent = 2;

    const job1 = makeJob({ id: 'j1' });
    const job2 = makeJob({ id: 'j2' });
    mockNextQueued
      .mockReturnValueOnce(job1)
      .mockReturnValueOnce(job2)
      .mockReturnValue(null);
    mockUpdateJob.mockImplementation((id, patch) => ({ id, ...patch }));
    makeCompletionCtrl(); // j1 — stays pending
    makeCompletionCtrl(); // j2 — stays pending

    runner.startDispatchRunner();
    await runOneTick();
    await runOneTick();

    const runningCalls = mockUpdateJob.mock.calls.filter(
      ([, patch]) => (patch as Partial<DispatchJob>).status === 'running',
    );
    expect(runningCalls.length).toBe(2);
  });

  // ── Worktree branch ───────────────────────────────────────────────────────

  it('calls worktreeManager.add when worktreeName is present', async () => {
    const job = makeJob({
      request: { title: 'T', prompt: 'P', projectPath: '/proj', worktreeName: 'feat-branch' },
    });
    mockNextQueued.mockReturnValueOnce(job).mockReturnValue(null);
    mockUpdateJob.mockImplementation((id, patch) => ({ ...job, ...patch }));
    makeCompletionCtrl();

    runner.startDispatchRunner();
    await runOneTick();

    expect(mockWorktreeAdd).toHaveBeenCalledWith('/proj', 'feat-branch');
    expect(mockSpawnAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/worktrees/wt1' }),
    );
  });

  it('does NOT call worktreeManager.add when worktreeName is absent', async () => {
    const job = makeJob();
    mockNextQueued.mockReturnValueOnce(job).mockReturnValue(null);
    mockUpdateJob.mockImplementation((id, patch) => ({ ...job, ...patch }));
    makeCompletionCtrl();

    runner.startDispatchRunner();
    await runOneTick();

    expect(mockWorktreeAdd).not.toHaveBeenCalled();
    expect(mockSpawnAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: undefined }),
    );
  });

  it('marks job failed when worktree creation throws', async () => {
    mockWorktreeAdd.mockRejectedValueOnce(new Error('git error'));
    const job = makeJob({
      request: { title: 'T', prompt: 'P', projectPath: '/proj', worktreeName: 'bad' },
    });
    mockNextQueued.mockReturnValueOnce(job).mockReturnValue(null);
    mockUpdateJob.mockImplementation((id, patch) => ({ ...job, ...patch }));

    runner.startDispatchRunner();
    await runOneTick();

    expect(mockUpdateJob).toHaveBeenCalledWith('job-1',
      expect.objectContaining({ status: 'failed', error: 'git error' }),
    );
    expect(mockSpawnAgentSession).not.toHaveBeenCalled();
  });

  // ── Timeout ───────────────────────────────────────────────────────────────

  it('marks job failed with error=timeout after jobTimeoutMs', async () => {
    mockConfig.sessionDispatch.jobTimeoutMs = 5_000;
    const job = makeJob();
    mockNextQueued.mockReturnValueOnce(job).mockReturnValue(null);
    mockUpdateJob.mockImplementation((id, patch) => ({ ...job, ...patch }));
    makeCompletionCtrl();

    runner.startDispatchRunner();
    await runOneTick(); // flushes full startJob chain including registerJobTimeout

    // Now the job timeout timer is registered — advance past it
    vi.advanceTimersByTime(5_001);
    await flushMicrotasks();

    expect(mockUpdateJob).toHaveBeenCalledWith('job-1',
      expect.objectContaining({ status: 'failed', error: 'timeout' }),
    );
    expect(mockKillSession).toHaveBeenCalledWith('pty-abc');
  });

  // ── Cancel hook ───────────────────────────────────────────────────────────

  it('cancel hook kills the session', async () => {
    const job = makeJob();
    mockNextQueued.mockReturnValueOnce(job).mockReturnValue(null);
    mockUpdateJob.mockImplementation((id, patch) => ({ ...job, ...patch }));
    makeCompletionCtrl();

    runner.startDispatchRunner();
    await runOneTick();

    expect(cancelHooks.length).toBeGreaterThan(0);
    cancelHooks[0]('job-1');
    await flushMicrotasks();

    expect(mockKillSession).toHaveBeenCalledWith('pty-abc');
  });

  // ── Stop ──────────────────────────────────────────────────────────────────

  it('stopDispatchRunner halts the interval — no further ticks', async () => {
    mockNextQueued.mockReturnValue(null);
    runner.startDispatchRunner();
    runner.stopDispatchRunner();

    vi.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(mockNextQueued).not.toHaveBeenCalled();
  });

  it('getRunnerState reflects running flag and activeJobs', () => {
    mockNextQueued.mockReturnValue(null);

    expect(runner.getRunnerState().running).toBe(false);
    runner.startDispatchRunner();
    expect(runner.getRunnerState().running).toBe(true);
    runner.stopDispatchRunner();
    expect(runner.getRunnerState().running).toBe(false);
  });

  it('getRunnerState.maxConcurrent is capped at 3', () => {
    mockConfig.sessionDispatch.maxConcurrent = 99;
    runner.startDispatchRunner();
    expect(runner.getRunnerState().maxConcurrent).toBe(3);
  });
});
