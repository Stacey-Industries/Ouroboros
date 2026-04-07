import React, { useEffect, useRef } from 'react';

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
}): React.ReactElement<unknown> {
  return (
    <button onClick={onClick} className={className} style={style} title={title}>
      {label}
    </button>
  );
}

function ApproveButton({ onApprove }: { onApprove: () => void }): React.ReactElement<unknown> {
  return (
    <ActionButton
      title="Approve (Enter or Y)"
      label="Approve (Y)"
      className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors text-text-semantic-on-accent"
      style={{ backgroundColor: 'var(--status-success)', border: 'none', cursor: 'pointer' }}
      onClick={onApprove}
    />
  );
}

function RejectButton({ onReject }: { onReject: () => void }): React.ReactElement<unknown> {
  return (
    <ActionButton
      title="Reject (Escape or N)"
      label="Reject (N)"
      className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors text-text-semantic-on-accent"
      style={{ backgroundColor: 'var(--status-error)', border: 'none', cursor: 'pointer' }}
      onClick={onReject}
    />
  );
}

function AlwaysAllowButton({
  onAlwaysAllow,
}: {
  onAlwaysAllow: () => void;
}): React.ReactElement<unknown> {
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
}): React.ReactElement<unknown> {
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

const TITLE_ID = 'approval-dialog-title';

const FOCUSABLE_SELECTORS =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(dialogEl: HTMLElement, event: KeyboardEvent): void {
  const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function useFocusTrap(panelRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
    firstFocusable?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (!panel || event.key !== 'Tab') return;
      trapFocus(panel, event);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [panelRef]);
}

function DialogPanel(props: ApprovalDialogCardProps): React.ReactElement<unknown> {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);

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
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      className="flex flex-col gap-3 rounded-lg shadow-2xl border border-border-semantic"
      style={DIALOG_PANEL_STYLE}
    >
      <ApprovalHeader queuedCount={props.queuedCount} titleId={TITLE_ID} />
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

export function ApprovalDialogCard(props: ApprovalDialogCardProps): React.ReactElement<unknown> {
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
