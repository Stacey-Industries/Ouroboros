/**
 * useInnerAppEffects — orchestrates all side-effect hooks for InnerApp.
 *
 * Calls useUpdater, useErrorCapture, command registrations,
 * and event listener hooks in one place.
 */

import { useEffect } from 'react';

import type { Command } from '../components/CommandPalette/types';
import { useToastContext } from '../contexts/ToastContext';
import type { AppTheme, WorkspaceLayout } from '../types/electron';
import { useDomEventListeners,useMenuEvents } from './useAppEventListeners';
import { useKeyboardShortcuts } from './useAppKeyboardShortcuts';
import {
  useAgentChatCommands,
  useAgentTemplateCommands,
  useAwesomeRefCommand,
  useLayoutCommands,
  useMultiSessionCommand,
  usePromptDiffCommand,
  useUsageDashboardCommand,
} from './useCommandRegistrations';
import { useErrorCapture } from './useErrorCapture';
import { useUpdater } from './useUpdater';

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

function useStartupWarningToast(): void {
  const { toast } = useToastContext();
  useEffect(() => {
    return window.electronAPI.app.onStartupWarning(({ message }) => {
      toast(message, 'warning');
    });
  }, [toast]);
}

function usePromptDiffToast(): void {
  const { toast } = useToastContext();
  useEffect(() => {
    if (!window.electronAPI?.ecosystem?.onPromptDiff) return undefined;
    return window.electronAPI.ecosystem.onPromptDiff(() => {
      toast('Claude Code system prompt changed since last release.', 'info', {
        duration: 8000,
        action: {
          label: 'View diff',
          onClick: () => {
            window.dispatchEvent(
              new CustomEvent('agent-ide:open-settings', { detail: 'promptDiff' }),
            );
          },
        },
      });
    });
  }, [toast]);
}

function useRegisteredCommands(deps: InnerAppEffectsDeps): void {
  useAgentChatCommands(deps.projectRoot, deps.registerCommand);
  useAgentTemplateCommands(deps.projectRoot, deps.registerCommand);
  useLayoutCommands({
    workspaceLayouts: deps.workspaceLayouts,
    activeLayoutName: deps.activeLayoutName,
    registerCommand: deps.registerCommand,
    handleSelectLayout: deps.handleSelectLayout,
    handleSaveLayout: deps.handleSaveLayout,
  });
  useMultiSessionCommand(deps.registerCommand);
  useUsageDashboardCommand(deps.registerCommand);
  usePromptDiffCommand(deps.registerCommand);
  useAwesomeRefCommand(deps.registerCommand);
}

export function useInnerAppEffects(deps: InnerAppEffectsDeps): void {
  useUpdater();
  useErrorCapture();
  useStartupWarningToast();
  usePromptDiffToast();

  useRegisteredCommands(deps);

  useMenuEvents({
    handleProjectChange: deps.handleProjectChange,
    openPalette: deps.openPalette,
    spawnSession: deps.spawnSession,
  });
  useDomEventListeners({
    projectRoot: deps.projectRoot,
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
