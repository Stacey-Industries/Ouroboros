import React from 'react';

import type { ApprovalRequest } from '../../types/electron';
import { ToolInputPreview } from './ToolInputPreview';

export const TOOL_COLORS: Record<string, string> = {
  Write: '#e06c75',
  write: '#e06c75',
  Bash: '#d19a66',
  bash: '#d19a66',
  Edit: '#e5c07b',
  edit: '#e5c07b',
  Read: '#61afef',
  read: '#61afef',
  Grep: '#98c379',
  grep: '#98c379',
  Glob: '#56b6c2',
  glob: '#56b6c2',
};

export function ToolBadge({ toolName }: { toolName: string }): React.ReactElement {
  const color = TOOL_COLORS[toolName] ?? 'var(--interactive-accent)';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {toolName}
    </span>
  );
}

export function ApprovalHeader({ queuedCount }: { queuedCount: number }): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--interactive-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span className="font-semibold text-base text-text-semantic-primary">
          Tool Approval Required
        </span>
      </div>
      {queuedCount > 0 && (
        <span
          className="text-xs px-2 py-0.5 rounded text-text-semantic-on-accent"
          style={{ backgroundColor: 'var(--interactive-accent)' }}
        >
          +{queuedCount} queued
        </span>
      )}
    </div>
  );
}

export function ApprovalMeta({
  request,
  elapsedSeconds,
}: {
  request: ApprovalRequest;
  elapsedSeconds: number;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <ToolBadge toolName={request.toolName} />
      <span className="text-xs text-text-semantic-muted">
        Session {request.sessionId.slice(0, 8)}...
      </span>
      <span className="text-xs text-text-semantic-muted">
        {elapsedSeconds > 0 ? `${elapsedSeconds}s ago` : 'just now'}
      </span>
    </div>
  );
}

export function PreviewPanel({ request }: { request: ApprovalRequest }): React.ReactElement {
  return (
    <div
      className="rounded p-3 border border-border-semantic"
      style={{ backgroundColor: 'var(--bg-deeper, rgba(0,0,0,0.2))' }}
    >
      <ToolInputPreview toolName={request.toolName} input={request.toolInput} />
    </div>
  );
}

export function DialogHint(): React.ReactElement {
  return (
    <div className="text-center text-xs text-text-semantic-muted">
      Claude Code is waiting for your decision. The tool will not execute until you respond.
    </div>
  );
}

export function RejectReasonField({
  rejectReason,
  onRejectReasonChange,
  onConfirmReject,
  onHideRejectInput,
}: {
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
  onConfirmReject: () => void;
  onHideRejectInput: () => void;
}): React.ReactElement {
  return (
    <input
      type="text"
      value={rejectReason}
      onChange={(event) => onRejectReasonChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onConfirmReject();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onHideRejectInput();
        }
      }}
      placeholder="Rejection reason (optional)..."
      autoFocus
      className="flex-1 px-3 py-1.5 rounded text-sm bg-surface-base text-text-semantic-primary border border-border-semantic outline-none"
    />
  );
}

export function RejectReasonInput({
  rejectReason,
  onRejectReasonChange,
  onConfirmReject,
  onHideRejectInput,
}: {
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
  onConfirmReject: () => void;
  onHideRejectInput: () => void;
}): React.ReactElement {
  return (
    <div className="flex gap-2">
      <RejectReasonField
        rejectReason={rejectReason}
        onRejectReasonChange={onRejectReasonChange}
        onConfirmReject={onConfirmReject}
        onHideRejectInput={onHideRejectInput}
      />
      <button
        onClick={onConfirmReject}
        className="px-3 py-1.5 rounded text-sm font-medium"
        style={{ backgroundColor: '#e06c75', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        Confirm
      </button>
    </div>
  );
}
