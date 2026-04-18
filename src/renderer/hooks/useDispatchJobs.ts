/**
 * useDispatchJobs.ts — Wave 34 Phase D.
 *
 * Maintains live state of all dispatch jobs. Loads the initial list on mount,
 * then subscribes to sessionDispatch:status push events to keep state current.
 */

import { useCallback, useEffect, useState } from 'react';

import type { CancelDispatchJobResult, DispatchJob } from '../types/electron-dispatch';

export interface UseDispatchJobsReturn {
  jobs: DispatchJob[];
  refresh: () => Promise<void>;
  cancel: (jobId: string) => Promise<CancelDispatchJobResult>;
}

// ── State helpers ─────────────────────────────────────────────────────────────

function upsertJob(prev: DispatchJob[], incoming: DispatchJob): DispatchJob[] {
  const idx = prev.findIndex((j) => j.id === incoming.id);
  if (idx === -1) return [...prev, incoming];
  const next = [...prev];
  next[idx] = incoming;
  return next;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchJobs(): Promise<DispatchJob[]> {
  const api = window.electronAPI?.sessions;
  if (!api?.listDispatchJobs) return [];
  const result = await api.listDispatchJobs();
  return result.success ? (result.jobs ?? []) : [];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDispatchJobs(): UseDispatchJobsReturn {
  const [jobs, setJobs] = useState<DispatchJob[]>([]);

  const refresh = useCallback(async () => {
    const fetched = await fetchJobs();
    setJobs(fetched);
  }, []);

  // Initial load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live subscription
  useEffect(() => {
    const api = window.electronAPI?.sessions;
    if (!api?.onDispatchStatus) return;
    return api.onDispatchStatus((job) => {
      setJobs((prev) => upsertJob(prev, job));
    });
  }, []);

  const cancel = useCallback(async (jobId: string): Promise<CancelDispatchJobResult> => {
    const api = window.electronAPI?.sessions;
    if (!api?.cancelDispatchJob) return { success: false, reason: 'api unavailable' };
    const result = await api.cancelDispatchJob(jobId);
    await refresh();
    return result;
  }, [refresh]);

  return { jobs, refresh, cancel };
}
