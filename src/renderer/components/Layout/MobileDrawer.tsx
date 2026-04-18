/**
 * MobileDrawer.tsx — slide-from-left off-canvas drawer for mobile.
 *
 * Used on phone viewports to surface the file-tree sidebar without
 * switching the active panel. Composes MobileOverlayShell primitives
 * for scrim, focus trap, and body scroll lock.
 *
 * Wave 32 Phase F — mobile drawer + bottom sheet primitives.
 */

import React, { useRef } from 'react';

import {
  Scrim,
  useBodyScrollLock,
  useEscapeKey,
  useFocusTrap,
} from './MobileOverlayShell';

// ── Styles ────────────────────────────────────────────────────────────────────

const DRAWER_WRAPPER_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 201,
  pointerEvents: 'none',
};

function drawerPanelStyle(isOpen: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '85vw',
    maxWidth: '360px',
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    overflowX: 'hidden',
    backgroundColor: 'var(--surface-panel)',
    borderRight: '1px solid var(--border-subtle, var(--border-semantic))',
    transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
    transition: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
    willChange: 'transform',
    zIndex: 1,
  };
}

// ── MobileDrawer ──────────────────────────────────────────────────────────────

export interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel: string;
}

export function MobileDrawer({
  isOpen,
  onClose,
  children,
  ariaLabel,
}: MobileDrawerProps): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, isOpen);
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <>
      <Scrim onClose={onClose} />
      <div style={DRAWER_WRAPPER_STYLE} aria-hidden="false">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          style={drawerPanelStyle(isOpen)}
        >
          {children}
        </div>
      </div>
    </>
  );
}
