/**
 * sessionDispatchQueue.ts — Wave 34 Phase A persisted FIFO queue.
 *
 * Manages DispatchJob lifecycle in config storage. No IPC, no runner wiring.
 * Phase B adds IPC handlers; Phase C wires the runner and cancel hooks.
 */

import { randomUUID } from 'crypto';

import { getConfigValue, setConfigValue } from '../config';
import type { DispatchJob, DispatchRequest } from './sessionDispatch';

// ── Cancel hook registry ──────────────────────────────────────────────────────

type CancelHook = (jobId: string) => void;
const cancelHooks: CancelHook[] = [];

/** Phase C uses this to subscribe the runner's kill callback. */
export function registerCancelHook(fn: CancelHook): void {
  cancelHooks.push(fn);
}

// ── Persistence ───────────────────────────────────────────────────────────────

function readQueue(): DispatchJob[] {
  const cfg = getConfigValue('sessionDispatch');
  return cfg?.queue ?? [];
}

function writeQueue(jobs: DispatchJob[]): void {
  const cfg = getConfigValue('sessionDispatch') ?? {
    enabled: false,
    maxConcurrent: 1,
    jobTimeoutMs: 1_800_000,
    queue: [],
  };
  setConfigValue('sessionDispatch', { ...cfg, queue: jobs });
}

// ── In-memory snapshot ────────────────────────────────────────────────────────

// Kept in sync with config on every mutation.
let _jobs: DispatchJob[] = [];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call once on desktop startup. Reads persisted queue and marks any jobs that
 * were `running` at restart as `failed` (PTY state is gone).
 */
export function loadQueue(): void {
  const persisted = readQueue();
  const now = new Date().toISOString();

  _jobs = persisted.map((job) => {
    if (job.status !== 'running' && job.status !== 'starting') return job;
    return { ...job, status: 'failed', endedAt: now, error: 'desktop-restart-during-run' };
  });

  writeQueue(_jobs);
}

/** Append a new job to the queue and persist. Returns the created job. */
export function enqueue(request: DispatchRequest, deviceId?: string): DispatchJob {
  const job: DispatchJob = {
    id: randomUUID(),
    request,
    status: 'queued',
    createdAt: new Date().toISOString(),
    ...(deviceId !== undefined ? { deviceId } : {}),
  };
  _jobs = [..._jobs, job];
  writeQueue(_jobs);
  return job;
}

/**
 * Returns the next `queued` job without removing it. The runner transitions
 * the returned job to `starting` / `running` via `updateJob`.
 */
export function nextQueued(): DispatchJob | null {
  return _jobs.find((j) => j.status === 'queued') ?? null;
}

/**
 * Merge a patch into the job record, persist, and return the updated job.
 * Returns null if the job id is not found.
 */
export function updateJob(jobId: string, patch: Partial<DispatchJob>): DispatchJob | null {
  let updated: DispatchJob | null = null;
  _jobs = _jobs.map((j) => {
    if (j.id !== jobId) return j;
    updated = { ...j, ...patch };
    return updated;
  });
  if (updated === null) return null;
  writeQueue(_jobs);
  return updated;
}

/**
 * Hard-delete a job. Intended for cancellation of `queued` jobs only.
 * Returns true if a job was removed.
 */
export function removeJob(jobId: string): boolean {
  const before = _jobs.length;
  _jobs = _jobs.filter((j) => j.id !== jobId);
  if (_jobs.length === before) return false;
  writeQueue(_jobs);
  return true;
}

/** Snapshot of the current queue — returns a cloned array. */
export function listJobs(): DispatchJob[] {
  return [..._jobs];
}

/**
 * Cancel a job:
 * - `queued` → hard delete (removeJob).
 * - `starting` / `running` → mark `canceled`, fire cancel hooks (Phase C wires runner).
 * - Terminal statuses → no-op, returns `{ ok: false, reason: 'already-terminal' }`.
 */
export function cancelJob(jobId: string): { ok: boolean; reason?: string } {
  const job = _jobs.find((j) => j.id === jobId);
  if (!job) return { ok: false, reason: 'not-found' };

  if (job.status === 'queued') {
    removeJob(jobId);
    return { ok: true };
  }

  const active = job.status === 'starting' || job.status === 'running';
  if (active) {
    updateJob(jobId, { status: 'canceled', endedAt: new Date().toISOString() });
    for (const hook of cancelHooks) hook(jobId);
    return { ok: true };
  }

  return { ok: false, reason: 'already-terminal' };
}
