import React, { useMemo, useState } from 'react';

import { useApprovalContext } from '../../../contexts/ApprovalContext';
import type { ApprovalRequest } from '../../../types/electron';

function getRequestKey(request: ApprovalRequest): string {
  const input = request.toolInput;
  if (request.toolName === 'Bash') return String(input.command ?? '');
  const filePath = input.file_path ?? input.path;
  if (filePath !== undefined) return String(filePath);
  return JSON.stringify(input);
}

function getRequestPreview(request: ApprovalRequest): string {
  const preview = getRequestKey(request);
  return preview.length > 140 ? `${preview.slice(0, 140)}...` : preview;
}

function EmptyApprovals(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-semantic-secondary">
      No approvals are waiting right now.
    </div>
  );
}

interface ApprovalButtonsProps {
  busy: boolean;
  onApprove: () => void;
  onAllowAlways: () => void;
  onDeny: () => void;
}

function ApprovalButtons({
  busy,
  onApprove,
  onAllowAlways,
  onDeny,
}: ApprovalButtonsProps): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="rounded-full bg-interactive-accent px-3 py-1 text-xs font-semibold text-text-on-accent disabled:opacity-60"
        disabled={busy}
        onClick={onApprove}
      >
        Allow once
      </button>
      <button
        type="button"
        className="rounded-full border border-border-semantic bg-surface-panel px-3 py-1 text-xs font-semibold text-text-semantic-secondary disabled:opacity-60"
        disabled={busy}
        onClick={onAllowAlways}
      >
        Allow always
      </button>
      <button
        type="button"
        className="rounded-full border border-status-error bg-status-error-subtle px-3 py-1 text-xs font-semibold text-status-error disabled:opacity-60"
        disabled={busy}
        onClick={onDeny}
      >
        Deny
      </button>
    </div>
  );
}

function ApprovalActions({ request }: { request: ApprovalRequest }): React.ReactElement {
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | 'remember' | null>(null);

  const handleDecision = (decision: 'approve' | 'reject'): void => {
    setBusyAction(decision);
    void window.electronAPI.approval.respond(request.requestId, decision).finally(() => {
      setBusyAction(null);
    });
  };
  const handleAllowAlways = (): void => {
    setBusyAction('remember');
    void Promise.all([
      window.electronAPI.approval.respond(request.requestId, 'approve'),
      window.electronAPI.approval.remember(request.toolName, getRequestKey(request), 'allow'),
    ]).finally(() => {
      setBusyAction(null);
    });
  };

  return (
    <ApprovalButtons
      busy={busyAction !== null}
      onApprove={() => {
        handleDecision('approve');
      }}
      onAllowAlways={handleAllowAlways}
      onDeny={() => {
        handleDecision('reject');
      }}
    />
  );
}

function ApprovalCard({
  request,
  queuedCount,
}: {
  request: ApprovalRequest;
  queuedCount: number;
}): React.ReactElement {
  return (
    <article className="rounded-2xl border border-status-warning bg-status-warning-subtle/70 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-status-warning">
          Approval required
        </span>
        <span className="font-mono text-xs text-text-semantic-primary">{request.toolName}</span>
        {queuedCount > 0 && (
          <span className="text-xs text-text-semantic-muted">+{queuedCount} queued</span>
        )}
      </div>
      <div className="mt-2 break-all font-mono text-xs text-text-semantic-secondary">
        {getRequestPreview(request)}
      </div>
      <div className="mt-3">
        <ApprovalActions request={request} />
      </div>
    </article>
  );
}

export function WorkbenchApprovalPanel(): React.ReactElement {
  const { requests } = useApprovalContext();
  const queuedCount = useMemo(() => Math.max(0, requests.length - 1), [requests.length]);

  if (requests.length === 0) return <EmptyApprovals />;

  return (
    <div
      className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
      data-testid="workbench-approval-panel"
    >
      {requests.map((request, index) => (
        <ApprovalCard
          key={request.requestId}
          request={request}
          queuedCount={index === 0 ? queuedCount : 0}
        />
      ))}
    </div>
  );
}
