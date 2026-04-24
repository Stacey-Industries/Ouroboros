/**
 * AgentChatWorkspace.compare.tsx — Wave 23 Phase E / Wave 43 Phase C
 *
 * Extracted helpers for branch comparison modal and IDE-mode overlay panels:
 *   - useBranchCompare: hook that listens for OPEN_BRANCH_COMPARE_EVENT
 *   - BranchCompareModal: overlay wrapper around BranchCompareView
 *   - IdePanels: SideChatDrawer + BranchCompareModal, mounted only in 'ide' variant
 */
import React, { useCallback, useEffect, useState } from 'react';

import { OPEN_BRANCH_COMPARE_EVENT } from '../../hooks/appEventNames';
import { BranchCompareView } from './BranchCompareView';
import { SideChatDrawer } from './SideChatDrawer';
import type { useSideChat } from './useSideChat';

// ── IDE overlay panels ────────────────────────────────────────────────────────

export interface IdePanelsProps {
  sideChat: ReturnType<typeof useSideChat>;
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  compareState: BranchCompareState | null;
  closeCompare: () => void;
  onCloseTab: (id: string) => void;
}

export function IdePanels(p: IdePanelsProps): React.ReactElement {
  return (
    <>
      <SideChatDrawer
        isOpen={p.isDrawerOpen}
        onClose={() => p.setIsDrawerOpen(false)}
        sideChats={p.sideChat.sideChats}
        activeSideChatId={p.sideChat.activeSideChatId}
        onSelect={p.sideChat.setActive}
        onCloseTab={p.onCloseTab}
      />
      {p.compareState && (
        <BranchCompareModal compareState={p.compareState} onClose={p.closeCompare} />
      )}
    </>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BranchCompareState {
  leftThreadId: string;
  rightThreadId: string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBranchCompare(): {
  compareState: BranchCompareState | null;
  closeCompare: () => void;
} {
  const [compareState, setCompareState] = useState<BranchCompareState | null>(null);

  const closeCompare = useCallback(() => setCompareState(null), []);

  useEffect(() => {
    function handleCompare(e: Event): void {
      const detail = (e as CustomEvent<{ leftThreadId: string; rightThreadId: string }>).detail;
      if (detail?.leftThreadId && detail?.rightThreadId) {
        setCompareState({ leftThreadId: detail.leftThreadId, rightThreadId: detail.rightThreadId });
      }
    }
    window.addEventListener(OPEN_BRANCH_COMPARE_EVENT, handleCompare);
    return () => window.removeEventListener(OPEN_BRANCH_COMPARE_EVENT, handleCompare);
  }, []);

  return { compareState, closeCompare };
}

// ── Modal overlay ─────────────────────────────────────────────────────────────

export function BranchCompareModal({
  compareState,
  onClose,
}: {
  compareState: BranchCompareState;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-surface-overlay/80"
      role="presentation"
    >
      <div className="flex h-3/4 w-11/12 max-w-5xl overflow-hidden rounded-lg border border-border-semantic shadow-lg">
        <BranchCompareView
          leftThreadId={compareState.leftThreadId}
          rightThreadId={compareState.rightThreadId}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
