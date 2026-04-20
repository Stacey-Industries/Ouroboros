/**
 * App.tsx — Root application component.
 *
 * Delegates to extracted hooks and components:
 * - useTerminalSessions — terminal lifecycle
 * - useWorkspaceLayouts — layout persistence
 * - useAppEventListeners — menu/DOM/keyboard events
 * - useCommandRegistrations — command palette entries
 * - useProjectManagement — project switching
 * - InnerAppLayout — main render tree
 */

import React, { useCallback, useEffect, useState } from 'react';

import { hideSplashScreen, initKeyboardListeners, isNative } from '../web/capacitor';
import { ChangelogDrawer } from './components/Changelog/ChangelogDrawer';
import type { Command } from './components/CommandPalette/types';
import { useCommandPalette } from './components/CommandPalette/useCommandPalette';
import { useCommandRegistry } from './components/CommandPalette/useCommandRegistry';
import { WebFolderBrowser } from './components/FileBrowser';
import { ChatOnlyShellWrapper } from './components/Layout/ChatOnlyShell';
import type { InnerAppLayoutProps } from './components/Layout/InnerAppLayout';
import { InnerAppLayout } from './components/Layout/InnerAppLayout';
import { LoadingScreen } from './components/Layout/LoadingScreen';
import { FirstRunTourGate } from './components/Onboarding/FirstRunTour';
import { System2IndexProgress } from './components/System2IndexProgress';
import { AgentEventsProvider } from './contexts/AgentEventsContext';
import { ApprovalProvider } from './contexts/ApprovalContext';
import { FocusProvider } from './contexts/FocusContext';
import { ProjectProvider, useProject } from './contexts/ProjectContext';
import { ToastProvider } from './contexts/ToastContext';
import { useChatWindowMode } from './hooks/useChatWindowMode';
import { useConfig } from './hooks/useConfig';
import { useExtensionThemes } from './hooks/useExtensionThemes';
import { useFirstLaunchAuth } from './hooks/useFirstLaunchAuth';
import { useImmersiveChatFlag } from './hooks/useImmersiveChatFlag';
import { useInnerAppEffects } from './hooks/useInnerAppEffects';
import { useLspDiagnosticsSync } from './hooks/useLspDiagnosticsSync';
import { useNativeStatusBar } from './hooks/useNativeStatusBar';
import { usePermalinkBridge } from './hooks/usePermalinkBridge';
import { useProjectManagement } from './hooks/useProjectManagement';
import { useTerminalSessions } from './hooks/useTerminalSessions';
import { useTheme, useThemeRuntimeBootstrap } from './hooks/useTheme';
import { useTokenOverrides } from './hooks/useTokenOverrides';
import { useVisualViewportInsets } from './hooks/useVisualViewportInsets';
import { useWorkspaceLayouts } from './hooks/useWorkspaceLayouts';


// ─── useNativeBootstrap ───────────────────────────────────────
// Runs once after config is resolved. On native: hides the splash screen and
// starts the Capacitor Keyboard height listener. No-op on web.

function useNativeBootstrap(): void {
  useEffect(() => {
    if (!isNative()) return;
    void hideSplashScreen();
    let cleanup: (() => void) | null = null;
    void initKeyboardListeners().then((fn: () => void) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, []);
}

// ─── useCustomCSS ─────────────────────────────────────────────

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

// ─── InnerApp ─────────────────────────────────────────────────

interface InnerAppProps {
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

function useInnerAppLifecycle({
  ctx,
  layouts,
  palette,
  project,
  registerCommand,
  setTheme,
  terminal,
  uiState,
  keybindings,
}: InnerAppLifecycleArgs): void {
  useInnerAppEffects({
    projectRoot: ctx.projectRoot,
    registerCommand,
    ...layouts,
    setTheme: (id) => void setTheme(id),
    handleProjectChange: project.handleProjectChange,
    openPalette: palette.open,
    spawnSession: terminal.spawnSession,
    spawnClaudeSession: terminal.spawnClaudeSession,
    ...uiState,
    keybindings,
  });
}

function useCommandExecution(
  execute: ReturnType<typeof useCommandRegistry>['execute'],
): (command: Command) => Promise<void> {
  return useCallback(async (command: Command): Promise<void> => {
    await execute(command);
  }, [execute]);
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

function useInnerAppHooks(initialRecentProjects: string[], keybindings: Record<string, string>) {
  const { setTheme } = useTheme();
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
  useInnerAppLifecycle({ ctx, layouts, palette, project, registerCommand, setTheme, terminal, uiState, keybindings });
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
  const isImmersive = isChatWindow || immersiveFlag;

  // Chat-only shell preserves providers above this branch so toggling does not re-mount state.
  if (isImmersive) return <ChatOnlyShellWrapper />;

  return <InnerAppLayout {...buildInnerAppLayoutProps({
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
  />;
}

function buildTerminalControl(terminal: ReturnType<typeof useTerminalSessions>): InnerAppLayoutProps['terminalControl'] {
  return {
    sessions: terminal.sessions,
    activeSessionId: terminal.activeSessionId,
    onActivate: terminal.setActiveSessionId,
    onClose: terminal.handleTerminalClose,
    onNew: () => void terminal.spawnSession(),
    onNewClaude: (providerModel?: string) => void terminal.spawnClaudeSession(undefined, providerModel ? { providerModel } : undefined),
    onNewCodex: (model?: string) => void terminal.spawnCodexSession(undefined, model ? { model, cliOverrides: { model } } : undefined),
    onReorder: terminal.handleTerminalReorder,
    focusOrCreate: terminal.focusOrCreateSession,
    onSpawnClaude: terminal.spawnClaudeSession,
    onSpawnCodex: terminal.spawnCodexSession,
  };
}

// ─── ConfiguredApp ────────────────────────────────────────────

interface ConfiguredAppProps {
  initialRoot: string | null;
  initialRecents: string[];
  keybindings: Record<string, string>;
  customCSS: string;
  persistTerminalSessions: boolean;
}

function ConfiguredApp({
  initialRoot,
  initialRecents,
  keybindings,
  customCSS,
  persistTerminalSessions,
}: ConfiguredAppProps): React.ReactElement {
  useCustomCSS(customCSS);
  useNativeBootstrap();

  return (
    <ToastProvider>
      <FocusProvider>
        <AgentEventsProvider>
          <ApprovalProvider>
            <ProjectProvider initialRoot={initialRoot}>
              <InnerApp
                initialRecentProjects={initialRecents}
                keybindings={keybindings}
                persistTerminalSessions={persistTerminalSessions}
              />
            </ProjectProvider>
          </ApprovalProvider>
        </AgentEventsProvider>
      </FocusProvider>
      <WebFolderBrowser />
      <System2IndexProgress />
      <FirstRunTourGate />
      <ChangelogDrawer />
    </ToastProvider>
  );
}

// ─── Root App ─────────────────────────────────────────────────

export default function App(): React.ReactElement {
  const { config, isLoading: configLoading } = useConfig();
  useThemeRuntimeBootstrap(config);
  useTokenOverrides();
  useVisualViewportInsets();

  if (configLoading || !config) return <LoadingScreen />;

  const initialRoot: string | null = config.defaultProjectRoot || null;
  const initialRecents: string[] = Array.isArray(config.recentProjects)
    ? config.recentProjects
    : [];
  const keybindings: Record<string, string> =
    config.keybindings && typeof config.keybindings === 'object'
      ? config.keybindings
      : {};
  const customCSS: string =
    typeof config.customCSS === 'string' ? config.customCSS : '';
  const persistTerminalSessions: boolean = config.persistTerminalSessions === true;

  return (
    <ConfiguredApp
      initialRoot={initialRoot}
      initialRecents={initialRecents}
      keybindings={keybindings}
      customCSS={customCSS}
      persistTerminalSessions={persistTerminalSessions}
    />
  );
}
