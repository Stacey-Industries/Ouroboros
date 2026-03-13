import React from 'react';
import type { ApprovalRequest } from '../../types/electron';
import { ToolInputPreview } from './ToolInputPreview';

const TOOL_COLORS: Record<string, string> = {
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

interface ApprovalDialogCardProps {
  request: ApprovalRequest;
  queuedCount: number;
  elapsedSeconds: number;
  rejectReason: string;
  showRejectInput: boolean;
  onRejectReasonChange: (value: string) => void;
  onApprove: () => void;
  onAlwaysAllow: () => void;
  onConfirmReject: () => void;
  onShowRejectInput: () => void;
  onHideRejectInput: () => void;
}

function ToolBadge({ toolName }: { toolName: string }): React.ReactElement {
  const color = TOOL_COLORS[toolName] ?? 'var(--accent)';

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold"
      style={{
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {toolName}
    </span>
  );
}

function ApprovalHeader({ queuedCount }: { queuedCount: number }): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span className="font-semibold text-base" style={{ color: 'var(--text)' }}>
          Tool Approval Required
        </span>
      </div>
      {queuedCount > 0 && (
        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}>
          +{queuedCount} queued
        </span>
      )}
    </div>
  );
}

function ApprovalMeta({
  request,
  elapsedSeconds,
}: {
  request: ApprovalRequest;
  elapsedSeconds: number;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <ToolBadge toolName={request.toolName} />
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Session {request.sessionId.slice(0, 8)}...
      </span>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {elapsedSeconds > 0 ? `${elapsedSeconds}s ago` : 'just now'}
      </span>
    </div>
  );
}

function RejectReasonField({
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
      className="flex-1 px-3 py-1.5 rounded text-sm"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none' }}
    />
  );
}

function ConfirmRejectButton({ onConfirmReject }: { onConfirmReject: () => void }): React.ReactElement {
  return (
    <button onClick={onConfirmReject} className="px-3 py-1.5 rounded text-sm font-medium" style={{ backgroundColor: '#e06c75', color: '#fff', border: 'none', cursor: 'pointer' }}>
      Confirm
    </button>
  );
}

function RejectReasonInput({
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
      <RejectReasonField rejectReason={rejectReason} onRejectReasonChange={onRejectReasonChange} onConfirmReject={onConfirmReject} onHideRejectInput={onHideRejectInput} />
      <ConfirmRejectButton onConfirmReject={onConfirmReject} />
    </div>
  );
}

function ActionButton({
  title,
  label,
  className,
  style,
  onClick,
}: {
  title: string;
  label: string;
  className: string;
  style: React.CSSProperties;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button onClick={onClick} className={className} style={style} title={title}>
      {label}
    </button>
  );
}

function ApprovalActions({
  showRejectInput,
  onApprove,
  onAlwaysAllow,
  onConfirmReject,
  onShowRejectInput,
}: {
  showRejectInput: boolean;
  onApprove: () => void;
  onAlwaysAllow: () => void;
  onConfirmReject: () => void;
  onShowRejectInput: () => void;
}): React.ReactElement {
  const handleReject = showRejectInput ? onConfirmReject : onShowRejectInput;

  return (
    <div className="flex items-center gap-2 mt-1">
      <ActionButton title="Approve (Enter or Y)" label="Approve (Y)" className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors" style={{ backgroundColor: '#98c379', color: '#1e1e1e', border: 'none', cursor: 'pointer' }} onClick={onApprove} />
      <ActionButton title="Reject (Escape or N)" label="Reject (N)" className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors" style={{ backgroundColor: '#e06c75', color: '#fff', border: 'none', cursor: 'pointer' }} onClick={handleReject} />
      <ActionButton title="Always Allow this tool for this session (A)" label="Always Allow (A)" className="px-4 py-2 rounded text-sm font-medium transition-colors" style={{ backgroundColor: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)', cursor: 'pointer' }} onClick={onAlwaysAllow} />
    </div>
  );
}

function PreviewPanel({ request }: { request: ApprovalRequest }): React.ReactElement {
  return (
    <div className="rounded p-3" style={{ backgroundColor: 'var(--bg-deeper, rgba(0,0,0,0.2))', border: '1px solid var(--border)' }}>
      <ToolInputPreview toolName={request.toolName} input={request.toolInput} />
    </div>
  );
}

function DialogHint(): React.ReactElement {
  return (
    <div className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
      Claude Code is waiting for your decision. The tool will not execute until you respond.
    </div>
  );
}

export function ApprovalDialogCard({
  request,
  queuedCount,
  elapsedSeconds,
  rejectReason,
  showRejectInput,
  onRejectReasonChange,
  onApprove,
  onAlwaysAllow,
  onConfirmReject,
  onShowRejectInput,
  onHideRejectInput,
}: ApprovalDialogCardProps): React.ReactElement {
  const rejectInput = showRejectInput ? (
    <RejectReasonInput
      rejectReason={rejectReason}
      onRejectReasonChange={onRejectReasonChange}
      onConfirmReject={onConfirmReject}
      onHideRejectInput={onHideRejectInput}
    />
  ) : null;

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 9999, backdropFilter: 'blur(2px)' }} onClick={(event) => event.stopPropagation()}>
      <div className="flex flex-col gap-3 rounded-lg shadow-2xl" style={{ backgroundColor: 'var(--bg-panel, var(--bg))', border: '1px solid var(--border)', padding: '20px', width: '560px', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto' }}>
        <ApprovalHeader queuedCount={queuedCount} />
        <ApprovalMeta request={request} elapsedSeconds={elapsedSeconds} />
        <PreviewPanel request={request} />
        {rejectInput}
        <ApprovalActions showRejectInput={showRejectInput} onApprove={onApprove} onAlwaysAllow={onAlwaysAllow} onConfirmReject={onConfirmReject} onShowRejectInput={onShowRejectInput} />
        <DialogHint />
      </div>
    </div>
  );
}
