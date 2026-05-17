/**
 * repoMapGeneratorQuerySource.test.ts — Unit tests for the thread-aware query
 * source selector.
 *
 * Verifies:
 * - On main thread (isMainThread === true), returns getGraphController() result.
 * - On worker thread (isMainThread === false), returns getWorkerQueryClient() result.
 * - Returns null when neither source is available.
 *
 * Uses vi.resetModules() + vi.doMock() (non-hoisted) so each test can control
 * the isMainThread value independently at dynamic import time.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetGraphController = vi.fn();
const mockGetWorkerQueryClient = vi.fn();

// Top-level vi.mock is hoisted — only used here to satisfy import resolution.
// Per-test overrides use vi.doMock() after vi.resetModules().
vi.mock('../codebaseGraph/graphControllerSupport', () => ({
  getGraphController: mockGetGraphController,
}));
vi.mock('./repoMapWorkerQueryClient', () => ({
  getWorkerQueryClient: mockGetWorkerQueryClient,
}));

beforeEach(() => {
  mockGetGraphController.mockReset();
  mockGetWorkerQueryClient.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
});

describe('getQuerySource', () => {
  it('returns getGraphController() result when on main thread and controller is available', async () => {
    const mockCtrl = { queryGraph: vi.fn() };
    mockGetGraphController.mockReturnValue(mockCtrl);

    vi.doMock('worker_threads', () => ({ isMainThread: true }));
    vi.doMock('../codebaseGraph/graphControllerSupport', () => ({
      getGraphController: mockGetGraphController,
    }));
    vi.doMock('./repoMapWorkerQueryClient', () => ({
      getWorkerQueryClient: mockGetWorkerQueryClient,
    }));

    const { getQuerySource } = await import('./repoMapGeneratorQuerySource');
    const result = getQuerySource();

    expect(result).toBe(mockCtrl);
    expect(mockGetGraphController).toHaveBeenCalled();
    expect(mockGetWorkerQueryClient).not.toHaveBeenCalled();
  });

  it('returns null when on main thread and graph controller is not yet ready', async () => {
    mockGetGraphController.mockReturnValue(null);

    vi.doMock('worker_threads', () => ({ isMainThread: true }));
    vi.doMock('../codebaseGraph/graphControllerSupport', () => ({
      getGraphController: mockGetGraphController,
    }));
    vi.doMock('./repoMapWorkerQueryClient', () => ({
      getWorkerQueryClient: mockGetWorkerQueryClient,
    }));

    const { getQuerySource } = await import('./repoMapGeneratorQuerySource');
    expect(getQuerySource()).toBeNull();
  });

  it('returns getWorkerQueryClient() result when on worker thread and client is available', async () => {
    const mockClient = { queryGraph: vi.fn() };
    mockGetWorkerQueryClient.mockReturnValue(mockClient);

    vi.doMock('worker_threads', () => ({ isMainThread: false }));
    vi.doMock('../codebaseGraph/graphControllerSupport', () => ({
      getGraphController: mockGetGraphController,
    }));
    vi.doMock('./repoMapWorkerQueryClient', () => ({
      getWorkerQueryClient: mockGetWorkerQueryClient,
    }));

    const { getQuerySource } = await import('./repoMapGeneratorQuerySource');
    const result = getQuerySource();

    expect(result).toBe(mockClient);
    expect(mockGetWorkerQueryClient).toHaveBeenCalled();
    expect(mockGetGraphController).not.toHaveBeenCalled();
  });

  it('returns null when on worker thread and client is not yet initialized', async () => {
    mockGetWorkerQueryClient.mockReturnValue(null);

    vi.doMock('worker_threads', () => ({ isMainThread: false }));
    vi.doMock('../codebaseGraph/graphControllerSupport', () => ({
      getGraphController: mockGetGraphController,
    }));
    vi.doMock('./repoMapWorkerQueryClient', () => ({
      getWorkerQueryClient: mockGetWorkerQueryClient,
    }));

    const { getQuerySource } = await import('./repoMapGeneratorQuerySource');
    expect(getQuerySource()).toBeNull();
  });
});
