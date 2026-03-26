/**
 * ApprovalDialog.tsx - Pre-execution approval dialog for Claude Code tool calls.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { ApprovalRequest } from '../../types/electron';
import { ApprovalDialogCard } from './ApprovalDialogCard';

interface ApprovalDialogProps {
  requests: ApprovalRequest[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string, reason?: string) => void;
  onAlwaysAllow: (requestId: string, sessionId: string, toolName: string) => void;
}

type ApprovalDialogState = {
  rejectReason: string;
  setRejectReason: React.Dispatch<React.SetStateAction<string>>;
  showRejectInput: boolean;
  setShowRejectInput: React.Dispatch<React.SetStateAction<boolean>>;
  confirmReject: () => void;
};

function useApprovalDialogState(
  current: ApprovalRequest | undefined,
  onApprove: ApprovalDialogProps['onApprove'],
  onReject: ApprovalDialogProps['onReject'],
  onAlwaysAllow: ApprovalDialogProps['onAlwaysAllow'],
): ApprovalDialogState {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  useEffect(() => {
    setRejectReason('');
    setShowRejectInput(false);
  }, [current?.requestId]);
  const confirmReject = useCallback(() => {
    if (!current) return;
    onReject(current.requestId, rejectReason || undefined);
    setRejectReason('');
    setShowRejectInput(false);
  }, [current, onReject, rejectReason]);
  useEffect(() => {
    if (!current || showRejectInput) return;
    const req = current;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Enter' || event.key === 'y' || event.key === 'Y') {
        event.preventDefault();
        onApprove(req.requestId);
      } else if (event.key === 'Escape' || event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        onReject(req.requestId);
      } else if (event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        onAlwaysAllow(req.requestId, req.sessionId, req.toolName);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current, showRejectInput, onApprove, onReject, onAlwaysAllow]);
  return { rejectReason, setRejectReason, showRejectInput, setShowRejectInput, confirmReject };
}

export function ApprovalDialog({
  requests,
  onApprove,
  onReject,
  onAlwaysAllow,
}: ApprovalDialogProps): React.ReactElement | null {
  const current = requests[0];
  const state = useApprovalDialogState(current, onApprove, onReject, onAlwaysAllow);

  if (!current) return null;

  return (
    <ApprovalDialogCard
      request={current}
      queuedCount={requests.length - 1}
      elapsedSeconds={Math.floor((Date.now() - current.timestamp) / 1000)}
      rejectReason={state.rejectReason}
      showRejectInput={state.showRejectInput}
      onRejectReasonChange={state.setRejectReason}
      onApprove={() => onApprove(current.requestId)}
      onAlwaysAllow={() => onAlwaysAllow(current.requestId, current.sessionId, current.toolName)}
      onConfirmReject={state.confirmReject}
      onShowRejectInput={() => state.setShowRejectInput(true)}
      onHideRejectInput={() => state.setShowRejectInput(false)}
    />
  );
}
