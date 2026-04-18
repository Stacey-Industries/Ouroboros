/**
 * MobileBottomSheet.tsx — slide-up bottom sheet for mobile secondary views.
 *
 * Used on phone viewports to surface AgentMonitor secondary views (monitor,
 * git, analytics, memory, rules) without leaving the chat surface. Composes
 * MobileOverlayShell primitives for scrim, focus trap, and body scroll lock.
 * Swipe-down-to-dismiss is handled by the shared useSwipeNavigation hook
 * (Wave 32 Phase I refactor of the inline pointer handler from Phase F).
 *
 * Wave 32 Phase F — mobile drawer + bottom sheet primitives.
 * Wave 32 Phase I — refactored swipe-down to use useSwipeNavigation.
 */

import React, { useRef } from 'react';

import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import {
  Scrim,
  useBodyScrollLock,
  useEscapeKey,
  useFocusTrap,
} from './MobileOverlayShell';

// ── Styles ────────────────────────────────────────────────────────────────────

const SHEET_WRAPPER_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 201,
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'flex-end',
};

const DRAG_HANDLE_STYLE: React.CSSProperties = {
  width: '40px',
  height: '4px',
  borderRadius: '2px',
  backgroundColor: 'var(--border-subtle, var(--border-semantic))',
  margin: '0 auto',
  flexShrink: 0,
};

const DRAG_HANDLE_ROW_STYLE: React.CSSProperties = {
  padding: '10px 0 6px',
  display: 'flex',
  justifyContent: 'center',
  cursor: 'grab',
  flexShrink: 0,
};

function sheetPanelStyle(isOpen: boolean): React.CSSProperties {
  return {
    position: 'relative',
    width: '100%',
    maxHeight: '75dvh',
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--surface-panel)',
    borderTop: '1px solid var(--border-subtle, var(--border-semantic))',
    borderRadius: '12px 12px 0 0',
    overflow: 'hidden',
    transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
    transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    willChange: 'transform',
  };
}

// ── MobileBottomSheet ─────────────────────────────────────────────────────────

export interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel: string;
}

export function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  ariaLabel,
}: MobileBottomSheetProps): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, isOpen);
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);
  useSwipeNavigation(panelRef, { axis: 'y', onSwipeDown: onClose, threshold: 80, enabled: isOpen });

  if (!isOpen) return null;

  return (
    <>
      <Scrim onClose={onClose} />
      <div style={SHEET_WRAPPER_STYLE} aria-hidden="false">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          style={sheetPanelStyle(isOpen)}
        >
          <div style={DRAG_HANDLE_ROW_STYLE} aria-hidden="true">
            <div style={DRAG_HANDLE_STYLE} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
