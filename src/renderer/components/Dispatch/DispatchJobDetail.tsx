/**
 * DispatchJobDetail.tsx — full detail view for a single dispatch job.
 *
 * Shows all static job fields. Log streaming is stubbed for a future wave —
 * integrating PTY/agent-event subscriptions per sessionId is non-trivial and
 * out of scope for Phase E. The stub notice is intentional and documented.
 *
 * Wave 34 Phase E.
 */

import React from 'react';

import type { DispatchJob } from '../../types/electron-dispatch';
import type { DispatchJobStatus } from './DispatchScreen.styles';
import {
  DANGER_BUTTON_STYLE,
  DETAIL_FIELD_STYLE,
  DETAIL_LABEL_STYLE,
  DETAIL_VALUE_STYLE,
  GHOST_BUTTON_STYLE,
  SCROLLABLE_BODY_STYLE,
  statusPillStyle,
  STUB_NOTICE_STYLE,
} from './DispatchScreen.styles';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES: DispatchJobStatus[] = ['completed', 'failed', 'canceled'];

function isTerminal(status: DispatchJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

function formatTs(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ── Field primitives ──────────────────────────────────────────────────────────

function DetailField({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId: string;
}): React.ReactElement {
  return (
    <div style={DETAIL_FIELD_STYLE}>
      <div style={DETAIL_LABEL_STYLE} className="text-text-semantic-muted">
        {label}
      </div>
      <div style={DETAIL_VALUE_STYLE} className="text-text-semantic-primary" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  paddingBottom: '10px',
  marginBottom: '10px',
  borderBottom: '1px solid var(--border-subtle)',
  flexShrink: 0,
};

function DetailHeader({
  job,
  onClose,
  onCancel,
}: {
  job: DispatchJob;
  onClose: () => void;
  onCancel: (id: string) => void;
}): React.ReactElement {
  const status = job.status as DispatchJobStatus;
  return (
    <div style={HEADER_STYLE}>
      <button
        style={GHOST_BUTTON_STYLE}
        onClick={onClose}
        aria-label="Back to queue"
        data-testid="detail-back-btn"
        className="text-text-semantic-muted"
      >
        ← Back
      </button>
      <span style={{ flex: 1 }} />
      <span style={statusPillStyle(status)} data-testid="detail-status">
        {status}
      </span>
      {!isTerminal(status) && (
        <button
          style={DANGER_BUTTON_STYLE}
          onClick={() => onCancel(job.id)}
          data-testid="detail-cancel-btn"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

// ── DispatchJobDetail ─────────────────────────────────────────────────────────

export interface DispatchJobDetailProps {
  job: DispatchJob;
  onClose: () => void;
  onCancel: (id: string) => void;
}

export function DispatchJobDetail({
  job,
  onClose,
  onCancel,
}: DispatchJobDetailProps): React.ReactElement {
  const promptPreview =
    job.request.prompt.length > 200
      ? `${job.request.prompt.slice(0, 200)}…`
      : job.request.prompt;

  return (
    <div style={{ ...SCROLLABLE_BODY_STYLE, display: 'flex', flexDirection: 'column' }}>
      <DetailHeader job={job} onClose={onClose} onCancel={onCancel} />

      <DetailField label="Title" value={job.request.title} testId="detail-title" />
      <DetailField label="Prompt" value={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono, monospace)', fontSize: '11px' }}>{promptPreview}</pre>} testId="detail-prompt" />
      <DetailField label="Project" value={job.request.projectPath} testId="detail-project" />

      {job.request.worktreeName && (
        <DetailField label="Worktree" value={job.request.worktreeName} testId="detail-worktree" />
      )}

      <DetailField label="Created" value={formatTs(job.createdAt)} testId="detail-created" />
      {job.startedAt && (
        <DetailField label="Started" value={formatTs(job.startedAt)} testId="detail-started" />
      )}
      {job.endedAt && (
        <DetailField label="Ended" value={formatTs(job.endedAt)} testId="detail-ended" />
      )}
      {job.error && (
        <DetailField label="Error" value={job.error} testId="detail-error" />
      )}

      {/* Log tail — stubbed; full PTY/agent-event subscription deferred to a future wave */}
      <div style={STUB_NOTICE_STYLE} className="text-text-semantic-muted" data-testid="detail-log-stub">
        Log streaming coming in a future wave.
      </div>
    </div>
  );
}
