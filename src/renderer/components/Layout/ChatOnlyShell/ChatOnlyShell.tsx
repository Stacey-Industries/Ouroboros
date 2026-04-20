/**
 * ChatOnlyShell — Immersive single-column chat interface (Wave 42).
 *
 * Replaces InnerAppLayout at the renderer layer when active. Backend is
 * unchanged — same session store, same threads, same PTY, same hooks pipe.
 *
 * IdeToolBridge not mounted — IDE-context tool queries return empty in
 * chat-only mode (Wave 42 design).
 */

import React, { useCallback, useEffect, useState } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { TOGGLE_SESSION_DRAWER_EVENT } from '../../../hooks/appEventNames';
import { AgentChatWorkspace } from '../../AgentChat/AgentChatWorkspace';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';
import { ChatOnlySessionDrawer } from './ChatOnlySessionDrawer';
import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';
import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';

function usePendingDiffCount(): number {
  const { state } = useDiffReview();
  if (!state) return 0;
  return state.files.filter((f) => f.hunks.some((h) => h.decision === 'pending')).length;
}

interface ShellState {
  drawerOpen: boolean;
  diffOverlayOpen: boolean;
  toggleDrawer: () => void;
  closeDrawer: () => void;
  openDiffOverlay: () => void;
  closeDiffOverlay: () => void;
}

function useShellState(pendingDiffCount: number): ShellState {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [diffOverlayOpen, setDiffOverlayOpen] = useState(false);

  const toggleDrawer = useCallback(() => { setDrawerOpen((prev) => !prev); }, []);
  const closeDrawer = useCallback(() => { setDrawerOpen(false); }, []);
  const openDiffOverlay = useCallback(() => { setDiffOverlayOpen(true); }, []);
  const closeDiffOverlay = useCallback(() => { setDiffOverlayOpen(false); }, []);

  // Auto-close the overlay once all diffs are resolved.
  useEffect(() => {
    if (diffOverlayOpen && pendingDiffCount === 0) closeDiffOverlay();
  }, [diffOverlayOpen, pendingDiffCount, closeDiffOverlay]);

  useEffect(() => {
    const handler = (): void => { toggleDrawer(); };
    window.addEventListener(TOGGLE_SESSION_DRAWER_EVENT, handler);
    return () => { window.removeEventListener(TOGGLE_SESSION_DRAWER_EVENT, handler); };
  }, [toggleDrawer]);

  return { drawerOpen, diffOverlayOpen, toggleDrawer, closeDrawer, openDiffOverlay, closeDiffOverlay };
}

export function ChatOnlyShell(): React.ReactElement {
  const { projectRoot } = useProject();
  const pendingDiffCount = usePendingDiffCount();
  const { drawerOpen, diffOverlayOpen, toggleDrawer, closeDrawer, openDiffOverlay, closeDiffOverlay } =
    useShellState(pendingDiffCount);

  return (
    <div className="flex flex-col h-full w-full bg-surface-base overflow-hidden">
      <ChatOnlyTitleBar onToggleDrawer={toggleDrawer} />

      <div className="relative flex-1 flex flex-col min-h-0">
        <ChatOnlySessionDrawer open={drawerOpen} onClose={closeDrawer} />

        <main className="flex-1 flex flex-col min-h-0 items-center overflow-hidden">
          <div className="w-full max-w-4xl flex flex-col h-full">
            <AgentChatWorkspace projectRoot={projectRoot} />
          </div>
        </main>
      </div>

      <ChatOnlyStatusBar projectRoot={projectRoot} onOpenDiffOverlay={openDiffOverlay} />
      <ChatOnlyDiffOverlay open={diffOverlayOpen} onClose={closeDiffOverlay} />
    </div>
  );
}
