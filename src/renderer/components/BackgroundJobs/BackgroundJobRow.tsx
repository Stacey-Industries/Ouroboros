/**
 * BackgroundJobRow.tsx — Single row in the background jobs panel.
 *
 * Shows status pill, elapsed time, result/error summary, and a Cancel button
 * for jobs that are still queued or running.
 */

import type { BackgroundJob } from '@shared/types/backgroundJob';
import React, { useCallback, useEffect, useRef, useState } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsedMs(job: BackgroundJob): number {
  const start = job.startedAt ?? job.createdAt;
  const end = job.completedAt ?? new Date().toISOString();
  return new Date(end).getTime() - new Date(start).getTime();
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Status pill ───────────────────────────────────────────────────────────────

type StatusConfig = { label: string; bg: string; text: string };

const STATUS_MAP: Record<BackgroundJob['status'], StatusConfig> = {
  queued:    { label: 'Queued',    bg: 'bg-status-info-subtle',    text: 'text-status-info' },
  running:   { label: 'Running',   bg: 'bg-status-warning-subtle', text: 'text-status-warning' },
  done:      { label: 'Done',      bg: 'bg-status-success-subtle', text: 'text-status-success' },
  error:     { label: 'Error',     bg: 'bg-status-error-subtle',   text: 'text-status-error' },
  cancelled: { label: 'Cancelled', bg: 'bg-surface-inset',         text: 'text-text-semantic-muted' },
};

function StatusPill({ status }: { status: BackgroundJob['status'] }): React.ReactElement {
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.queued;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// ── Tick hook — triggers re-render each second while job is active ─────────────

function useActiveTick(status: BackgroundJob['status']): void {
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (status !== 'running' && status !== 'queued') return;
    timerRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface BackgroundJobRowProps {
  job: BackgroundJob;
  onCancel: (id: string) => void;
}

export function BackgroundJobRow({ job, onCancel }: BackgroundJobRowProps): React.ReactElement {
  useActiveTick(job.status);
  const isActive = job.status === 'queued' || job.status === 'running';
  const summary = job.resultSummary ?? job.errorMessage;
  const label = job.label ?? job.prompt.slice(0, 60);
  const handleCancel = useCallback(() => onCancel(job.id), [job.id, onCancel]);

  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-b border-border-subtle last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <StatusPill status={job.status} />
        <span className="flex-1 truncate text-sm text-text-semantic-primary" title={label}>
          {label}
        </span>
        <span className="text-xs text-text-semantic-muted shrink-0">
          {formatElapsed(elapsedMs(job))}
        </span>
        {isActive && (
          <button
            type="button"
            className="text-xs px-1.5 py-0.5 rounded bg-status-error-subtle text-status-error hover:bg-interactive-hover shrink-0"
            onClick={handleCancel}
            aria-label={`Cancel job: ${label}`}
          >
            Cancel
          </button>
        )}
      </div>
      {summary && (
        <p className="text-xs text-text-semantic-muted truncate pl-0" title={summary}>
          {summary}
        </p>
      )}
    </div>
  );
}
