/**
 * AgentChatBranchTreeButton.tsx — Wave 23 Phase B
 *
 * "Branches" button for the tab bar. Opens a BranchTreeView popover showing
 * all threads rooted at the root thread of the current workspace.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { AgentChatThreadRecord } from '../../types/electron';
import { BranchTreeView } from './BranchTreeView';

function usePopoverDismiss(
  open: boolean,
  buttonRef: React.RefObject<HTMLButtonElement | null>,
  popoverRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    function dismiss(e: MouseEvent): void {
      const target = e.target as Node;
      const outside =
        !buttonRef.current?.contains(target) && !popoverRef.current?.contains(target);
      if (outside) onClose();
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, buttonRef, popoverRef, onClose]);
}

function BranchTreePopover({
  popoverRef,
  rect,
  rootThread,
  activeThreadId,
  onSelect,
}: {
  popoverRef: React.RefObject<HTMLDivElement | null>;
  rect: DOMRect;
  rootThread: AgentChatThreadRecord;
  activeThreadId: string | null;
  onSelect: (id: string) => void;
}): React.ReactElement {
  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
        width: 220,
        maxHeight: 320,
        overflowY: 'auto',
        zIndex: 9999,
        backgroundColor: 'var(--surface-base)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    >
      <BranchTreeView
        rootThreadId={rootThread.id}
        rootTitle={rootThread.title}
        activeThreadId={activeThreadId ?? rootThread.id}
        onSelect={onSelect}
      />
    </div>,
    document.body,
  );
}

function BranchesToggleButton({
  buttonRef,
  open,
  onClick,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 px-2 py-1.5 text-xs text-text-semantic-muted transition-colors duration-100 hover:text-interactive-accent"
      title="Branch tree"
      aria-expanded={open}
      aria-haspopup="tree"
    >
      <span aria-hidden="true">&#x1F33F;</span>
      <span>Branches</span>
    </button>
  );
}

export function BranchTreeButton({
  rootThread,
  activeThreadId,
  onSelect,
}: {
  rootThread: AgentChatThreadRecord | null;
  activeThreadId: string | null;
  onSelect: (id: string) => void;
}): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const handleClose = useCallback(() => setOpen(false), []);
  usePopoverDismiss(open, buttonRef, popoverRef, handleClose);

  if (!rootThread) return null;
  const rect = buttonRef.current?.getBoundingClientRect();
  return (
    <>
      <BranchesToggleButton buttonRef={buttonRef} open={open} onClick={() => setOpen((v) => !v)} />
      {open && rect && (
        <BranchTreePopover
          popoverRef={popoverRef}
          rect={rect}
          rootThread={rootThread}
          activeThreadId={activeThreadId}
          onSelect={(id) => { onSelect(id); setOpen(false); }}
        />
      )}
    </>
  );
}
