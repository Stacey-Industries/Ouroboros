/**
 * jobStore.test.ts — unit tests for SQLite CRUD and subscribe/unsubscribe.
 */

import type { BackgroundJob } from '@shared/types/backgroundJob';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We test jobStore in isolation — no Electron dependency.
// database.ts is pure better-sqlite3 which vitest.config.ts aliases to system Node build.

let tmpDir: string;
let jobStorePath: string;


beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-job-test-'));
  jobStorePath = path.join(tmpDir, 'test-jobs.db');
  // Patch the db path before the module initialises
  vi.doMock('../storage/database', async () => {
    const actual = await vi.importActual<typeof import('../storage/database')>('../storage/database');
    return actual;
  });
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.resetModules();
});

describe('jobStore', () => {
  it('createJob inserts a queued row and getJob retrieves it', async () => {
    const { createJobStore } = await import('./jobStore');
    const store = createJobStore(jobStorePath);

    const job = store.createJob({
      projectRoot: '/tmp/proj',
      prompt: 'hello world',
      label: 'test job',
    });

    expect(job.id).toBeTruthy();
    expect(job.status).toBe('queued');
    expect(job.prompt).toBe('hello world');
    expect(job.projectRoot).toBe('/tmp/proj');
    expect(job.createdAt).toBeTruthy();

    const fetched = store.getJob(job.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(job.id);

    store.close();
  });

  it('updateJob changes status fields', async () => {
    const { createJobStore } = await import('./jobStore');
    const store = createJobStore(jobStorePath);

    const job = store.createJob({ projectRoot: '/tmp/p', prompt: 'run' });
    store.updateJob(job.id, { status: 'running', startedAt: new Date().toISOString() });

    const updated = store.getJob(job.id);
    expect(updated?.status).toBe('running');
    expect(updated?.startedAt).toBeTruthy();

    store.close();
  });

  it('listJobs returns all rows', async () => {
    const { createJobStore } = await import('./jobStore');
    const store = createJobStore(jobStorePath);

    store.createJob({ projectRoot: '/p1', prompt: 'a' });
    store.createJob({ projectRoot: '/p2', prompt: 'b' });
    store.createJob({ projectRoot: '/p1', prompt: 'c' });

    const all = store.listJobs();
    expect(all.length).toBe(3);

    const filtered = store.listJobs('/p1');
    expect(filtered.length).toBe(2);

    store.close();
  });

  it('deleteCompleted removes done/error/cancelled rows', async () => {
    const { createJobStore } = await import('./jobStore');
    const store = createJobStore(jobStorePath);

    const j1 = store.createJob({ projectRoot: '/p', prompt: 'a' });
    const j2 = store.createJob({ projectRoot: '/p', prompt: 'b' });
    const j3 = store.createJob({ projectRoot: '/p', prompt: 'c' });

    store.updateJob(j1.id, { status: 'done' });
    store.updateJob(j2.id, { status: 'running' });
    store.updateJob(j3.id, { status: 'cancelled' });

    store.deleteCompleted();

    const remaining = store.listJobs();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(j2.id);

    store.close();
  });

  it('subscribeChanges notifies and unsubscribe removes listener', async () => {
    const { createJobStore } = await import('./jobStore');
    const store = createJobStore(jobStorePath);

    const received: Partial<BackgroundJob>[] = [];
    const unsub = store.subscribeChanges((_id, changes) => received.push(changes));

    const job = store.createJob({ projectRoot: '/p', prompt: 'x' });
    store.updateJob(job.id, { status: 'running' });

    // Creation emits once, update emits once
    expect(received.length).toBe(2);
    expect(received[0].status).toBe('queued');
    expect(received[1].status).toBe('running');

    unsub();
    store.updateJob(job.id, { status: 'done' });
    expect(received.length).toBe(2); // no more notifications

    store.close();
  });

  it('reconcileInterrupted marks running jobs as error on startup', async () => {
    const { createJobStore } = await import('./jobStore');
    const store = createJobStore(jobStorePath);

    const j1 = store.createJob({ projectRoot: '/p', prompt: 'a' });
    const j2 = store.createJob({ projectRoot: '/p', prompt: 'b' });
    store.updateJob(j1.id, { status: 'running' });
    store.updateJob(j2.id, { status: 'queued' });

    store.reconcileInterrupted();

    expect(store.getJob(j1.id)?.status).toBe('error');
    expect(store.getJob(j1.id)?.errorMessage).toContain('interrupted');
    expect(store.getJob(j2.id)?.status).toBe('queued'); // queued untouched

    store.close();
  });
});
