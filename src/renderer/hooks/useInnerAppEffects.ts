/**
 * useInnerAppEffects — orchestrates all side-effect hooks for InnerApp.
 *
 * Calls useUpdater, useErrorCapture, command registrations,
 * and event listener hooks in one place.
 */

import { useUpdater } from './useUpdater';
import { useErrorCapture } from './useErrorCapture';
import { useAgentTemplateCommands, useLayoutCommands, useMultiSessionCommand } from './useCommandRegistrations';
import { useMenuEvents, useDomEventListeners, useKeyboardShortcuts } from './useAppEventListeners';
import type { AppTheme, WorkspaceLayout } from '../types/electron';
import type { Command } from '../components/CommandPalette/types';

export interface InnerAppEffectsDeps {
  projectRoot: string | null;
  registerCommand: (cmd: Command) => void;
  workspaceLayouts: WorkspaceLayout[];
  activeLayoutName: string;
  handleSelectLayout: (layout: WorkspaceLayout) => void;
  handleSaveLayout: (name: string) => void;
  handleProjectChange: (path: string) => Promise<void>;
  openPalette: () => void;
  spawnSession: (cwd?: string) => Promise<void>;
  spawnClaudeSession: (
    cwd?: string,
    opts?: { initialPrompt?: string; cliOverrides?: Record<string, unknown>; label?: string },
  ) => Promise<void>;
  setTheme: (id: AppTheme) => void;
  setFilePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSymbolSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPerfOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
  keybindings: Record<string, string>;
}

export function useInnerAppEffects(deps: InnerAppEffectsDeps): void {
  useUpdater();
  useErrorCapture();

  useAgentTemplateCommands(deps.projectRoot, deps.registerCommand);
  useLayoutCommands(
    deps.workspaceLayouts, deps.activeLayoutName,
    deps.registerCommand, deps.handleSelectLayout, deps.handleSaveLayout,
  );
  useMultiSessionCommand(deps.registerCommand);

  useMenuEvents({
    handleProjectChange: deps.handleProjectChange,
    openPalette: deps.openPalette,
    spawnSession: deps.spawnSession,
  });
  useDomEventListeners({
    setTheme: deps.setTheme,
    handleProjectChange: deps.handleProjectChange,
    openPalette: deps.openPalette,
    spawnSession: deps.spawnSession,
    spawnClaudeSession: deps.spawnClaudeSession,
    setFilePickerOpen: deps.setFilePickerOpen,
    setSymbolSearchOpen: deps.setSymbolSearchOpen,
    setPerfOverlayVisible: deps.setPerfOverlayVisible,
    keybindings: deps.keybindings,
    workspaceLayouts: deps.workspaceLayouts,
    handleSelectLayout: deps.handleSelectLayout,
  });
  useKeyboardShortcuts({
    keybindings: deps.keybindings,
    setFilePickerOpen: deps.setFilePickerOpen,
    setSymbolSearchOpen: deps.setSymbolSearchOpen,
    setPerfOverlayVisible: deps.setPerfOverlayVisible,
    spawnClaudeSession: deps.spawnClaudeSession,
    workspaceLayouts: deps.workspaceLayouts,
    handleSelectLayout: deps.handleSelectLayout,
  });
}
