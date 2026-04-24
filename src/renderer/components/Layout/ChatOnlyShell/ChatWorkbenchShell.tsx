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

function ShellOverlays({ diffOverlayOpen, closeDiffOverlay, paletteOpen, closePalette, commands, recentIds, execute }: ShellOverlaysProps): React.ReactElement {
  return (
    <>
      <ChatOnlyDiffOverlay open={diffOverlayOpen} onClose={closeDiffOverlay} />
      <ChatOnlySettingsOverlay />
      <KeyboardShortcutCheatSheet />
      <CommandPalette isOpen={paletteOpen} onClose={closePalette} commands={commands} recentIds={recentIds} onExecute={execute} />
    </>
  );
}

export function ChatWorkbenchShell({ projectRoot, terminal, diffOverlayOpen, openDiffOverlay, closeDiffOverlay, toggleDrawer, paletteOpen, closePalette, commands, recentIds, execute }: ChatWorkbenchShellProps): React.ReactElement {
  const { mode, cycleMode } = useChatSidebarMode();
  return (
    <div data-layout="app" className="flex h-screen w-screen flex-col overflow-hidden bg-surface-base"
      style={{ backgroundImage: 'var(--glass-dim, none), var(--bg-glows, none), var(--bg-wash, none)' }}
      data-testid="chat-workbench-shell"
    >
      <ChatOnlyTitleBar onToggleDrawer={toggleDrawer} onCycleSidebarMode={cycleMode} sidebarMode={mode} />
      <ChatWorkbenchBody projectRoot={projectRoot} terminal={terminal} />
      <ChatOnlyStatusBar projectRoot={projectRoot} onOpenDiffOverlay={openDiffOverlay} />
      <ShellOverlays diffOverlayOpen={diffOverlayOpen} closeDiffOverlay={closeDiffOverlay}
        paletteOpen={paletteOpen} closePalette={closePalette} commands={commands} recentIds={recentIds} execute={execute}
      />
    </div>
  );
}
