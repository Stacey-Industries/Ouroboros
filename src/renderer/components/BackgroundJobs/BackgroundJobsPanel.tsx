/**
 * BackgroundJobsPanel.tsx — List panel for background agent jobs.
 *
 * Subscribes to backgroundJobs:update push events and fetches the initial
 * snapshot on mount. Listens for the `agent-ide:open-background-jobs` DOM
 * event to show/hide as a modal-style overlay.
 */

import type { BackgroundJob, BackgroundJobUpdate } from '@shared/types/backgroundJob';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { BackgroundJobRow } from './BackgroundJobRow';

// ── State helpers ─────────────────────────────────────────────────────────────

function applyUpdate(jobs: BackgroundJob[], update: BackgroundJobUpdate): BackgroundJob[] {
  const idx = jobs.findIndex((j) => j.id === update.jobId);
  if (idx === -1) {
    return [{ id: update.jobId, ...update.changes } as BackgroundJob, ...jobs];
  }
  const updated = { ...jobs[idx], ...update.changes } as BackgroundJob;
  return [...jobs.slice(0, idx), updated, ...jobs.slice(idx + 1)];
}

// ── Hook — data subscription + visibility toggle ───────────────────────────────

function useBackgroundJobsPanel() {
  const [visible, setVisible] = useState(false);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);

  const loadJobs = useCallback(async () => {
    if (!window.electronAPI?.backgroundJobs) return;
    const result = await window.electronAPI.backgroundJobs.list();
    if (result.success && result.snapshot) setJobs(result.snapshot.jobs);
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.backgroundJobs) return;
    void loadJobs();
    cleanupRef.current = window.electronAPI.backgroundJobs.onUpdate(
      (u: BackgroundJobUpdate) => setJobs((prev) => applyUpdate(prev, u)),
    );
    return () => { cleanupRef.current?.(); cleanupRef.current = null; };
  }, [loadJobs]);

  useEffect(() => {
    const onOpen = (): void => setVisible((v) => !v);
    window.addEventListener('agent-ide:open-background-jobs', onOpen);
    return () => window.removeEventListener('agent-ide:open-background-jobs', onOpen);
  }, []);

  const handleCancel = useCallback(async (id: string) => {
    if (!window.electronAPI?.backgroundJobs) return;
    await window.electronAPI.backgroundJobs.cancel(id);
  }, []);

  const handleClearCompleted = useCallback(async () => {
    if (!window.electronAPI?.backgroundJobs) return;
    await window.electronAPI.backgroundJobs.clearCompleted();
    setJobs((prev) => prev.filter((j) => j.status === 'queued' || j.status === 'running'));
  }, []);

  return { visible, setVisible, jobs, handleCancel, handleClearCompleted };
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface PanelHeaderProps {
  onClear: () => void;
  onClose: () => void;
}

function PanelHeader({ onClear, onClose }: PanelHeaderProps): React.ReactElement {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
      <h2 className="text-sm font-semibold text-text-semantic-primary">Background Jobs</h2>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-xs text-text-semantic-muted hover:text-text-semantic-primary px-2 py-1 rounded hover:bg-surface-hover"
          onClick={onClear}
        >
          Clear completed
        </button>
        <button
          type="button"
          aria-label="Close background jobs panel"
          className="text-text-semantic-muted hover:text-text-semantic-primary"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </header>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BackgroundJobsPanel(): React.ReactElement | null {
  const { visible, setVisible, jobs, handleCancel, handleClearCompleted } =
    useBackgroundJobsPanel();

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Background Jobs"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      onClick={(e) => { if (e.target === e.currentTarget) setVisible(false); }}
    >
      <div className="w-full max-w-lg rounded-lg border border-border-semantic bg-surface-panel shadow-lg overflow-hidden">
        <PanelHeader onClear={() => void handleClearCompleted()} onClose={() => setVisible(false)} />
        <div className="overflow-y-auto max-h-96">
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-semantic-muted text-center">
              No background jobs yet.
            </p>
          ) : (
            jobs.map((job) => (
              <BackgroundJobRow key={job.id} job={job} onCancel={(id) => void handleCancel(id)} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
