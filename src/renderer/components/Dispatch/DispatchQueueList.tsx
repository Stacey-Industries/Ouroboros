/**
 * DispatchQueueList.tsx — renders the live list of dispatch jobs.
 *
 * Each card shows: title, relative created time, status pill, and a cancel
 * button for jobs that are still cancellable (queued | running). Tapping a
 * card fires onSelect so the parent can open the detail view.
 *
 * Wave 34 Phase E.
 */

import React, { useCallback } from 'react';

import type { DispatchJob } from '../../types/electron-dispatch';
import {
  DANGER_BUTTON_STYLE,
  type DispatchJobStatus,
  JOB_CARD_ACTIVE_STYLE,
  JOB_CARD_STYLE,
  JOB_META_STYLE,
  JOB_TITLE_STYLE,
  SCROLLABLE_BODY_STYLE,
  SECTION_LABEL_STYLE,
  statusPillStyle,
} from './DispatchScreen.styles';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES: DispatchJobStatus[] = ['completed', 'failed', 'canceled'];

function isCancellable(status: DispatchJobStatus): boolean {
  return status === 'queued' || status === 'running';
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── JobCard ───────────────────────────────────────────────────────────────────

interface JobCardProps {
  job: DispatchJob;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onCancel: (id: string) => void;
}

function JobCardMeta({ job, status }: { job: DispatchJob; status: DispatchJobStatus }): React.ReactElement {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={JOB_TITLE_STYLE} className="text-text-semantic-primary">{job.request.title}</span>
        <span style={statusPillStyle(status)} data-testid={`job-status-${job.id}`}>{status}</span>
      </div>
      <div style={JOB_META_STYLE} className="text-text-semantic-muted">
        {relativeTime(job.createdAt)}
        {job.request.projectPath && <> &middot; {job.request.projectPath.split(/[\\/]/).pop()}</>}
      </div>
    </div>
  );
}

function JobCard({ job, isSelected, onSelect, onCancel }: JobCardProps): React.ReactElement {
  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onCancel(job.id);
  }, [job.id, onCancel]);
  const status = job.status as DispatchJobStatus;
  const cardStyle = isSelected ? JOB_CARD_ACTIVE_STYLE : JOB_CARD_STYLE;
  return (
    <div style={cardStyle} onClick={() => onSelect(job.id)} role="button" tabIndex={0}
      aria-pressed={isSelected}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(job.id); }}
      data-testid={`job-card-${job.id}`}
    >
      <JobCardMeta job={job} status={status} />
      {isCancellable(status) && (
        <button style={DANGER_BUTTON_STYLE} onClick={handleCancel}
          aria-label={`Cancel job ${job.request.title}`} data-testid={`job-cancel-${job.id}`}>
          Cancel
        </button>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

const EMPTY_STYLE: React.CSSProperties = {
  textAlign: 'center',
  padding: '32px 16px',
  fontSize: '12px',
};

function EmptyQueue(): React.ReactElement {
  return (
    <div style={EMPTY_STYLE} className="text-text-semantic-muted">
      <div style={{ marginBottom: '6px', fontSize: '20px' }}>✓</div>
      No dispatch jobs yet. Use the Form tab to queue a task.
    </div>
  );
}

// ── DispatchQueueList ─────────────────────────────────────────────────────────

export interface DispatchQueueListProps {
  jobs: DispatchJob[];
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  onCancel: (id: string) => void;
}

interface JobSectionProps {
  label: string; jobs: DispatchJob[]; selectedJobId: string | null;
  onSelect: (id: string) => void; onCancel: (id: string) => void; marginTop?: number | string;
}

function JobSection({ label, jobs, selectedJobId, onSelect, onCancel, marginTop }: JobSectionProps): React.ReactElement {
  return (
    <section style={marginTop !== undefined ? { marginTop } : undefined}>
      <div style={{ ...SECTION_LABEL_STYLE, color: 'var(--text-secondary)' }}>{label}</div>
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} isSelected={job.id === selectedJobId} onSelect={onSelect} onCancel={onCancel} />
      ))}
    </section>
  );
}

function splitJobs(jobs: DispatchJob[]): { activeJobs: DispatchJob[]; terminalJobs: DispatchJob[] } {
  const sorted = [...jobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const terminalJobs = sorted.filter((j) => (TERMINAL_STATUSES as string[]).includes(j.status));
  const activeJobs = sorted.filter((j) => !(TERMINAL_STATUSES as string[]).includes(j.status));
  return { activeJobs, terminalJobs };
}

export function DispatchQueueList({ jobs, selectedJobId, onSelect, onCancel }: DispatchQueueListProps): React.ReactElement {
  const { activeJobs, terminalJobs } = splitJobs(jobs);
  return (
    <div style={SCROLLABLE_BODY_STYLE} data-testid="dispatch-queue-list">
      {jobs.length === 0 && <EmptyQueue />}
      {activeJobs.length > 0 && (
        <JobSection label="Active" jobs={activeJobs} selectedJobId={selectedJobId} onSelect={onSelect} onCancel={onCancel} />
      )}
      {terminalJobs.length > 0 && (
        <JobSection label="Completed" jobs={terminalJobs} selectedJobId={selectedJobId} onSelect={onSelect} onCancel={onCancel} marginTop={activeJobs.length > 0 ? '12px' : 0} />
      )}
    </div>
  );
}
