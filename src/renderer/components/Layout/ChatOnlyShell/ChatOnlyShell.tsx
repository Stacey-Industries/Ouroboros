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
import { AgentChatWorkspace } from '../../AgentChat/AgentChatWorkspace';
import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';
import { ChatOnlySessionDrawer } from './ChatOnlySessionDrawer';
import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';
import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';

const TOGGLE_SESSION_DRAWER_EVENT = 'agent-ide:toggle-session-drawer';

export function ChatOnlyShell(): React.ReactElement {
  const { projectRoot } = useProject();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [diffOverlayOpen, setDiffOverlayOpen] = useState(false);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const openDiffOverlay = useCallback(() => {
    setDiffOverlayOpen(true);
  }, []);

  const closeDiffOverlay = useCallback(() => {
    setDiffOverlayOpen(false);
  }, []);

  useEffect(() => {
    const handler = () => { toggleDrawer(); };
    window.addEventListener(TOGGLE_SESSION_DRAWER_EVENT, handler);
    return () => { window.removeEventListener(TOGGLE_SESSION_DRAWER_EVENT, handler); };
  }, [toggleDrawer]);

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

      <ChatOnlyStatusBar
        projectRoot={projectRoot}
        onOpenDiffOverlay={openDiffOverlay}
      />

      <ChatOnlyDiffOverlay open={diffOverlayOpen} onClose={closeDiffOverlay} />
    </div>
  );
}
