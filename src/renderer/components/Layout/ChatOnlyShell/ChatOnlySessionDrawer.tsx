/**
 * ChatOnlySessionDrawer — Off-canvas session-history drawer (Wave 42).
 *
 * Slides in from the left. Mounts SessionSidebar inside.
 * Backdrop click and Esc key both close the drawer.
 */

import React, { useEffect, useRef } from 'react';

import { SessionSidebar } from '../../SessionSidebar/SessionSidebar';

export interface ChatOnlySessionDrawerProps {
  open: boolean;
  onClose: () => void;
}

// ── Backdrop ──────────────────────────────────────────────────────────────────

function Backdrop({ visible, onClose }: { visible: boolean; onClose: () => void }): React.ReactElement | null {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-40 bg-surface-overlay"
      style={{ opacity: 0.4 }}
      aria-hidden="true"
      onClick={onClose}
      data-testid="drawer-backdrop"
    />
  );
}

// ── ChatOnlySessionDrawer ─────────────────────────────────────────────────────

export function ChatOnlySessionDrawer({ open, onClose }: ChatOnlySessionDrawerProps): React.ReactElement {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Esc key closes the drawer
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); };
  }, [open, onClose]);

  // Move focus into drawer when it opens
  useEffect(() => {
    if (open && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [open]);

  const translateClass = open ? 'translate-x-0' : '-translate-x-full';

  return (
    <>
      <Backdrop visible={open} onClose={onClose} />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Session history"
        tabIndex={-1}
        className={`fixed top-0 left-0 z-50 h-full w-72 flex flex-col bg-surface-panel border-r border-border-semantic shadow-lg transition-transform duration-200 ease-in-out ${translateClass}`}
        data-testid="session-drawer"
        data-open={String(open)}
      >
        <SessionSidebar />
      </div>
    </>
  );
}
