/**
 * ChatSearchOverlay — modal search overlay for chat threads.
 *
 * Opens via Ctrl+F / Cmd+F while the workbench is mounted.
 * Search is local (no IPC); results come from the Zustand store.
 * Uses role="dialog" (inside DialogPanel) for solid-modal styling.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatSearchMatch } from '../../../hooks/useChatSearch';
import { useChatSearch } from '../../../hooks/useChatSearch';
import type { DialogPanelProps } from './ChatSearchOverlay.parts';
import { DialogPanel } from './ChatSearchOverlay.parts';

// ── useOverlayKeyboard ────────────────────────────────────────────────────────

interface KeyboardOpts {
  matches: ChatSearchMatch[];
  selectedIdx: number;
  setSelectedIdx: React.Dispatch<React.SetStateAction<number>>;
  onClose: () => void;
  onActivate: (id: string) => void;
}

function useOverlayKeyboard(
  opts: KeyboardOpts,
): (e: React.KeyboardEvent<HTMLInputElement>) => void {
  const { matches, selectedIdx, setSelectedIdx, onClose, onActivate } = opts;
  return useCallback(
    (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, matches.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && matches[selectedIdx]) {
        onActivate(matches[selectedIdx].threadId);
      }
    },
    [matches, selectedIdx, setSelectedIdx, onClose, onActivate],
  );
}

// ── useDialogProps ────────────────────────────────────────────────────────────

function useDialogProps(projectRoot: string | null, onClose: () => void): DialogPanelProps {
  const { query, scope, matches, setQuery, setScope, selectThread } = useChatSearch(projectRoot);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setSelectedIdx(0);
  }, [matches.length]);
  const onActivate = useCallback(
    (id: string) => {
      selectThread(id);
      onClose();
    },
    [selectThread, onClose],
  );
  const onKeyDown = useOverlayKeyboard({
    matches,
    selectedIdx,
    setSelectedIdx,
    onClose,
    onActivate,
  });
  return {
    query,
    scope,
    matches,
    selectedIdx,
    inputRef,
    onQueryChange: setQuery,
    onScopeChange: setScope,
    onKeyDown,
    onSelectIdx: setSelectedIdx,
    onActivate,
  };
}

// ── ChatSearchOverlay ─────────────────────────────────────────────────────────

export interface ChatSearchOverlayProps {
  projectRoot: string | null;
  onClose: () => void;
}

export function ChatSearchOverlay({
  projectRoot,
  onClose,
}: ChatSearchOverlayProps): React.ReactElement {
  const panelProps = useDialogProps(projectRoot, onClose);
  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );
  return (
    <div
      className="fixed inset-0 z-[900] flex items-start justify-center bg-surface-overlay/60 pt-24"
      onClick={handleBackdrop}
      data-testid="chat-search-overlay"
    >
      <DialogPanel {...panelProps} />
    </div>
  );
}
