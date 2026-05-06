import React, { useCallback, useEffect, useState } from 'react';

import {
  OPEN_MULTI_SESSION_EVENT,
  WORKBENCH_OPEN_CHAT_SEARCH_EVENT,
} from '../../../hooks/appEventNames';
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { CommandPalette } from '../../CommandPalette/CommandPalette';
import type { Command } from '../../CommandPalette/types';
import { MultiSessionLauncher } from '../../MultiSession';
import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';
import { ChatOnlySettingsOverlay } from './ChatOnlySettingsOverlay';
import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';
import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';
import { ChatSearchOverlay } from './ChatSearchOverlay';
import { ChatWorkbenchBody } from './ChatWorkbenchBody';
import { KeyboardShortcutCheatSheet } from './KeyboardShortcutCheatSheet';
import { useChatSidebarMode } from './useChatSidebarMode';
import { useChatWorkbenchLayout } from './useChatWorkbenchLayout';
import { useTerminalDockState } from './useTerminalDockState';
import { useWorkbenchMenuEvents } from './useWorkbenchMenuEvents';

interface ChatWorkbenchShellProps {
  projectRoot: string | null;
  terminal?: UseTerminalSessionsReturn;
  diffOverlayOpen: boolean;
  openDiffOverlay: () => void;
  closeDiffOverlay: () => void;
  toggleDrawer: () => void;
  paletteOpen: boolean;
  closePalette: () => void;
  commands: Command[];
  recentIds: string[];
  execute: (command: Command) => Promise<void>;
}

// ── MultiSession launcher overlay ─────────────────────────────────────────────

function useMultiSessionLauncherState(): {
  launcherOpen: boolean;
  closeLauncher: () => void;
} {
  const [launcherOpen, setLauncherOpen] = useState(false);
  const closeLauncher = useCallback((): void => {
    setLauncherOpen(false);
  }, []);
  useEffect(() => {
    const handler = (): void => {
      setLauncherOpen(true);
    };
    window.addEventListener(OPEN_MULTI_SESSION_EVENT, handler);
    return () => window.removeEventListener(OPEN_MULTI_SESSION_EVENT, handler);
  }, []);
  return { launcherOpen, closeLauncher };
}

function MultiSessionOverlay({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-surface-overlay/60"
      data-testid="multi-session-overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Multi-Session Launch"
        className="h-[560px] w-[640px] overflow-hidden rounded-xl border border-border-semantic shadow-xl"
      >
        <MultiSessionLauncher onClose={onClose} onLaunched={onClose} />
      </div>
    </div>
  );
}

// ── Chat search overlay state ─────────────────────────────────────────────────

function useChatSearchState(projectRoot: string | null): {
  searchOpen: boolean;
  closeSearch: () => void;
  projectRoot: string | null;
} {
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback((): void => {
    setSearchOpen(false);
  }, []);

  useEffect(() => {
    const handleEvent = (): void => {
      setSearchOpen(true);
    };
    window.addEventListener(WORKBENCH_OPEN_CHAT_SEARCH_EVENT, handleEvent);
    return () => window.removeEventListener(WORKBENCH_OPEN_CHAT_SEARCH_EVENT, handleEvent);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return { searchOpen, closeSearch, projectRoot };
}

// ── ShellOverlays ─────────────────────────────────────────────────────────────

interface ShellOverlaysProps {
  diffOverlayOpen: boolean;
  closeDiffOverlay: () => void;
  launcherOpen: boolean;
  closeLauncher: () => void;
  paletteOpen: boolean;
  closePalette: () => void;
  commands: Command[];
  recentIds: string[];
  execute: (command: Command) => Promise<void>;
  searchOpen: boolean;
  closeSearch: () => void;
  projectRoot: string | null;
}

function ShellOverlays({
  diffOverlayOpen,
  closeDiffOverlay,
  launcherOpen,
  closeLauncher,
  paletteOpen,
  closePalette,
  commands,
  recentIds,
  execute,
  searchOpen,
  closeSearch,
  projectRoot,
}: ShellOverlaysProps): React.ReactElement {
  return (
    <>
      <ChatOnlyDiffOverlay open={diffOverlayOpen} onClose={closeDiffOverlay} />
      <ChatOnlySettingsOverlay />
      <KeyboardShortcutCheatSheet />
      <CommandPalette
        isOpen={paletteOpen}
        onClose={closePalette}
        commands={commands}
        recentIds={recentIds}
        onExecute={execute}
      />
      {launcherOpen && <MultiSessionOverlay onClose={closeLauncher} />}
      {searchOpen && <ChatSearchOverlay projectRoot={projectRoot} onClose={closeSearch} />}
    </>
  );
}

// ── ShellChrome ───────────────────────────────────────────────────────────────

type ShellLayout = ReturnType<typeof useChatWorkbenchLayout>;
type ShellDock = ReturnType<typeof useTerminalDockState>;

interface ShellChromeProps {
  cycleMode: () => void;
  dock: ShellDock;
  layout: ShellLayout;
  mode: ReturnType<typeof useChatSidebarMode>['mode'];
  openDiffOverlay: () => void;
  projectRoot: string | null;
  terminal?: UseTerminalSessionsReturn;
  toggleDrawer: () => void;
}

function ShellChrome({
  cycleMode,
  dock,
  layout,
  mode,
  openDiffOverlay,
  projectRoot,
  terminal,
  toggleDrawer,
}: ShellChromeProps): React.ReactElement {
  return (
    <>
      <ChatOnlyTitleBar
        onToggleDrawer={toggleDrawer}
        onCycleSidebarMode={cycleMode}
        sidebarMode={mode}
        onToggleRail={layout.toggleRail}
        railOpen={layout.railOpen}
        onToggleTerminal={dock.toggleVisible}
        terminalOpen={dock.visible}
        onToggleRightPane={layout.toggleRightPane}
        rightPaneOpen={layout.rightPaneOpen}
      />
      <ChatWorkbenchBody
        dock={dock}
        layout={layout}
        projectRoot={projectRoot}
        terminal={terminal}
      />
      <ChatOnlyStatusBar projectRoot={projectRoot} onOpenDiffOverlay={openDiffOverlay} />
    </>
  );
}

// ── ChatWorkbenchShell ────────────────────────────────────────────────────────

const SHELL_BG = 'var(--glass-dim, none), var(--bg-glows, none), var(--bg-wash, none)';

function useShellState(props: ChatWorkbenchShellProps): {
  cycleMode: () => void;
  mode: ReturnType<typeof useChatSidebarMode>['mode'];
  layout: ReturnType<typeof useChatWorkbenchLayout>;
  dock: ReturnType<typeof useTerminalDockState>;
  launcherOpen: boolean;
  closeLauncher: () => void;
  searchOpen: boolean;
  closeSearch: () => void;
} {
  const { mode, cycleMode } = useChatSidebarMode();
  const layout = useChatWorkbenchLayout();
  const dock = useTerminalDockState();
  const { launcherOpen, closeLauncher } = useMultiSessionLauncherState();
  const { searchOpen, closeSearch } = useChatSearchState(props.projectRoot);
  // Wave 82 — wire workbench title-bar menu DOM events to existing handlers.
  useWorkbenchMenuEvents({ layout, dock });
  return { cycleMode, mode, layout, dock, launcherOpen, closeLauncher, searchOpen, closeSearch };
}

export function ChatWorkbenchShell(props: ChatWorkbenchShellProps): React.ReactElement {
  const { cycleMode, mode, layout, dock, launcherOpen, closeLauncher, searchOpen, closeSearch } =
    useShellState(props);
  const { closeDiffOverlay, closePalette, commands, diffOverlayOpen, execute } = props;
  const { openDiffOverlay, paletteOpen, projectRoot, recentIds, terminal, toggleDrawer } = props;
  return (
    <div
      data-layout="app"
      className="flex h-screen w-screen flex-col overflow-hidden bg-surface-base"
      style={{ backgroundImage: SHELL_BG }}
      data-testid="chat-workbench-shell"
    >
      <ShellChrome
        cycleMode={cycleMode}
        dock={dock}
        layout={layout}
        mode={mode}
        openDiffOverlay={openDiffOverlay}
        projectRoot={projectRoot}
        terminal={terminal}
        toggleDrawer={toggleDrawer}
      />
      <ShellOverlays
        diffOverlayOpen={diffOverlayOpen}
        closeDiffOverlay={closeDiffOverlay}
        launcherOpen={launcherOpen}
        closeLauncher={closeLauncher}
        paletteOpen={paletteOpen}
        closePalette={closePalette}
        commands={commands}
        recentIds={recentIds}
        execute={execute}
        searchOpen={searchOpen}
        closeSearch={closeSearch}
        projectRoot={projectRoot}
      />
    </div>
  );
}
