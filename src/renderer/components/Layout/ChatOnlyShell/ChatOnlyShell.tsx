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
 * Wave 44 Phase C: mounts ChatOnlySettingsOverlay (Ctrl+,), CommandPalette
 * (Ctrl+K), and KeyboardShortcutCheatSheet (Ctrl+/) at shell level so they
 * are reachable from chat-only mode.
 *
 * IdeToolBridge not mounted — IDE-context tool queries return empty in
 * chat-only mode (Wave 42 design).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { TOGGLE_SESSION_DRAWER_EVENT } from '../../../hooks/appEventNames';
import { AgentChatStoreContext, createAgentChatStore } from '../../AgentChat/agentChatStore';
import { AgentChatWorkspace } from '../../AgentChat/AgentChatWorkspace';
import { CommandPalette } from '../../CommandPalette/CommandPalette';
import { useCommandPalette } from '../../CommandPalette/useCommandPalette';
import { useCommandRegistry } from '../../CommandPalette/useCommandRegistry';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { ChatHistorySidebar } from './ChatHistorySidebar';
import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';
import { ChatOnlySessionDrawer } from './ChatOnlySessionDrawer';
import { ChatOnlySettingsOverlay } from './ChatOnlySettingsOverlay';
import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';
import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';
import { KeyboardShortcutCheatSheet } from './KeyboardShortcutCheatSheet';
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

  // Wave 44 Phase C: command palette wired at shell level (Ctrl+K).
  // useCommandPalette handles 'agent-ide:command-palette' DOM event + Ctrl+Shift+P.
  const { isOpen: paletteOpen, close: closePalette } = useCommandPalette();
  const { commands, recentIds, execute } = useCommandRegistry();

  return (
    <AgentChatStoreContext.Provider value={store}>
      <div className="flex flex-col h-screen w-screen bg-surface-chat overflow-hidden">
        <ChatOnlyTitleBar onToggleDrawer={toggleDrawer} onCycleSidebarMode={cycleMode} sidebarMode={mode} />
        <ChatOnlyBody
          mode={mode}
          drawerOpen={drawerOpen}
          closeDrawer={closeDrawer}
          projectRoot={projectRoot}
        />
        <ChatOnlyStatusBar projectRoot={projectRoot} onOpenDiffOverlay={openDiffOverlay} />
        <ChatOnlyDiffOverlay open={diffOverlayOpen} onClose={closeDiffOverlay} />
        <ChatOnlyOverlays
          paletteOpen={paletteOpen}
          closePalette={closePalette}
          commands={commands}
          recentIds={recentIds}
          execute={execute}
        />
      </div>
    </AgentChatStoreContext.Provider>
  );
}

interface ChatOnlyBodyProps {
  mode: ReturnType<typeof useChatSidebarMode>['mode'];
  drawerOpen: boolean;
  closeDrawer: () => void;
  projectRoot: string | null;
}

function ChatOnlyBody({ mode, drawerOpen, closeDrawer, projectRoot }: ChatOnlyBodyProps): React.ReactElement {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden" data-testid="chat-only-body">
      <ChatHistorySidebar mode={mode} />
      <div className="relative flex-1 flex flex-col min-h-0">
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
  );
}

interface ChatOnlyOverlaysProps {
  paletteOpen: boolean;
  closePalette: () => void;
  commands: ReturnType<typeof useCommandRegistry>['commands'];
  recentIds: ReturnType<typeof useCommandRegistry>['recentIds'];
  execute: ReturnType<typeof useCommandRegistry>['execute'];
}

function ChatOnlyOverlays({
  paletteOpen, closePalette, commands, recentIds, execute,
}: ChatOnlyOverlaysProps): React.ReactElement {
  return (
    <>
      <ChatOnlySettingsOverlay />
      <KeyboardShortcutCheatSheet />
      <CommandPalette
        isOpen={paletteOpen}
        onClose={closePalette}
        commands={commands}
        recentIds={recentIds}
        onExecute={execute}
      />
    </>
  );
}
