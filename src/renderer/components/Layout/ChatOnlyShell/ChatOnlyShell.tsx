/**
 * ChatOnlyShell — Immersive single-column chat interface (Wave 42).
 *
 * Replaces InnerAppLayout at the renderer layer when active. Backend is
 * unchanged — same session store, same threads, same PTY, same hooks pipe.
 *
 * Wave 44 Phase B: introduces ChatOnlyBody horizontal flex row with
 * ChatHistorySidebar as left rail. Mode cycles pinned → collapsed → hidden.
 * When hidden, ChatOnlySessionDrawer overlay is kept as fallback.
 *
 * IdeToolBridge not mounted — IDE-context tool queries return empty in
 * chat-only mode (Wave 42 design).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { TOGGLE_SESSION_DRAWER_EVENT } from '../../../hooks/appEventNames';
import { AgentChatStoreContext, createAgentChatStore } from '../../AgentChat/agentChatStore';
import { AgentChatWorkspace } from '../../AgentChat/AgentChatWorkspace';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { ChatHistorySidebar } from './ChatHistorySidebar';
import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';
import { ChatOnlySessionDrawer } from './ChatOnlySessionDrawer';
import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';
import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';
import { useChatSidebarMode } from './useChatSidebarMode';

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

  // Hidden-mode fallback: legacy drawer toggle event still works.
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
  const { mode, cycleMode } = useChatSidebarMode();

  // Wave 43 hotfix: lift the AgentChat store above the title bar so
  // ChatOnlyHeaderControls (which lives in the title bar, outside
  // AgentChatWorkspace) can subscribe to the same model/permission state.
  // AgentChatWorkspace reuses this store via context instead of creating its own.
  const store = useRef(createAgentChatStore()).current;

  return (
    <AgentChatStoreContext.Provider value={store}>
      <div className="flex flex-col h-full w-full bg-surface-chat overflow-hidden">
        <ChatOnlyTitleBar onToggleDrawer={toggleDrawer} onCycleSidebarMode={cycleMode} sidebarMode={mode} />

        {/* ChatOnlyBody: horizontal flex row — sidebar rail + main content */}
        <div className="flex flex-1 min-h-0 overflow-hidden" data-testid="chat-only-body">
          <ChatHistorySidebar mode={mode} />

          <div className="relative flex-1 flex flex-col min-h-0">
            {/* Hidden-mode fallback: session drawer overlay */}
            {mode === 'hidden' && (
              <ChatOnlySessionDrawer open={drawerOpen} onClose={closeDrawer} />
            )}

            <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="w-full max-w-4xl flex flex-col flex-1 min-h-0 mx-auto">
                <AgentChatWorkspace projectRoot={projectRoot} variant="chat-only" />
              </div>
            </main>
          </div>
        </div>

        <ChatOnlyStatusBar projectRoot={projectRoot} onOpenDiffOverlay={openDiffOverlay} />
        <ChatOnlyDiffOverlay open={diffOverlayOpen} onClose={closeDiffOverlay} />
      </div>
    </AgentChatStoreContext.Provider>
  );
}
