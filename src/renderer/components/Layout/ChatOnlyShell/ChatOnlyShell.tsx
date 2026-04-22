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
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { AgentChatStoreContext, createAgentChatStore } from '../../AgentChat/agentChatStore';
import { AgentChatWorkspace } from '../../AgentChat/AgentChatWorkspace';
import { CommandPalette } from '../../CommandPalette/CommandPalette';
import type { Command } from '../../CommandPalette/types';
import { useCommandPalette } from '../../CommandPalette/useCommandPalette';
import { useCommandRegistry } from '../../CommandPalette/useCommandRegistry';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { ChatHistorySidebar } from './ChatHistorySidebar';
import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';
import { ChatOnlySessionDrawer } from './ChatOnlySessionDrawer';
import { ChatOnlySettingsOverlay } from './ChatOnlySettingsOverlay';
import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';
import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';
import { ChatWorkbenchShell } from './ChatWorkbenchShell';
import { KeyboardShortcutCheatSheet } from './KeyboardShortcutCheatSheet';
import { useChatSidebarMode } from './useChatSidebarMode';
import { useChatWorkbenchFlag } from './useChatWorkbenchFlag';

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

export interface ChatOnlyShellProps {
  terminal?: UseTerminalSessionsReturn;
}

interface ShellRenderArgs {
  terminal?: UseTerminalSessionsReturn;
  projectRoot: string | null;
  shell: ShellState;
  sidebarMode: ReturnType<typeof useChatSidebarMode>;
  palette: { open: boolean; close: () => void };
  commandApi: { commands: Command[]; recentIds: string[]; execute: (c: Command) => Promise<void> };
}

function renderWorkbenchShell(args: ShellRenderArgs): React.ReactElement {
  const { terminal, projectRoot, shell, palette, commandApi } = args;
  return (
    <ChatWorkbenchShell
      projectRoot={projectRoot}
      terminal={terminal}
      diffOverlayOpen={shell.diffOverlayOpen}
      openDiffOverlay={shell.openDiffOverlay}
      closeDiffOverlay={shell.closeDiffOverlay}
      toggleDrawer={shell.toggleDrawer}
      paletteOpen={palette.open}
      closePalette={palette.close}
      commands={commandApi.commands}
      recentIds={commandApi.recentIds}
      execute={commandApi.execute}
    />
  );
}

function renderClassicShell(args: ShellRenderArgs): React.ReactElement {
  const { projectRoot, shell, sidebarMode, palette, commandApi } = args;
  return (
    <div
      data-layout="app"
      className="flex flex-col h-screen w-screen bg-surface-base overflow-hidden"
      style={{ backgroundImage: 'var(--glass-dim, none), var(--bg-glows, none), var(--bg-wash, none)' }}
    >
      <ChatOnlyTitleBar
        onToggleDrawer={shell.toggleDrawer}
        onCycleSidebarMode={sidebarMode.cycleMode}
        sidebarMode={sidebarMode.mode}
      />
      <ChatOnlyBody
        mode={sidebarMode.mode}
        drawerOpen={shell.drawerOpen}
        closeDrawer={shell.closeDrawer}
        projectRoot={projectRoot}
      />
      <ChatOnlyStatusBar projectRoot={projectRoot} onOpenDiffOverlay={shell.openDiffOverlay} />
      <ChatOnlyDiffOverlay open={shell.diffOverlayOpen} onClose={shell.closeDiffOverlay} />
      <ChatOnlyOverlays
        paletteOpen={palette.open}
        closePalette={palette.close}
        commands={commandApi.commands}
        recentIds={commandApi.recentIds}
        execute={commandApi.execute}
      />
    </div>
  );
}

export function ChatOnlyShell({ terminal }: ChatOnlyShellProps = {}): React.ReactElement {
  const { projectRoot } = useProject();
  const pendingDiffCount = usePendingDiffCount();
  const shell = useShellState(pendingDiffCount);
  const sidebarMode = useChatSidebarMode();
  const isWorkbench = useChatWorkbenchFlag();

  // Wave 43 hotfix: lift AgentChat store above the title bar so controls
  // outside AgentChatWorkspace share the same model/permission state.
  const store = useRef(createAgentChatStore()).current;

  // Wave 44 Phase C: command palette wired at shell level (Ctrl+K).
  const { isOpen: paletteOpen, close: closePalette } = useCommandPalette();
  const { commands, recentIds, execute } = useCommandRegistry();

  const args: ShellRenderArgs = {
    terminal,
    projectRoot,
    shell,
    sidebarMode,
    palette: { open: paletteOpen, close: closePalette },
    commandApi: { commands, recentIds, execute },
  };

  return (
    <AgentChatStoreContext.Provider value={store}>
      {isWorkbench ? renderWorkbenchShell(args) : renderClassicShell(args)}
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
