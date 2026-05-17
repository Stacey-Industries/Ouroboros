/**
 * repoMapWorkerClient.test.ts — Unit-level smoke tests for RepoMapWorkerClient.
 *
 * The full boundary contract (singleton, round-trip, id correlation, crash
 * handling, workerData dbPath) is covered by the orchestrator-authored
 * acceptance test at repoMapWorkerClient.acceptance.test.ts.
 *
 * This file covers unit-level concerns: dispose idempotency and the
 * singleton reset behaviour that the acceptance test relies on.
 */

import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockWorker extends EventEmitter {
  postMessage = vi.fn();
  terminate = vi.fn().mockResolvedValue(0);
  constructor() {
    super();
  }
}

vi.mock('worker_threads', () => ({ Worker: MockWorker, isMainThread: true }));
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../codebaseGraph/graphDatabaseHelpers', () => ({
  getDbPath: vi.fn(() => '/mock/userData/codebase-graph.db'),
}));

describe('RepoMapWorkerClient — unit', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    const { disposeRepoMapWorkerClient } = await import('./repoMapWorkerClient');
    await disposeRepoMapWorkerClient();
  });

  it('getRepoMapWorkerClient returns the same instance on repeated calls', async () => {
    const { getRepoMapWorkerClient } = await import('./repoMapWorkerClient');
    const a = getRepoMapWorkerClient();
    const b = getRepoMapWorkerClient();
    expect(a).toBe(b);
  });

  it('disposeRepoMapWorkerClient nulls the singleton so the next call returns a new instance', async () => {
    const { getRepoMapWorkerClient, disposeRepoMapWorkerClient } =
      await import('./repoMapWorkerClient');
    const first = getRepoMapWorkerClient();
    await disposeRepoMapWorkerClient();
    // Re-import to get the fresh module state after resetModules would run in
    // a new test, but here we directly verify the exported getter produces a
    // new object after dispose resets the module-level slot.
    const { getRepoMapWorkerClient: getClient2 } = await import('./repoMapWorkerClient');
    const second = getClient2();
    expect(second).not.toBe(first);
  });

  it('dispose called twice does not throw', async () => {
    const { getRepoMapWorkerClient, disposeRepoMapWorkerClient } =
      await import('./repoMapWorkerClient');
    getRepoMapWorkerClient();
    await expect(disposeRepoMapWorkerClient()).resolves.toBeUndefined();
    await expect(disposeRepoMapWorkerClient()).resolves.toBeUndefined();
  });

  it('generateRepoMap returns a Promise', async () => {
    const { getRepoMapWorkerClient } = await import('./repoMapWorkerClient');
    const client = getRepoMapWorkerClient();
    // Attach a no-op catch so dispose() rejecting the pending promise does not
    // produce an unhandled-rejection warning.
    const result = client.generateRepoMap({
      repoFacts: { gitDiff: { changedFiles: [] } },
      repoIndex: { roots: [] },
      workspaceRoot: '/tmp/repo',
    }).catch(() => undefined);
    expect(result).toBeInstanceOf(Promise);
    // Dispose to clean up the pending promise
    await client.dispose();
  });
});
