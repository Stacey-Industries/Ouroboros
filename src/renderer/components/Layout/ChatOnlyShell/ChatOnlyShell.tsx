/**
 * ChatOnlyShell — Immersive workbench chat interface (Wave 42+).
 *
 * Wave 59 Phase A: retired the `chatWorkbench` feature flag. The workbench
 * shell IS the chat shell. `ChatWorkbenchShell` is always mounted when
 * `immersiveChat` is true; the legacy plain-shell branch is removed.
 *
 * IdeToolBridge not mounted — IDE-context tool queries return empty in
 * chat-only mode (Wave 42 design).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { TOGGLE_SESSION_DRAWER_EVENT } from '../../../hooks/appEventNames';
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { AgentChatStoreContext, createAgentChatStore } from '../../AgentChat/agentChatStore';
import type { Command } from '../../CommandPalette/types';
import { useCommandPalette } from '../../CommandPalette/useCommandPalette';
import { useCommandRegistry } from '../../CommandPalette/useCommandRegistry';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { filterCommandsForChatShell } from './chatOnlyCommandFilter';
import { ChatWorkbenchShell } from './ChatWorkbenchShell';

// ── DiffSummary ───────────────────────────────────────────────────────────────

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

// ── ShellState ────────────────────────────────────────────────────────────────

interface ShellState {
  diffOverlayOpen: boolean;
  toggleDrawer: () => void;
  openDiffOverlay: () => void;
  closeDiffOverlay: () => void;
}

function useShellState(diff: DiffSummary): ShellState {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [diffOverlayOpen, setDiffOverlayOpen] = useState(false);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev);
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

  // Legacy drawer toggle event — kept for external compatibility.
  useEffect(() => {
    const handler = (): void => {
      toggleDrawer();
    };
    window.addEventListener(TOGGLE_SESSION_DRAWER_EVENT, handler);
    return () => {
      window.removeEventListener(TOGGLE_SESSION_DRAWER_EVENT, handler);
    };
  }, [toggleDrawer]);

  void drawerOpen; // retained for event compat; workbench has its own drawer state

  return { diffOverlayOpen, toggleDrawer, openDiffOverlay, closeDiffOverlay };
}

// ── Diff-review event wiring ──────────────────────────────────────────────────

interface DiffReviewOpenDetail {
  sessionId?: string;
  snapshotHash?: string;
  projectRoot?: string;
  filePaths?: string[];
}

function useDiffReviewEvents(openDiffOverlay: () => void): void {
  const diffReview = useDiffReview();

  useEffect(() => {
    const handleOpen = (event: Event): void => {
      const detail = (event as CustomEvent<DiffReviewOpenDetail>).detail;
      if (!detail?.sessionId || !detail.snapshotHash || !detail.projectRoot) return;
      diffReview.openReview(
        detail.sessionId,
        detail.snapshotHash,
        detail.projectRoot,
        detail.filePaths,
      );
      // Workbench handles diff review inline — do not open the standalone overlay.
    };
    window.addEventListener('agent-ide:open-diff-review', handleOpen);
    return () => {
      window.removeEventListener('agent-ide:open-diff-review', handleOpen);
    };
  }, [diffReview, openDiffOverlay]);
}

// ── ChatOnlyShell ─────────────────────────────────────────────────────────────

export interface ChatOnlyShellProps {
  terminal?: UseTerminalSessionsReturn;
}

interface WorkbenchArgs {
  terminal?: UseTerminalSessionsReturn;
  projectRoot: string | null;
  shell: ShellState;
  palette: { open: boolean; close: () => void };
  commandApi: { commands: Command[]; recentIds: string[]; execute: (c: Command) => Promise<void> };
}

function renderWorkbench(args: WorkbenchArgs): React.ReactElement {
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

export function ChatOnlyShell({ terminal }: ChatOnlyShellProps = {}): React.ReactElement {
  const { projectRoot } = useProject();
  const diff = useDiffSummary();
  const shell = useShellState(diff);
  useDiffReviewEvents(shell.openDiffOverlay);

  // Wave 43 hotfix: lift AgentChat store above the title bar so controls
  // outside AgentChatWorkspace share the same model/permission state.
  const store = useRef(createAgentChatStore()).current;

  const { isOpen: paletteOpen, close: closePalette } = useCommandPalette();
  const { commands, recentIds, execute } = useCommandRegistry();
  const filteredCommands = useMemo(() => filterCommandsForChatShell(commands), [commands]);

  return (
    <AgentChatStoreContext.Provider value={store}>
      {renderWorkbench({
        terminal,
        projectRoot,
        shell,
        palette: { open: paletteOpen, close: closePalette },
        commandApi: { commands: filteredCommands, recentIds, execute },
      })}
    </AgentChatStoreContext.Provider>
  );
}
