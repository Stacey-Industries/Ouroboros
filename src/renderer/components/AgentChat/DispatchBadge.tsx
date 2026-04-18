/**
 * DispatchBadge.tsx — Wave 34 Phase D.
 *
 * Small pill shown next to a dispatch-spawned session in the sidebar.
 * Renders nothing when no matching DispatchJob exists.
 */

import React from 'react';

import type { DispatchJob, DispatchJobStatus } from '../../types/electron-dispatch';

// ── Variant helpers ───────────────────────────────────────────────────────────

type BadgeVariant = 'dispatched' | 'running' | 'error';

function resolveVariant(status: DispatchJobStatus): BadgeVariant {
  if (status === 'failed' || status === 'canceled') return 'error';
  if (status === 'running' || status === 'starting') return 'running';
  return 'dispatched';
}

function resolveLabel(status: DispatchJobStatus): string {
  if (status === 'failed') return 'Failed';
  if (status === 'canceled') return 'Canceled';
  if (status === 'completed') return 'Done';
  if (status === 'running') return 'Running';
  if (status === 'starting') return 'Starting';
  return 'Dispatched';
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  dispatched: 'bg-interactive-accent-subtle text-interactive-accent border-border-accent',
  running: 'bg-status-success-subtle text-status-success border-border-semantic',
  error: 'bg-status-error-subtle text-status-error border-border-semantic',
};

// ── Component ─────────────────────────────────────────────────────────────────

export interface DispatchBadgeProps {
  /** PTY session ID — matched against DispatchJob.sessionId. */
  sessionId: string;
  /** All current dispatch jobs (from useDispatchJobs). */
  jobs: DispatchJob[];
}

export function DispatchBadge({ sessionId, jobs }: DispatchBadgeProps): React.ReactElement | null {
  const job = jobs.find((j) => j.sessionId === sessionId);
  if (!job) return null;

  const variant = resolveVariant(job.status);
  const label = resolveLabel(job.status);
  const classes = VARIANT_CLASSES[variant];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${classes}`}
      title={`Dispatch: ${job.request.title}`}
      aria-label={`Dispatched job — ${label}`}
    >
      {label}
    </span>
  );
}
