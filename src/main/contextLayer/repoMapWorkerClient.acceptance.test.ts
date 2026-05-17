/**
 * repoMapWorkerClient.acceptance.test.ts — Orchestrator-authored boundary
 * acceptance test for Lane B B3b (move generateRepoMap to a worker thread).
 *
 * Authored at Phase 0 per `~/.claude/rules-deferred/orchestrator-owned-acceptance-tests.md`.
 * The implementer (Phase 1+) IS NOT permitted to modify this file. The
 * orchestrator un-skips it at the start of Phase 1 BEFORE dispatching, then
 * verifies the implementer's work against these assertions.
 *
 * Acceptance contract (boundary perspective, consumer-shaped):
 *
 *   1. The client `getRepoMapWorkerClient()` returns a singleton.
 *   2. Calling `client.generateRepoMap(opts)` returns a Promise<RepoMap>.
 *   3. Under the hood, the client posts ONE message of type 'generateRepoMap'
 *      to the worker, carrying a request id and the marshalled options.
 *   4. When the worker replies with `{ type: 'repoMapReady', id, repoMap }`
 *      matching the request id, the promise resolves with that repoMap.
 *   5. When the worker replies with `{ type: 'error', id, message }` matching
 *      the request id, the promise rejects with an Error carrying that
 *      message.
 *   6. Concurrent generateRepoMap calls are each correlated by id — the
 *      second resolves independently of the first regardless of reply order.
 *   7. Worker crash before a response rejects ALL pending promises.
 *   8. The client passes `dbPath` via workerData so the worker can open its
 *      own read-only better-sqlite3 connection (verified by inspecting the
 *      Worker constructor call).
 *
 * Dynamic imports are used so this file loads even before the implementer
 * creates `repoMapWorkerClient.ts`. describe.skip is mandatory while in Phase
 * 0 — DO NOT remove it. The orchestrator flips skip → run at the start of
 * Phase 1.
 */

import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Worker mock (shared across all tests) ────────────────────────────────────

class MockWorker extends EventEmitter {
  static lastInstance: MockWorker | null = null;
  static constructorArgs: { workerPath: string; options?: { workerData?: unknown } } | null = null;

  postMessage = vi.fn();
  terminate = vi.fn().mockResolvedValue(0);

  constructor(workerPath: string, options?: { workerData?: unknown }) {
    super();
    MockWorker.lastInstance = this;
    MockWorker.constructorArgs = { workerPath, options };
  }

  // Test helpers
  emitReady(): void {
    this.emit('message', { type: 'ready' });
  }
  emitRepoMapReady(id: string, repoMap: unknown): void {
    this.emit('message', { type: 'repoMapReady', id, repoMap, durationMs: 100 });
  }
  emitError(id: string, message: string): void {
    this.emit('message', { type: 'error', id, message });
  }
  emitCrash(): void {
    this.emit('error', new Error('worker crashed'));
    this.emit('exit', 1);
  }
}

vi.mock('worker_threads', () => ({ Worker: MockWorker, isMainThread: true }));
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../codebaseGraph/graphDatabaseHelpers', () => ({
  getDbPath: vi.fn(() => '/mock/userData/codebase-graph.db'),
}));

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeOptions(): unknown {
  return {
    repoFacts: {
      gitDiff: { changedFiles: [], totalAdditions: 0, totalDeletions: 0, changedFileCount: 0, generatedAt: 1000 },
    },
    repoIndex: { roots: [] },
    workspaceRoot: '/tmp/repo',
  };
}

function makeRepoMap(): unknown {
  return {
    version: 1,
    generatedAt: 1000,
    workspaceRoot: '/tmp/repo',
    projectName: 'repo',
    languages: [],
    frameworks: [],
    moduleCount: 0,
    totalFileCount: 0,
    modules: [],
    crossModuleDependencies: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('[Phase 0 acceptance] repoMapWorkerClient boundary contract', () => {
  beforeEach(() => {
    MockWorker.lastInstance = null;
    MockWorker.constructorArgs = null;
    vi.resetModules();
  });

  afterEach(async () => {
    const { disposeRepoMapWorkerClient } = await import('./repoMapWorkerClient');
    await disposeRepoMapWorkerClient();
  });

  it('1+2: getRepoMapWorkerClient is a singleton and exposes generateRepoMap returning Promise<RepoMap>', async () => {
    const { getRepoMapWorkerClient } = await import('./repoMapWorkerClient');
    const a = getRepoMapWorkerClient();
    const b = getRepoMapWorkerClient();
    expect(a).toBe(b);
    expect(typeof a.generateRepoMap).toBe('function');
  });

  it('3+4: posts a generateRepoMap message, resolves with the repoMap from a matching response', async () => {
    const { getRepoMapWorkerClient } = await import('./repoMapWorkerClient');
    const client = getRepoMapWorkerClient();
    const expected = makeRepoMap();

    const promise = client.generateRepoMap(makeOptions());

    // Worker spawned, signal ready
    const worker = MockWorker.lastInstance;
    expect(worker).not.toBeNull();
    worker?.emitReady();

    // Allow microtask flush
    await Promise.resolve();

    // Inspect the posted message
    expect(worker?.postMessage).toHaveBeenCalledTimes(1);
    const sent = worker?.postMessage.mock.calls[0]?.[0] as { type: string; id: string };
    expect(sent.type).toBe('generateRepoMap');
    expect(typeof sent.id).toBe('string');

    // Reply with matching id
    worker?.emitRepoMapReady(sent.id, expected);

    await expect(promise).resolves.toEqual(expected);
  });

  it('5: rejects when the worker replies with type=error for the matching id', async () => {
    const { getRepoMapWorkerClient } = await import('./repoMapWorkerClient');
    const client = getRepoMapWorkerClient();

    const promise = client.generateRepoMap(makeOptions());
    const worker = MockWorker.lastInstance;
    worker?.emitReady();
    await Promise.resolve();
    const sent = worker?.postMessage.mock.calls[0]?.[0] as { id: string };
    worker?.emitError(sent.id, 'boom from worker');

    await expect(promise).rejects.toThrow(/boom from worker/);
  });

  it('6: concurrent calls are correlated by id and resolve independently regardless of reply order', async () => {
    const { getRepoMapWorkerClient } = await import('./repoMapWorkerClient');
    const client = getRepoMapWorkerClient();

    const p1 = client.generateRepoMap(makeOptions());
    const p2 = client.generateRepoMap(makeOptions());

    const worker = MockWorker.lastInstance;
    worker?.emitReady();
    await Promise.resolve();
    await Promise.resolve();

    const calls = worker?.postMessage.mock.calls ?? [];
    const id1 = (calls[0]?.[0] as { id: string }).id;
    const id2 = (calls[1]?.[0] as { id: string }).id;
    expect(id1).not.toBe(id2);

    // Reply to second request FIRST, then first — id correlation must keep them straight.
    const rm1 = { ...(makeRepoMap() as object), projectName: 'first' };
    const rm2 = { ...(makeRepoMap() as object), projectName: 'second' };
    worker?.emitRepoMapReady(id2, rm2);
    worker?.emitRepoMapReady(id1, rm1);

    await expect(p1).resolves.toMatchObject({ projectName: 'first' });
    await expect(p2).resolves.toMatchObject({ projectName: 'second' });
  });

  it('7: worker crash rejects all in-flight promises', async () => {
    const { getRepoMapWorkerClient } = await import('./repoMapWorkerClient');
    const client = getRepoMapWorkerClient();

    const p1 = client.generateRepoMap(makeOptions());
    const p2 = client.generateRepoMap(makeOptions());

    const worker = MockWorker.lastInstance;
    worker?.emitReady();
    await Promise.resolve();

    worker?.emitCrash();

    await expect(p1).rejects.toThrow();
    await expect(p2).rejects.toThrow();
  });

  it('8: spawns the worker with workerData containing the resolved dbPath (so the worker can open its own read-only sqlite connection)', async () => {
    const { getRepoMapWorkerClient } = await import('./repoMapWorkerClient');
    const client = getRepoMapWorkerClient();
    void client.generateRepoMap(makeOptions());

    expect(MockWorker.constructorArgs).not.toBeNull();
    const workerData = MockWorker.constructorArgs?.options?.workerData as { dbPath?: string };
    expect(workerData).toBeDefined();
    expect(typeof workerData.dbPath).toBe('string');
    expect(workerData.dbPath).toContain('codebase-graph.db');
  });
});
