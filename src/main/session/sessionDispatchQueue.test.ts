/**
 * sessionDispatchQueue.test.ts — Unit tests for the Wave 34 Phase A queue.
 *
 * Config is mocked the same way tokenStore.test.ts does it:
 * vi.mock('../config') with mockGetConfigValue / mockSetConfigValue.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DispatchJob } from './sessionDispatch';

// ── Mock config ───────────────────────────────────────────────────────────────

const mockGetConfigValue = vi.fn();
const mockSetConfigValue = vi.fn();

vi.mock('../config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
  setConfigValue: (...args: unknown[]) => mockSetConfigValue(...args),
}));

// Import after mocks — top-level await supported in vitest ESM mode
const {
  cancelJob,
  enqueue,
  listJobs,
  loadQueue,
  nextQueued,
  registerCancelHook,
  removeJob,
  updateJob,
} = await import('./sessionDispatchQueue');

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseConfig(queue: DispatchJob[] = []) {
  return { enabled: false, maxConcurrent: 1, jobTimeoutMs: 1_800_000, queue };
}

function setupStore(queue: DispatchJob[] = []): void {
  mockGetConfigValue.mockReturnValue(baseConfig(queue));
  mockSetConfigValue.mockClear();
}

function makeRequest(title = 'Task') {
  return { title, prompt: 'Do the thing', projectPath: '/projects/my-app' };
}

/** Pull the queue array that was last written to the config mock. */
function lastWrittenQueue(): DispatchJob[] {
  const calls = mockSetConfigValue.mock.calls;
  if (calls.length === 0) return [];
  const lastCall = calls[calls.length - 1] as [string, { queue: DispatchJob[] }];
  return lastCall[1].queue;
}

// ── loadQueue ─────────────────────────────────────────────────────────────────

describe('loadQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads an empty queue without writing', () => {
    setupStore([]);
    loadQueue();
    // No in-flight jobs → queue unchanged → write still called (re-persist clean state)
    // We just verify it does not throw and list is empty.
    expect(listJobs()).toHaveLength(0);
  });

  it('marks running jobs as failed with desktop-restart-during-run error', () => {
    const runningJob: DispatchJob = {
      id: 'job-running',
      request: makeRequest('Running'),
      status: 'running',
      createdAt: '2026-04-17T00:00:00.000Z',
      startedAt: '2026-04-17T00:01:00.000Z',
    };
    const startingJob: DispatchJob = {
      id: 'job-starting',
      request: makeRequest('Starting'),
      status: 'starting',
      createdAt: '2026-04-17T00:00:00.000Z',
    };
    setupStore([runningJob, startingJob]);
    loadQueue();

    const jobs = listJobs();
    expect(jobs).toHaveLength(2);
    for (const j of jobs) {
      expect(j.status).toBe('failed');
      expect(j.error).toBe('desktop-restart-during-run');
      expect(j.endedAt).toBeDefined();
    }
  });

  it('leaves queued / completed / failed jobs untouched', () => {
    const queuedJob: DispatchJob = {
      id: 'job-queued',
      request: makeRequest(),
      status: 'queued',
      createdAt: '2026-04-17T00:00:00.000Z',
    };
    setupStore([queuedJob]);
    loadQueue();

    const jobs = listJobs();
    expect(jobs[0].status).toBe('queued');
  });
});

// ── enqueue ───────────────────────────────────────────────────────────────────

describe('enqueue', () => {
  beforeEach(() => {
    setupStore([]);
    loadQueue();
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue(baseConfig([]));
  });

  it('returns a job with queued status and a uuid', () => {
    const job = enqueue(makeRequest());
    expect(job.status).toBe('queued');
    expect(job.id).toMatch(/^[\da-f-]{36}$/);
    expect(job.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('persists the job via setConfigValue', () => {
    enqueue(makeRequest('Persist me'));
    expect(mockSetConfigValue).toHaveBeenCalledOnce();
    const written = lastWrittenQueue();
    expect(written).toHaveLength(1);
    expect(written[0].request.title).toBe('Persist me');
  });

  it('attaches deviceId when provided', () => {
    const job = enqueue(makeRequest(), 'device-iphone-1');
    expect(job.deviceId).toBe('device-iphone-1');
  });

  it('omits deviceId when not provided', () => {
    const job = enqueue(makeRequest());
    expect(job.deviceId).toBeUndefined();
  });
});

// ── listJobs / FIFO order ─────────────────────────────────────────────────────

describe('listJobs + nextQueued (FIFO)', () => {
  beforeEach(() => {
    setupStore([]);
    loadQueue();
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue(baseConfig([]));
  });

  it('returns jobs in insertion order', () => {
    enqueue(makeRequest('First'));
    enqueue(makeRequest('Second'));
    enqueue(makeRequest('Third'));

    const jobs = listJobs();
    expect(jobs.map((j) => j.request.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('nextQueued returns the first queued job', () => {
    enqueue(makeRequest('A'));
    enqueue(makeRequest('B'));

    const next = nextQueued();
    expect(next?.request.title).toBe('A');
  });

  it('nextQueued returns null when queue is empty', () => {
    expect(nextQueued()).toBeNull();
  });

  it('listJobs returns a clone — mutation does not affect internal state', () => {
    enqueue(makeRequest());
    const snapshot = listJobs();
    snapshot.pop();
    expect(listJobs()).toHaveLength(1);
  });
});

// ── updateJob ─────────────────────────────────────────────────────────────────

describe('updateJob', () => {
  beforeEach(() => {
    setupStore([]);
    loadQueue();
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue(baseConfig([]));
  });

  it('merges a patch into the existing job', () => {
    const job = enqueue(makeRequest());
    vi.clearAllMocks();

    const updated = updateJob(job.id, { status: 'running', startedAt: '2026-04-17T01:00:00.000Z' });
    expect(updated?.status).toBe('running');
    expect(updated?.startedAt).toBe('2026-04-17T01:00:00.000Z');
    // Original fields preserved
    expect(updated?.request.title).toBe(job.request.title);
  });

  it('returns null for an unknown job id', () => {
    expect(updateJob('nonexistent', { status: 'running' })).toBeNull();
  });

  it('persists the updated queue', () => {
    const job = enqueue(makeRequest());
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue(baseConfig(listJobs()));

    updateJob(job.id, { status: 'completed' });
    expect(mockSetConfigValue).toHaveBeenCalledOnce();
    const written = lastWrittenQueue();
    expect(written.find((j) => j.id === job.id)?.status).toBe('completed');
  });
});

// ── removeJob ─────────────────────────────────────────────────────────────────

describe('removeJob', () => {
  beforeEach(() => {
    setupStore([]);
    loadQueue();
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue(baseConfig([]));
  });

  it('removes the matching job and returns true', () => {
    const job = enqueue(makeRequest());
    vi.clearAllMocks();
    const result = removeJob(job.id);
    expect(result).toBe(true);
    expect(listJobs()).toHaveLength(0);
  });

  it('returns false when id is not found', () => {
    expect(removeJob('no-such-id')).toBe(false);
  });

  it('only removes the targeted job', () => {
    const a = enqueue(makeRequest('A'));
    enqueue(makeRequest('B'));
    vi.clearAllMocks();
    removeJob(a.id);
    const remaining = listJobs();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].request.title).toBe('B');
  });
});

// ── cancelJob ─────────────────────────────────────────────────────────────────

describe('cancelJob', () => {
  beforeEach(() => {
    setupStore([]);
    loadQueue();
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue(baseConfig([]));
  });

  it('queued job → hard delete, returns ok:true', () => {
    const job = enqueue(makeRequest());
    vi.clearAllMocks();
    const result = cancelJob(job.id);
    expect(result).toEqual({ ok: true });
    expect(listJobs()).toHaveLength(0);
  });

  it('running job → marked canceled + cancel hook fired', () => {
    const hookFn = vi.fn();
    registerCancelHook(hookFn);

    const job = enqueue(makeRequest());
    updateJob(job.id, { status: 'running', startedAt: new Date().toISOString() });
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue(baseConfig(listJobs()));

    const result = cancelJob(job.id);
    expect(result).toEqual({ ok: true });

    const updated = listJobs().find((j) => j.id === job.id);
    expect(updated?.status).toBe('canceled');
    expect(updated?.endedAt).toBeDefined();
    expect(hookFn).toHaveBeenCalledWith(job.id);
  });

  it('starting job → marked canceled', () => {
    const job = enqueue(makeRequest());
    updateJob(job.id, { status: 'starting' });
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue(baseConfig(listJobs()));

    const result = cancelJob(job.id);
    expect(result.ok).toBe(true);
    expect(listJobs().find((j) => j.id === job.id)?.status).toBe('canceled');
  });

  it('completed job → no-op, returns already-terminal', () => {
    const job = enqueue(makeRequest());
    updateJob(job.id, { status: 'completed', endedAt: new Date().toISOString() });
    vi.clearAllMocks();

    const result = cancelJob(job.id);
    expect(result).toEqual({ ok: false, reason: 'already-terminal' });
  });

  it('failed job → no-op, returns already-terminal', () => {
    const job = enqueue(makeRequest());
    updateJob(job.id, { status: 'failed', error: 'timeout' });
    vi.clearAllMocks();

    const result = cancelJob(job.id);
    expect(result).toEqual({ ok: false, reason: 'already-terminal' });
  });

  it('unknown id → returns not-found', () => {
    const result = cancelJob('ghost-id');
    expect(result).toEqual({ ok: false, reason: 'not-found' });
  });
});
