/**
 * repoMapWorker.test.ts — Import-parse and handler smoke tests for repoMapWorker.ts.
 *
 * The worker is a separate entry point that relies on worker_threads
 * `parentPort` at module scope.  Full round-trip testing is covered by
 * repoMapWorkerClient.acceptance.test.ts (which mocks the Worker constructor).
 * This file verifies: (1) the module can be imported without throwing,
 * (2) it registers a message listener, (3) it posts 'ready' on bootstrap,
 * and (4) a 'generateRepoMap' message produces a 'repoMapReady' response.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPostMessage = vi.fn();
const mockOn = vi.fn();

vi.mock('worker_threads', () => ({
  parentPort: {
    on: mockOn,
    postMessage: mockPostMessage,
  },
  workerData: { dbPath: '/mock/userData/codebase-graph.db' },
  isMainThread: false,
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGenerateRepoMap = vi.fn();
vi.mock('./repoMapGenerator', () => ({
  generateRepoMap: mockGenerateRepoMap,
}));

describe('repoMapWorker module', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPostMessage.mockClear();
    mockOn.mockClear();
    mockGenerateRepoMap.mockClear();
  });

  it('imports without throwing', async () => {
    await expect(import('./repoMapWorker')).resolves.toBeDefined();
  });

  it('registers a message listener on parentPort', async () => {
    await import('./repoMapWorker');
    expect(mockOn).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('posts ready on bootstrap', async () => {
    await import('./repoMapWorker');
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('handleGenerateRepoMap posts repoMapReady on success', async () => {
    const expectedRepoMap = {
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
    mockGenerateRepoMap.mockResolvedValueOnce(expectedRepoMap);

    await import('./repoMapWorker');

    // Retrieve the registered message handler
    const handler = mockOn.mock.calls.find((c) => c[0] === 'message')?.[1] as
      | ((msg: unknown) => Promise<void>)
      | undefined;
    expect(handler).toBeDefined();

    mockPostMessage.mockClear();

    await handler?.({
      type: 'generateRepoMap',
      id: 'test-id-1',
      repoFacts: { gitDiff: { changedFiles: [] } },
      repoIndex: { roots: [] },
      workspaceRoot: '/tmp/repo',
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'repoMapReady', id: 'test-id-1' }),
    );
  });

  it('handleGenerateRepoMap posts error when generateRepoMap throws', async () => {
    mockGenerateRepoMap.mockRejectedValueOnce(new Error('mock failure'));

    await import('./repoMapWorker');

    const handler = mockOn.mock.calls.find((c) => c[0] === 'message')?.[1] as
      | ((msg: unknown) => Promise<void>)
      | undefined;

    mockPostMessage.mockClear();

    await handler?.({
      type: 'generateRepoMap',
      id: 'test-id-2',
      repoFacts: { gitDiff: { changedFiles: [] } },
      repoIndex: { roots: [] },
      workspaceRoot: '/tmp/repo',
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', id: 'test-id-2', message: 'mock failure' }),
    );
  });
});
