/**
 * ChatOnlyDiffOverlay — Full-screen modal overlay for DiffReviewPanel (Wave 42).
 *
 * Phase A: scaffold + mount logic. Phase D wires the DiffReview state
 * subscription and pending-count display in the status bar.
 *
 * Esc key closes the overlay. Focus is moved into the overlay on open.
 */

import React, { useCallback, useEffect, useRef } from 'react';

import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { DiffReviewPanel } from '../../DiffReview/DiffReviewPanel';

export interface ChatOnlyDiffOverlayProps {
  open: boolean;
  onClose: () => void;
}

function useEscapeKey(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); };
  }, [active, onClose]);
}

function useDiffOverlayState(
  open: boolean,
  onClose: () => void,
): { containerRef: React.MutableRefObject<HTMLDivElement | null>; handleClose: () => void; diffReview: ReturnType<typeof useDiffReview> } {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const diffReview = useDiffReview();

  useEscapeKey(open, onClose);

  useEffect(() => {
    if (open && containerRef.current) containerRef.current.focus();
  }, [open]);

  const handleClose = useCallback((): void => {
    diffReview.closeReview();
    onClose();
  }, [diffReview, onClose]);

  return { containerRef, handleClose, diffReview };
}

export function ChatOnlyDiffOverlay({ open, onClose }: ChatOnlyDiffOverlayProps): React.ReactElement | null {
  const { containerRef, handleClose, diffReview } = useDiffOverlayState(open, onClose);
  if (!open || !diffReview.state) return null;
  return (
    <div ref={containerRef} role="dialog" aria-modal="true" aria-label="Diff review"
      tabIndex={-1} className="fixed inset-0 z-50 flex flex-col bg-surface-base"
      data-testid="diff-overlay">
      <DiffReviewPanel
        state={diffReview.state} canRollback={diffReview.canRollback} enhancedEnabled={false}
        onAcceptHunk={diffReview.acceptHunk} onRejectHunk={diffReview.rejectHunk}
        onAcceptAllFile={diffReview.acceptAllFile} onRejectAllFile={diffReview.rejectAllFile}
        onAcceptAll={diffReview.acceptAll} onRejectAll={diffReview.rejectAll}
        onRollback={diffReview.rollback} onClose={handleClose}
        onConfirmStaleOp={diffReview.confirmStaleOp} onDismissStaleOp={diffReview.dismissStaleOp}
      />
    </div>
  );
}
