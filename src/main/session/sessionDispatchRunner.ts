/**
 * sessionDispatchRunner.ts — Wave 34 Phase C.
 *
 * Drains the dispatch queue: picks queued jobs up to maxConcurrent, spawns
 * sessions via sessionSpawnAdapter, tracks state, enforces per-job timeouts,
 * and broadcasts status events on every transition.
 */

import { getConfigValue } from '../config';
import log from '../logger';
import type { DispatchJob } from './sessionDispatch';
import {
  nextQueued,
  registerCancelHook,
  updateJob,
} from './sessionDispatchQueue';
import type { LifecycleState } from './sessionDispatchRunnerLifecycle';
import {
  clearAllTimeouts,
  clearJobTimeout,
  makeLifecycleState,
  registerJobTimeout,
  startInterval,
  stopInterval,
} from './sessionDispatchRunnerLifecycle';
import { broadcastJobStatus } from './sessionDispatchRunnerStatus';
import type { SessionHandle } from './sessionSpawnAdapter';
import { killSession, spawnAgentSession } from './sessionSpawnAdapter';
import { getWorktreeManager } from './worktreeManager';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CONCURRENT_CAP = 3;
const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

// ── Module state ──────────────────────────────────────────────────────────────

/** Maps jobId → PTY session handle (for cancel / timeout kill). */
const activeHandles = new Map<string, SessionHandle>();

let lifecycle: LifecycleState = makeLifecycleState();
let running = false;

// ── Config helpers ────────────────────────────────────────────────────────────

function resolveMaxConcurrent(): number {
  const cfg = getConfigValue('sessionDispatch');
  const raw = cfg?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  return Math.min(Math.max(1, raw), MAX_CONCURRENT_CAP);
}

function resolveTimeoutMs(): number {
  const cfg = getConfigValue('sessionDispatch');
  return cfg?.jobTimeoutMs ?? DEFAULT_TIMEOUT_MS;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function transition(jobId: string, patch: Partial<DispatchJob>): DispatchJob | null {
  const updated = updateJob(jobId, patch);
  if (updated) broadcastJobStatus(updated);
  return updated;
}

function markFailed(jobId: string, error: string): void {
  lifecycle = clearJobTimeout(lifecycle, jobId);
  activeHandles.delete(jobId);
  transition(jobId, { status: 'failed', error, endedAt: new Date().toISOString() });
}

function markCompleted(jobId: string): void {
  lifecycle = clearJobTimeout(lifecycle, jobId);
  activeHandles.delete(jobId);
  transition(jobId, { status: 'completed', endedAt: new Date().toISOString() });
}

// ── Worktree creation ─────────────────────────────────────────────────────────

async function maybeCreateWorktree(
  job: DispatchJob,
): Promise<{ worktreePath: string | undefined; error: string | undefined }> {
  const { worktreeName, projectPath } = job.request;
  if (!worktreeName) return { worktreePath: undefined, error: undefined };

  try {
    const wm = getWorktreeManager();
    const result = await wm.add(projectPath, worktreeName);
    log.info(`[dispatchRunner] worktree created for job ${job.id}:`, result.path);
    return { worktreePath: result.path, error: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`[dispatchRunner] worktree creation failed for job ${job.id}:`, msg);
    return { worktreePath: undefined, error: msg };
  }
}

// ── Session wiring ────────────────────────────────────────────────────────────

function wireCompletion(job: DispatchJob, handle: SessionHandle): void {
  handle.completion
    .then(() => {
      if (!activeHandles.has(job.id)) return; // already cancelled / timed out
      markCompleted(job.id);
    })
    .catch((err: unknown) => {
      if (!activeHandles.has(job.id)) return;
      markFailed(job.id, err instanceof Error ? err.message : String(err));
    });
}

// ── Job start ─────────────────────────────────────────────────────────────────

async function startJob(job: DispatchJob): Promise<void> {
  const now = new Date().toISOString();
  const starting = transition(job.id, { status: 'starting', startedAt: now });
  if (!starting) return;

  const { worktreePath, error: wtError } = await maybeCreateWorktree(job);
  if (wtError) { markFailed(job.id, wtError); return; }

  let handle: SessionHandle;
  try {
    handle = await spawnAgentSession({
      prompt: job.request.prompt,
      projectPath: job.request.projectPath,
      worktreePath,
    });
  } catch (err) {
    markFailed(job.id, err instanceof Error ? err.message : String(err));
    return;
  }

  activeHandles.set(job.id, handle);
  const running_ = transition(job.id, { status: 'running', sessionId: handle.ptyId });
  if (!running_) { activeHandles.delete(job.id); return; }

  const timeoutMs = resolveTimeoutMs();
  lifecycle = registerJobTimeout(lifecycle, job.id, timeoutMs, handleTimeout);

  wireCompletion(job, handle);
}

// ── Timeout handler ───────────────────────────────────────────────────────────

function handleTimeout(jobId: string): void {
  log.warn(`[dispatchRunner] job ${jobId} timed out`);
  const handle = activeHandles.get(jobId);
  activeHandles.delete(jobId);
  if (handle) void killSession(handle.ptyId);
  transition(jobId, { status: 'failed', error: 'timeout', endedAt: new Date().toISOString() });
}

// ── Cancel hook ───────────────────────────────────────────────────────────────

function handleCancel(jobId: string): void {
  const handle = activeHandles.get(jobId);
  if (!handle) return;
  activeHandles.delete(jobId);
  lifecycle = clearJobTimeout(lifecycle, jobId);
  void killSession(handle.ptyId);
}

// ── Tick ──────────────────────────────────────────────────────────────────────

function tick(): void {
  const max = resolveMaxConcurrent();
  if (activeHandles.size >= max) return;

  const job = nextQueued();
  if (!job) return;

  void startJob(job);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startDispatchRunner(): void {
  if (running) return;
  running = true;
  registerCancelHook(handleCancel);
  lifecycle = startInterval(lifecycle, tick);
  log.info('[dispatchRunner] started');
}

export function stopDispatchRunner(): void {
  if (!running) return;
  running = false;
  lifecycle = stopInterval(lifecycle);
  lifecycle = clearAllTimeouts(lifecycle);
  activeHandles.clear();
  log.info('[dispatchRunner] stopped');
}

export function getRunnerState(): { running: boolean; activeJobs: number; maxConcurrent: number } {
  return { running, activeJobs: activeHandles.size, maxConcurrent: resolveMaxConcurrent() };
}

/**
 * Test-only: forcefully resets all module-level state regardless of `running`.
 * Needed because stopDispatchRunner() is a no-op when already stopped, which
 * means activeHandles may be non-empty from prior async chains that settled
 * after a stop but before the next test's startDispatchRunner().
 * Not exported via the session barrel — only used in test files.
 */
export function _forceResetForTest(): void {
  running = false;
  lifecycle = clearAllTimeouts(lifecycle);
  lifecycle = stopInterval(lifecycle);
  activeHandles.clear();
}
