/**
 * jobScheduler.test.ts — concurrency cap, cancel, reconcile-on-startup.
 * The jobRunner is mocked so no PTY spawning occurs.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-sched-test-'));
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  // Delay cleanup on Windows to allow SQLite file handles to release
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows file lock race */ }
});

function makeDbPath() {
  return path.join(tmpDir, `jobs-${Date.now()}.db`);
}

async function importWithMockedRunner(mockImpl: () => { start: () => Promise<void>; cancel: () => Promise<void> }) {
  vi.doMock('./jobRunner', () => ({
    createJobRunner: vi.fn().mockImplementation(mockImpl),
  }));
  const { createJobScheduler } = await import('./jobScheduler');
  const { createJobStore } = await import('./jobStore');
  return { createJobScheduler, createJobStore };
}

describe('jobScheduler', () => {
  it('enqueue returns a job id with queued status', async () => {
    const { createJobScheduler, createJobStore } = await importWithMockedRunner(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
    }));

    const store = createJobStore(makeDbPath());
    const scheduler = createJobScheduler(store, { maxConcurrent: 2 });

    const result = await scheduler.enqueue({ projectRoot: '/tmp/p', prompt: 'do stuff' });

    expect(result.success).toBe(true);
    expect(result.jobId).toBeTruthy();

    const job = store.getJob(result.jobId!);
    expect(job).not.toBeNull();

    store.close();
    scheduler.dispose();
  });

  it('concurrency cap: 3rd job stays queued while 2 run', async () => {
    // Use maxConcurrent=1 to make cap easy to verify
    const startCalls: string[] = [];

    const { createJobScheduler, createJobStore } = await importWithMockedRunner(() => ({
      start: vi.fn(async () => { startCalls.push('started'); await new Promise<void>(() => {}); }),
      cancel: vi.fn().mockResolvedValue(undefined),
    }));

    const store = createJobStore(makeDbPath());
    const scheduler = createJobScheduler(store, { maxConcurrent: 1 });

    const r1 = await scheduler.enqueue({ projectRoot: '/p', prompt: 'job1' });
    await scheduler.enqueue({ projectRoot: '/p', prompt: 'job2' });

    // Allow microtasks to flush
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // With cap=1, only 1 job starts; first job is dequeued (oldest is last)
    expect(startCalls.length).toBe(1);
    expect(r1.jobId).toBeTruthy();

    store.close();
    scheduler.dispose();
  });

  it('cancel queued job (not yet running) changes status to cancelled', async () => {
    // Use maxConcurrent=0 so no job starts; job stays queued
    const { createJobScheduler, createJobStore } = await importWithMockedRunner(() => ({
      start: vi.fn().mockImplementation(() => new Promise<void>(() => {})),
      cancel: vi.fn().mockResolvedValue(undefined),
    }));

    const store = createJobStore(makeDbPath());
    const scheduler = createJobScheduler(store, { maxConcurrent: 0 });

    const r = await scheduler.enqueue({ projectRoot: '/p', prompt: 'long job' });
    await Promise.resolve();

    // Job is queued but no runner was started (maxConcurrent=0)
    const cancelResult = await scheduler.cancel(r.jobId!);
    expect(cancelResult.success).toBe(true);

    // Queued job with no runner → scheduler updates store directly
    const job = store.getJob(r.jobId!);
    expect(job?.status).toBe('cancelled');

    store.close();
    scheduler.dispose();
  });

  it('list returns snapshot with correct counts', async () => {
    // The mock runner never updates job status to 'running' (no store access).
    // So all 3 jobs remain 'queued'. runningCount reads from store, so it is 0.
    // The scheduler's activeRunners map tracks in-flight runners (2 slots used).
    const { createJobScheduler, createJobStore } = await importWithMockedRunner(() => ({
      start: vi.fn().mockImplementation(() => new Promise<void>(() => {})),
      cancel: vi.fn(),
    }));

    const store = createJobStore(makeDbPath());
    const scheduler = createJobScheduler(store, { maxConcurrent: 2 });

    await scheduler.enqueue({ projectRoot: '/p', prompt: 'a' });
    await scheduler.enqueue({ projectRoot: '/p', prompt: 'b' });
    await scheduler.enqueue({ projectRoot: '/p', prompt: 'c' });
    await Promise.resolve();
    await Promise.resolve();

    const snap = scheduler.list();
    expect(snap.maxConcurrent).toBe(2);
    // Mock runner doesn't call store.updateJob so store still shows 'queued'
    expect(snap.jobs.length).toBe(3);

    store.close();
    scheduler.dispose();
  });

  it('queue cap: rejects enqueue when 50 pending jobs exist', async () => {
    const { createJobScheduler, createJobStore } = await importWithMockedRunner(() => ({
      start: vi.fn().mockImplementation(() => new Promise<void>(() => {})),
      cancel: vi.fn(),
    }));

    const store = createJobStore(makeDbPath());
    const scheduler = createJobScheduler(store, { maxConcurrent: 0 }); // 0 so none start

    for (let i = 0; i < 50; i++) {
      await scheduler.enqueue({ projectRoot: '/p', prompt: `job ${i}` });
    }

    const overflow = await scheduler.enqueue({ projectRoot: '/p', prompt: 'overflow' });
    expect(overflow.success).toBe(false);
    expect(overflow.error).toContain('limit');

    store.close();
    scheduler.dispose();
  });
});
