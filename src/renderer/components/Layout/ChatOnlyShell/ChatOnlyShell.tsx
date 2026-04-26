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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { filterCommandsForChatShell } from './chatOnlyCommandFilter';
import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';
import { ChatOnlySessionDrawer } from './ChatOnlySessionDrawer';
import { ChatOnlySettingsOverlay } from './ChatOnlySettingsOverlay';
import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';
import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';
import { ChatWorkbenchShell } from './ChatWorkbenchShell';
import { KeyboardShortcutCheatSheet } from './KeyboardShortcutCheatSheet';
import { useChatSidebarMode } from './useChatSidebarMode';
import { useChatWorkbenchFlag } from './useChatWorkbenchFlag';

interface DiffSummary {
  pendingCount: number;
  isLoading: boolean;
  hasLoadedState: boolean;
}

function useDiffSummary(): DiffSummary {
  const { state } = useDiffReview();
  if (!state) return { pendingCount: 0, isLoading: false, hasLoadedState: false };
  const pendingCount = state.files.filter((f) =>
    f.hunks.some((h) => h.decision === 'pending'),
  ).length;
  return { pendingCount, isLoading: state.loading, hasLoadedState: true };
}

interface ShellState {
  drawerOpen: boolean;
  diffOverlayOpen: boolean;
  toggleDrawer: () => void;
  closeDrawer: () => void;
  openDiffOverlay: () => void;
  closeDiffOverlay: () => void;
}

function useShellState(diff: DiffSummary): ShellState {
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

  // Auto-close only after the review state has finished loading and there are
  // no pending hunks left — otherwise a just-opened overlay would close itself
  // during the brief window when files=[] + loading=true.
  useEffect(() => {
    if (!diffOverlayOpen) return;
    if (!diff.hasLoadedState) return;
    if (diff.isLoading) return;
    if (diff.pendingCount === 0) closeDiffOverlay();
  }, [diffOverlayOpen, diff.hasLoadedState, diff.isLoading, diff.pendingCount, closeDiffOverlay]);

  // Hidden-mode fallback: legacy drawer toggle event still works.
  useEffect(() => {
    const handler = (): void => {
      toggleDrawer();
    };
    window.addEventListener(TOGGLE_SESSION_DRAWER_EVENT, handler);
    return () => {
      window.removeEventListener(TOGGLE_SESSION_DRAWER_EVENT, handler);
    };
  }, [toggleDrawer]);

  return {
    drawerOpen,
    diffOverlayOpen,
    toggleDrawer,
    closeDrawer,
    openDiffOverlay,
    closeDiffOverlay,
  };
}

interface DiffReviewOpenDetail {
  sessionId?: string;
  snapshotHash?: string;
  projectRoot?: string;
  filePaths?: string[];
}

function useChatOnlyDiffReviewEvents(args: {
  isWorkbench: boolean;
  openDiffOverlay: () => void;
}): void {
  const diffReview = useDiffReview();
  const { isWorkbench, openDiffOverlay } = args;

  useEffect(() => {
    const handleOpen = (event: Event): void => {
      const detail = (event as CustomEvent<DiffReviewOpenDetail>).detail;
      if (!detail?.sessionId || !detail.snapshotHash || !detail.projectRoot) {
        return;
      }
      diffReview.openReview(
        detail.sessionId,
        detail.snapshotHash,
        detail.projectRoot,
        detail.filePaths,
      );
      if (!isWorkbench) {
        openDiffOverlay();
      }
    };

    window.addEventListener('agent-ide:open-diff-review', handleOpen);
    return () => {
      window.removeEventListener('agent-ide:open-diff-review', handleOpen);
    };
  }, [diffReview, isWorkbench, openDiffOverlay]);
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
      style={{
        backgroundImage: 'var(--glass-dim, none), var(--bg-glows, none), var(--bg-wash, none)',
      }}
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
  const diff = useDiffSummary();
  const shell = useShellState(diff);
  const sidebarMode = useChatSidebarMode();
  const isWorkbench = useChatWorkbenchFlag();
  useChatOnlyDiffReviewEvents({ isWorkbench, openDiffOverlay: shell.openDiffOverlay });

  // Wave 43 hotfix: lift AgentChat store above the title bar so controls
  // outside AgentChatWorkspace share the same model/permission state.
  const store = useRef(createAgentChatStore()).current;

  // Wave 44 Phase C: command palette wired at shell level (Ctrl+K).
  const { isOpen: paletteOpen, close: closePalette } = useCommandPalette();
  const { commands, recentIds, execute } = useCommandRegistry();
  // Wave 46 Phase F: filter IDE-only commands that are no-ops in chat-only and
  // chat-workbench shells (toggle-sidebar, split-editor, in-shell git review).
  const filteredCommands = useMemo(() => filterCommandsForChatShell(commands), [commands]);

  const args: ShellRenderArgs = {
    terminal,
    projectRoot,
    shell,
    sidebarMode,
    palette: { open: paletteOpen, close: closePalette },
    commandApi: { commands: filteredCommands, recentIds, execute },
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

function ChatOnlyBody({
  mode,
  drawerOpen,
  closeDrawer,
  projectRoot,
}: ChatOnlyBodyProps): React.ReactElement {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden" data-testid="chat-only-body">
      <ChatHistorySidebar mode={mode} />
      <div className="relative flex-1 flex flex-col min-h-0">
        {mode === 'hidden' && <ChatOnlySessionDrawer open={drawerOpen} onClose={closeDrawer} />}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div
            className="flex w-full min-h-0 flex-1 flex-col pl-2 pr-4 lg:pl-3 lg:pr-6"
            data-testid="chat-only-workspace-frame"
          >
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
  paletteOpen,
  closePalette,
  commands,
  recentIds,
  execute,
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
