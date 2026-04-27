import React from 'react';

import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { CommandPalette } from '../../CommandPalette/CommandPalette';
import type { Command } from '../../CommandPalette/types';
import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';
import { ChatOnlySettingsOverlay } from './ChatOnlySettingsOverlay';
import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';
import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';
import { ChatWorkbenchBody } from './ChatWorkbenchBody';
import { KeyboardShortcutCheatSheet } from './KeyboardShortcutCheatSheet';
import { useChatSidebarMode } from './useChatSidebarMode';
import { useChatWorkbenchLayout } from './useChatWorkbenchLayout';

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

interface ShellOverlaysProps {
  diffOverlayOpen: boolean;
  closeDiffOverlay: () => void;
  paletteOpen: boolean;
  closePalette: () => void;
  commands: Command[];
  recentIds: string[];
  execute: (command: Command) => Promise<void>;
}

function ShellOverlays({
  diffOverlayOpen,
  closeDiffOverlay,
  paletteOpen,
  closePalette,
  commands,
  recentIds,
  execute,
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
    </>
  );
}

type ShellLayout = ReturnType<typeof useChatWorkbenchLayout>;

interface ShellChromeProps {
  cycleMode: () => void;
  layout: ShellLayout;
  mode: ReturnType<typeof useChatSidebarMode>['mode'];
  openDiffOverlay: () => void;
  projectRoot: string | null;
  terminal?: UseTerminalSessionsReturn;
  toggleDrawer: () => void;
}

function ShellChrome({
  cycleMode,
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
      />
      <ChatWorkbenchBody projectRoot={projectRoot} terminal={terminal} />
      <ChatOnlyStatusBar projectRoot={projectRoot} onOpenDiffOverlay={openDiffOverlay} />
    </>
  );
}

const SHELL_BG = 'var(--glass-dim, none), var(--bg-glows, none), var(--bg-wash, none)';

export function ChatWorkbenchShell(props: ChatWorkbenchShellProps): React.ReactElement {
  const { mode, cycleMode } = useChatSidebarMode();
  const layout = useChatWorkbenchLayout();
  const { closeDiffOverlay, closePalette, commands, diffOverlayOpen } = props;
  const { execute, openDiffOverlay, paletteOpen, projectRoot, recentIds } = props;
  const { terminal, toggleDrawer } = props;
  return (
    <div
      data-layout="app"
      className="flex h-screen w-screen flex-col overflow-hidden bg-surface-base"
      style={{ backgroundImage: SHELL_BG }}
      data-testid="chat-workbench-shell"
    >
      <ShellChrome
        cycleMode={cycleMode}
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
        paletteOpen={paletteOpen}
        closePalette={closePalette}
        commands={commands}
        recentIds={recentIds}
        execute={execute}
      />
    </div>
  );
}
