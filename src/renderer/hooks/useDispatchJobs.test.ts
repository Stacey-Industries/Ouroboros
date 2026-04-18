/**
 * @vitest-environment jsdom
 *
 * useDispatchJobs.test.ts — Wave 34 Phase D.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CancelDispatchJobResult, DispatchJob } from '../types/electron-dispatch';
import { useDispatchJobs } from './useDispatchJobs';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<DispatchJob> = {}): DispatchJob {
  return {
    id: 'job-1',
    status: 'queued',
    createdAt: '2026-04-17T00:00:00.000Z',
    request: { title: 'Test task', prompt: 'Do something', projectPath: '/projects/foo' },
    ...overrides,
  };
}

// ── Mock electronAPI ──────────────────────────────────────────────────────────

type DispatchStatusCallback = (job: DispatchJob) => void;

let mockJobs: DispatchJob[] = [];
let dispatchStatusListeners: DispatchStatusCallback[] = [];

function buildMockApi() {
  return {
    sessions: {
      listDispatchJobs: vi.fn(async () => ({ success: true as const, jobs: [...mockJobs] })),
      cancelDispatchJob: vi.fn(async (): Promise<CancelDispatchJobResult> =>
        ({ success: true as const })),
      onDispatchStatus: vi.fn((cb: DispatchStatusCallback) => {
        dispatchStatusListeners.push(cb);
        return () => {
          dispatchStatusListeners = dispatchStatusListeners.filter((l) => l !== cb);
        };
      }),
    },
  };
}

function emitStatus(job: DispatchJob): void {
  dispatchStatusListeners.forEach((l) => l(job));
}

beforeEach(() => {
  mockJobs = [];
  dispatchStatusListeners = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI = buildMockApi();
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).electronAPI;
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDispatchJobs', () => {
  it('loads initial job list on mount', async () => {
    mockJobs = [makeJob()];
    const { result } = renderHook(() => useDispatchJobs());
    await act(async () => {});
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0].id).toBe('job-1');
  });

  it('appends a new job when status event arrives for unknown id', async () => {
    mockJobs = [];
    const { result } = renderHook(() => useDispatchJobs());
    await act(async () => {});
    expect(result.current.jobs).toHaveLength(0);

    const newJob = makeJob({ id: 'job-2', status: 'running' });
    act(() => { emitStatus(newJob); });
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0].id).toBe('job-2');
  });

  it('replaces existing job when status event arrives for known id', async () => {
    const job = makeJob({ status: 'queued' });
    mockJobs = [job];
    const { result } = renderHook(() => useDispatchJobs());
    await act(async () => {});
    expect(result.current.jobs[0].status).toBe('queued');

    act(() => { emitStatus({ ...job, status: 'running' }); });
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0].status).toBe('running');
  });

  it('refresh re-fetches the full list', async () => {
    mockJobs = [];
    const { result } = renderHook(() => useDispatchJobs());
    await act(async () => {});
    expect(result.current.jobs).toHaveLength(0);

    mockJobs = [makeJob(), makeJob({ id: 'job-2' })];
    await act(async () => { await result.current.refresh(); });
    expect(result.current.jobs).toHaveLength(2);
  });

  it('cancel calls IPC then refreshes', async () => {
    mockJobs = [makeJob()];
    const { result } = renderHook(() => useDispatchJobs());
    await act(async () => {});

    mockJobs = [];
    await act(async () => { await result.current.cancel('job-1'); });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).electronAPI.sessions;
    expect(api.cancelDispatchJob).toHaveBeenCalledWith('job-1');
    expect(result.current.jobs).toHaveLength(0);
  });

  it('unsubscribes from onDispatchStatus on unmount', async () => {
    const { unmount } = renderHook(() => useDispatchJobs());
    await act(async () => {});
    expect(dispatchStatusListeners).toHaveLength(1);
    unmount();
    expect(dispatchStatusListeners).toHaveLength(0);
  });

  it('returns empty list when API is unavailable', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = {};
    const { result } = renderHook(() => useDispatchJobs());
    await act(async () => {});
    expect(result.current.jobs).toHaveLength(0);
  });
});
