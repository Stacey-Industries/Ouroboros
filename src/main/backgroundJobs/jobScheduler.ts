/**
 * backgroundJobs/jobScheduler.ts — Singleton queue manager.
 *
 * Enforces the concurrency cap (config: backgroundJobsMaxConcurrent, default 2).
 * Polls for the next queued job whenever a slot opens.
 * Max pending queue length: 50.
 */

import type { BackgroundJob, BackgroundJobQueueSnapshot, BackgroundJobRequest } from '@shared/types/backgroundJob';

import type { IpcResult } from '../../renderer/types/electron-foundation';
import log from '../logger';
import type { JobRunnerHandle } from './jobRunner';
import { createJobRunner } from './jobRunner';
import type { JobStore } from './jobStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnqueueResult extends IpcResult {
  jobId?: string;
}

export interface SchedulerOptions {
  maxConcurrent: number;
  onJobComplete?: (job: BackgroundJob) => void;
}

export interface JobScheduler {
  enqueue(request: BackgroundJobRequest): Promise<EnqueueResult>;
  cancel(jobId: string): Promise<IpcResult>;
  list(projectRoot?: string): BackgroundJobQueueSnapshot;
  dispose(): void;
}

const MAX_PENDING = 50;

// ── Factory ───────────────────────────────────────────────────────────────────

interface SchedulerState {
  store: JobStore;
  opts: SchedulerOptions;
  activeRunners: Map<string, JobRunnerHandle>;
  disposed: boolean;
}

function dispatchNext(state: SchedulerState): void {
  if (state.disposed) return;
  if (state.activeRunners.size >= state.opts.maxConcurrent) return;
  const queued = state.store.listJobs().filter((j) => j.status === 'queued');
  if (queued.length === 0) return;
  const next = queued[queued.length - 1]; // oldest first
  const runner = createJobRunner({
    job: next,
    store: state.store,
    onComplete: (completedJob) => {
      state.activeRunners.delete(completedJob.id);
      log.info(`[bgScheduler] job ${completedJob.id} finished (${completedJob.status})`);
      state.opts.onJobComplete?.(completedJob);
      dispatchNext(state);
    },
  });
  state.activeRunners.set(next.id, runner);
  runner.start().catch((err: unknown) => {
    state.activeRunners.delete(next.id);
    log.error('[bgScheduler] runner.start() threw:', err);
    dispatchNext(state);
  });
}

async function cancelRunner(state: SchedulerState, jobId: string): Promise<IpcResult> {
  const job = state.store.getJob(jobId);
  if (!job) return { success: false, error: 'Job not found' };
  if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
    return { success: false, error: `Job already in terminal state: ${job.status}` };
  }
  const runner = state.activeRunners.get(jobId);
  if (runner) {
    await runner.cancel();
    state.activeRunners.delete(jobId);
  } else {
    state.store.updateJob(jobId, { status: 'cancelled', completedAt: new Date().toISOString() });
  }
  dispatchNext(state);
  return { success: true };
}

export function createJobScheduler(store: JobStore, opts: SchedulerOptions): JobScheduler {
  const state: SchedulerState = { store, opts, activeRunners: new Map(), disposed: false };

  async function enqueue(request: BackgroundJobRequest): Promise<EnqueueResult> {
    const pending = store.listJobs().filter(
      (j) => j.status === 'queued' || j.status === 'running',
    ).length;
    if (pending >= MAX_PENDING) {
      return { success: false, error: `Queue limit of ${MAX_PENDING} jobs reached` };
    }
    const job = store.createJob(request);
    log.info(`[bgScheduler] enqueued job ${job.id}`);
    Promise.resolve().then(() => dispatchNext(state)).catch(() => {});
    return { success: true, jobId: job.id };
  }

  function list(projectRoot?: string): BackgroundJobQueueSnapshot {
    const jobs = store.listJobs(projectRoot);
    const running = store.listJobs().filter((j) => j.status === 'running').length;
    const queued = store.listJobs().filter((j) => j.status === 'queued').length;
    return { jobs, runningCount: running, queuedCount: queued, maxConcurrent: opts.maxConcurrent };
  }

  function dispose(): void { state.disposed = true; state.activeRunners.clear(); }

  return { enqueue, cancel: (id) => cancelRunner(state, id), list, dispose };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _scheduler: JobScheduler | null = null;

export function getJobScheduler(): JobScheduler {
  if (!_scheduler) throw new Error('JobScheduler not initialised — call initJobScheduler() first');
  return _scheduler;
}

export function initJobScheduler(
  store: JobStore,
  opts: { maxConcurrent?: number; onJobComplete?: (job: BackgroundJob) => void },
): JobScheduler {
  _scheduler?.dispose();
  _scheduler = createJobScheduler(store, {
    maxConcurrent: opts.maxConcurrent ?? 2,
    onJobComplete: opts.onJobComplete,
  });
  return _scheduler;
}

export function disposeJobScheduler(): void {
  _scheduler?.dispose();
  _scheduler = null;
}
