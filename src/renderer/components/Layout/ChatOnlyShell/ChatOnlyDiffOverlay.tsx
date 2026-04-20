/**
 * ChatOnlyDiffOverlay — Full-screen modal overlay for DiffReviewPanel (Wave 42).
 *
 * Phase D: wires DiffReview state subscription, Esc + backdrop close,
 * focus save/restore, and minimal inline focus trap.
 *
 * Esc key closes the overlay. Focus is restored to the previously
 * focused element on close.
 */

import React, { useCallback, useEffect, useRef } from 'react';

import type { DiffReviewContextValue } from '../../DiffReview/DiffReviewManager';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { DiffReviewPanel } from '../../DiffReview/DiffReviewPanel';

export interface ChatOnlyDiffOverlayProps {
  open: boolean;
  onClose: () => void;
}

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function useFocusSaveRestore(open: boolean): void {
  const savedRef = useRef<Element | null>(null);
  useEffect(() => {
    if (open) {
      savedRef.current = document.activeElement;
    } else if (savedRef.current instanceof HTMLElement) {
      savedRef.current.focus();
      savedRef.current = null;
    }
  }, [open]);
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

function useFocusTrap(
  containerRef: React.MutableRefObject<HTMLDivElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const handleTab = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const el = containerRef.current;
      if (!el) return;
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => { document.removeEventListener('keydown', handleTab); };
  }, [active, containerRef]);
}

interface OverlayContentProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  diffReview: DiffReviewContextValue;
  handleClose: () => void;
  handleBackdrop: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function OverlayContent({ containerRef, diffReview, handleClose, handleBackdrop }: OverlayContentProps): React.ReactElement {
  if (!diffReview.state) return <></>;
  return (
    <div className="fixed inset-0 z-50 flex flex-col" data-testid="diff-overlay-backdrop" onClick={handleBackdrop}>
      <div
        ref={containerRef} role="dialog" aria-modal="true" aria-label="Diff review"
        tabIndex={-1} className="flex flex-col w-full h-full bg-surface-base" data-testid="diff-overlay"
      >
        <DiffReviewPanel
          state={diffReview.state} canRollback={diffReview.canRollback} enhancedEnabled={false}
          onAcceptHunk={diffReview.acceptHunk} onRejectHunk={diffReview.rejectHunk}
          onAcceptAllFile={diffReview.acceptAllFile} onRejectAllFile={diffReview.rejectAllFile}
          onAcceptAll={diffReview.acceptAll} onRejectAll={diffReview.rejectAll}
          onRollback={diffReview.rollback} onClose={handleClose}
          onConfirmStaleOp={diffReview.confirmStaleOp} onDismissStaleOp={diffReview.dismissStaleOp}
        />
      </div>
    </div>
  );
}

export function ChatOnlyDiffOverlay({ open, onClose }: ChatOnlyDiffOverlayProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const diffReview = useDiffReview();

  useFocusSaveRestore(open);
  useEscapeKey(open, onClose);
  useFocusTrap(containerRef, open);

  useEffect(() => {
    if (open && containerRef.current) containerRef.current.focus();
  }, [open]);

  const handleClose = useCallback((): void => {
    diffReview.closeReview();
    onClose();
  }, [diffReview, onClose]);

  const handleBackdrop = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!open || !diffReview.state) return null;
  return <OverlayContent containerRef={containerRef} diffReview={diffReview} handleClose={handleClose} handleBackdrop={handleBackdrop} />;
}
