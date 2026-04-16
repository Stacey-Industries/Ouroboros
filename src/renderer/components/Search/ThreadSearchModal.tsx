/**
 * ThreadSearchModal.tsx — Overlay modal wrapping ThreadSearch.
 *
 * Toggled by the DOM CustomEvent `agent-ide:open-thread-search`.
 * Closes on Escape (delegated to ThreadSearch), backdrop click, or when
 * the agent-ide:open-thread event fires (user selected a result).
 */

import React, { useCallback, useEffect, useState } from 'react';

import { ThreadSearch } from './ThreadSearch';

// ── Component ─────────────────────────────────────────────────────────────────

export function ThreadSearchModal(): React.ReactElement | null {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    window.addEventListener('agent-ide:open-thread-search', handleOpen);
    // Auto-close once the user navigates to a thread
    window.addEventListener('agent-ide:open-thread', handleClose);
    return () => {
      window.removeEventListener('agent-ide:open-thread-search', handleOpen);
      window.removeEventListener('agent-ide:open-thread', handleClose);
    };
  }, [handleOpen, handleClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search threads"
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-overlay/60"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-border-semantic bg-surface-raised shadow-xl">
        <ThreadSearch onClose={handleClose} />
      </div>
    </div>
  );
}
