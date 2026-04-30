import React, { useCallback, useEffect, useState } from 'react';

import { hideSplashScreen, initKeyboardListeners, isNative } from '../web/capacitor';
import type { Command } from './components/CommandPalette/types';
import { useCommandPalette } from './components/CommandPalette/useCommandPalette';
import { useCommandRegistry } from './components/CommandPalette/useCommandRegistry';
import { ChatOnlyShellWrapper } from './components/Layout/ChatOnlyShell';
import type { InnerAppLayoutProps } from './components/Layout/InnerAppLayout';
import { InnerAppLayout } from './components/Layout/InnerAppLayout';
import { useProject } from './contexts/ProjectContext';
import { useChatWindowMode } from './hooks/useChatWindowMode';
import { useExtensionThemes } from './hooks/useExtensionThemes';
import { useFirstLaunchAuth } from './hooks/useFirstLaunchAuth';
import { useImmersiveChatFlag } from './hooks/useImmersiveChatFlag';
import { useInnerAppEffects } from './hooks/useInnerAppEffects';
import { useLspDiagnosticsSync } from './hooks/useLspDiagnosticsSync';
import { useNativeStatusBar } from './hooks/useNativeStatusBar';
import { usePermalinkBridge } from './hooks/usePermalinkBridge';
import { useProjectManagement } from './hooks/useProjectManagement';
import { useTerminalSessions } from './hooks/useTerminalSessions';
import { useTheme } from './hooks/useTheme';
import { useWorkspaceLayouts } from './hooks/useWorkspaceLayouts';

export interface InnerAppProps {
  initialRecentProjects: string[];
  keybindings: Record<string, string>;
  persistTerminalSessions: boolean;
}

interface InnerAppUiState {
  filePickerOpen: boolean;
  setFilePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  symbolSearchOpen: boolean;
  setSymbolSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  perfOverlayVisible: boolean;
  setPerfOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

interface InnerAppLifecycleArgs {
  ctx: ReturnType<typeof useProject>;
  layouts: ReturnType<typeof useWorkspaceLayouts>;
  palette: ReturnType<typeof useCommandPalette>;
  project: ReturnType<typeof useProjectManagement>;
  registerCommand: ReturnType<typeof useCommandRegistry>['registerCommand'];
  setTheme: ReturnType<typeof useTheme>['setTheme'];
  setMaterialVariant: ReturnType<typeof useTheme>['setMaterialVariant'];
  terminal: ReturnType<typeof useTerminalSessions>;
  uiState: InnerAppUiState;
  keybindings: Record<string, string>;
}

interface InnerAppLayoutArgs {
  ctx: ReturnType<typeof useProject>;
  project: ReturnType<typeof useProjectManagement>;
  keybindings: Record<string, string>;
  layouts: ReturnType<typeof useWorkspaceLayouts>;
  terminal: ReturnType<typeof useTerminalSessions>;
  palette: ReturnType<typeof useCommandPalette>;
  commands: ReturnType<typeof useCommandRegistry>['commands'];
  recentIds: ReturnType<typeof useCommandRegistry>['recentIds'];
  handleExecute: (command: Command) => Promise<void>;
  uiState: InnerAppUiState;
  persistTerminalSessions: boolean;
}

function useNativeBootstrap(): void {
  useEffect(() => {
    if (!isNative()) return;
    void hideSplashScreen();
    let cleanup: (() => void) | null = null;
    void initKeyboardListeners().then((fn: () => void) => {
      cleanup = fn;
    });
    return () => {
      cleanup?.();
    };
  }, []);
}

function useCustomCSS(css: string): void {
  React.useEffect(() => {
    const styleId = 'custom-css';
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = styleId;
      document.head.appendChild(el);
    }
    el.textContent = css;
  }, [css]);
}

function useInnerAppUiState(): InnerAppUiState {
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [perfOverlayVisible, setPerfOverlayVisible] = useState(false);

  return {
    filePickerOpen,
    setFilePickerOpen,
    symbolSearchOpen,
    setSymbolSearchOpen,
    perfOverlayVisible,
    setPerfOverlayVisible,
  };
}

function useCommandExecution(
  execute: ReturnType<typeof useCommandRegistry>['execute'],
): (command: Command) => Promise<void> {
  return useCallback(
    async (command: Command): Promise<void> => {
      await execute(command);
    },
    [execute],
  );
}

function buildTerminalControl(
  terminal: ReturnType<typeof useTerminalSessions>,
): InnerAppLayoutProps['terminalControl'] {
  return {
    sessions: terminal.sessions,
    activeSessionId: terminal.activeSessionId,
    onActivate: terminal.setActiveSessionId,
    onClose: terminal.handleTerminalClose,
    onNew: () => void terminal.spawnSession(),
    onNewClaude: (providerModel?: string) =>
      void terminal.spawnClaudeSession(undefined, providerModel ? { providerModel } : undefined),
    onNewCodex: (model?: string) =>
      void terminal.spawnCodexSession(
        undefined,
        model ? { model, cliOverrides: { model } } : undefined,
      ),
    onReorder: terminal.handleTerminalReorder,
    focusOrCreate: terminal.focusOrCreateSession,
    onSpawnClaude: terminal.spawnClaudeSession,
    onSpawnCodex: terminal.spawnCodexSession,
  };
}

function buildInnerAppLayoutProps({
  ctx,
  project,
  keybindings,
  layouts,
  terminal,
  palette,
  commands,
  recentIds,
  handleExecute,
  uiState,
  persistTerminalSessions,
}: InnerAppLayoutArgs): InnerAppLayoutProps {
  return {
    projectRoot: ctx.projectRoot,
    projectRoots: ctx.projectRoots,
    addProjectRoot: ctx.addProjectRoot,
    recentProjects: project.recentProjects,
    setRecentProjects: project.setRecentProjects,
    handleProjectChange: project.handleProjectChange,
    keybindings,
    ...layouts,
    terminalControl: buildTerminalControl(terminal),
    ...terminal,
    paletteOpen: palette.isOpen,
    closePalette: palette.close,
    commands,
    recentIds,
    handleExecute,
    filePickerOpen: uiState.filePickerOpen,
    setFilePickerOpen: uiState.setFilePickerOpen,
    symbolSearchOpen: uiState.symbolSearchOpen,
    setSymbolSearchOpen: uiState.setSymbolSearchOpen,
    perfOverlayVisible: uiState.perfOverlayVisible,
    persistTerminalSessions,
  };
}

function useInnerAppLifecycle({
  ctx,
  layouts,
  palette,
  project,
  registerCommand,
  setTheme,
  setMaterialVariant,
  terminal,
  uiState,
  keybindings,
}: InnerAppLifecycleArgs): void {
  useInnerAppEffects({
    projectRoot: ctx.projectRoot,
    registerCommand,
    ...layouts,
    setTheme: (id) => void setTheme(id),
    setMaterialVariant,
    handleProjectChange: project.handleProjectChange,
    openPalette: palette.open,
    spawnSession: terminal.spawnSession,
    spawnClaudeSession: terminal.spawnClaudeSession,
    ...uiState,
    keybindings,
  });
}

function useInnerAppHooks(initialRecentProjects: string[], keybindings: Record<string, string>) {
  const { setTheme, setMaterialVariant } = useTheme();
  const ctx = useProject();
  const palette = useCommandPalette();
  const { commands, recentIds, execute, registerCommand } = useCommandRegistry();
  const layouts = useWorkspaceLayouts();
  const terminal = useTerminalSessions();
  const project = useProjectManagement(initialRecentProjects, ctx.setProjectRoot);
  const uiState = useInnerAppUiState();
  const handleExecute = useCommandExecution(execute);
  useNativeStatusBar();
  useExtensionThemes();
  useLspDiagnosticsSync();
  useFirstLaunchAuth();
  usePermalinkBridge();
  useInnerAppLifecycle({
    ctx,
    layouts,
    palette,
    project,
    registerCommand,
    setTheme,
    setMaterialVariant,
    terminal,
    uiState,
    keybindings,
  });
  return { ctx, palette, commands, recentIds, layouts, terminal, project, uiState, handleExecute };
}

function InnerApp({
  initialRecentProjects,
  keybindings,
  persistTerminalSessions,
}: InnerAppProps): React.ReactElement {
  const hooks = useInnerAppHooks(initialRecentProjects, keybindings);
  const { isChatWindow } = useChatWindowMode();
  const immersiveFlag = useImmersiveChatFlag();
  // Mobile web is locked to the chat workbench shell — the IDE shell is unusable
  // on phone-sized viewports (no resize handles, panels squish each other).
  const isMobileWeb =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('web-mode') &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 768px)').matches;
  const isImmersive = isChatWindow || immersiveFlag || isMobileWeb;

  if (isImmersive) return <ChatOnlyShellWrapper terminal={hooks.terminal} />;

  return (
    <InnerAppLayout
      {...buildInnerAppLayoutProps({
        ctx: hooks.ctx,
        project: hooks.project,
        keybindings,
        layouts: hooks.layouts,
        terminal: hooks.terminal,
        palette: hooks.palette,
        commands: hooks.commands,
        recentIds: hooks.recentIds,
        handleExecute: hooks.handleExecute,
        uiState: hooks.uiState,
        persistTerminalSessions,
      })}
    />
  );
}

export function useAppBootstrap(customCSS: string): void {
  useCustomCSS(customCSS);
  useNativeBootstrap();
}

export { InnerApp };
