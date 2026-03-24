import React from 'react';

import type { ApprovalRequest } from '../../types/electron';
import {
  ApprovalHeader,
  ApprovalMeta,
  DialogHint,
  PreviewPanel,
  RejectReasonInput,
} from './ApprovalDialogCardParts';

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

function ApproveButton({ onApprove }: { onApprove: () => void }): React.ReactElement {
  return (
    <ActionButton
      title="Approve (Enter or Y)"
      label="Approve (Y)"
      className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors"
      style={{ backgroundColor: '#98c379', color: '#1e1e1e', border: 'none', cursor: 'pointer' }}
      onClick={onApprove}
    />
  );
}

function RejectButton({ onReject }: { onReject: () => void }): React.ReactElement {
  return (
    <ActionButton
      title="Reject (Escape or N)"
      label="Reject (N)"
      className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors"
      style={{ backgroundColor: '#e06c75', color: '#fff', border: 'none', cursor: 'pointer' }}
      onClick={onReject}
    />
  );
}

function AlwaysAllowButton({ onAlwaysAllow }: { onAlwaysAllow: () => void }): React.ReactElement {
  return (
    <ActionButton
      title="Always Allow this tool for this session (A)"
      label="Always Allow (A)"
      className="px-4 py-2 rounded text-sm font-medium transition-colors text-interactive-accent"
      style={{
        backgroundColor: 'transparent',
        border: '1px solid var(--interactive-accent)',
        cursor: 'pointer',
      }}
      onClick={onAlwaysAllow}
    />
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
      <ApproveButton onApprove={onApprove} />
      <RejectButton onReject={handleReject} />
      <AlwaysAllowButton onAlwaysAllow={onAlwaysAllow} />
    </div>
  );
}

const DIALOG_PANEL_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--bg-panel, var(--surface-base))',
  padding: '20px',
  width: '560px',
  maxWidth: '90vw',
  maxHeight: '80vh',
  overflow: 'auto',
};

function DialogPanel(props: ApprovalDialogCardProps): React.ReactElement {
  const rejectInput = props.showRejectInput ? (
    <RejectReasonInput
      rejectReason={props.rejectReason}
      onRejectReasonChange={props.onRejectReasonChange}
      onConfirmReject={props.onConfirmReject}
      onHideRejectInput={props.onHideRejectInput}
    />
  ) : null;

  return (
    <div
      className="flex flex-col gap-3 rounded-lg shadow-2xl border border-border-semantic"
      style={DIALOG_PANEL_STYLE}
    >
      <ApprovalHeader queuedCount={props.queuedCount} />
      <ApprovalMeta request={props.request} elapsedSeconds={props.elapsedSeconds} />
      <PreviewPanel request={props.request} />
      {rejectInput}
      <ApprovalActions
        showRejectInput={props.showRejectInput}
        onApprove={props.onApprove}
        onAlwaysAllow={props.onAlwaysAllow}
        onConfirmReject={props.onConfirmReject}
        onShowRejectInput={props.onShowRejectInput}
      />
      <DialogHint />
    </div>
  );
}

export function ApprovalDialogCard(props: ApprovalDialogCardProps): React.ReactElement {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 9999, backdropFilter: 'blur(2px)' }}
      onClick={(event) => event.stopPropagation()}
    >
      <DialogPanel {...props} />
    </div>
  );
}
