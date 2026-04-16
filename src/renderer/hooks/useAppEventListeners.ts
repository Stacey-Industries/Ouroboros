/**
 * useAppEventListeners — registers Electron menu events, DOM custom events,
 * and keyboard shortcuts for the main app.
 *
 * Extracted from InnerApp to reduce complexity.
 */

import { useEffect, useRef } from 'react';

import { clearTerminal } from '../components/Terminal/terminalRegistry';
import { useToastContext } from '../contexts/ToastContext';
import type { AppTheme, WorkspaceLayout } from '../types/electron';
import {
  createOpenLatestAgentChatDetailsHandler,
  createResumeLatestAgentChatThreadHandler,
  handleAgentChatStatusEvent,
  type ToastFn,
} from './agentChatUiHelpers';
import {
  OPEN_LATEST_AGENT_CHAT_DETAILS_EVENT,
  OPEN_SETTINGS_PANEL_EVENT,
  OPEN_USAGE_PANEL_EVENT,
  RESUME_LATEST_AGENT_CHAT_THREAD_EVENT,
  TOGGLE_SIDE_CHAT_EVENT,
} from './appEventNames';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export interface AppEventDeps {
  projectRoot: string | null;
  setTheme: (id: AppTheme) => void;
  handleProjectChange: (path: string) => Promise<void>;
  openPalette: () => void;
  spawnSession: (cwd?: string) => Promise<void>;
  spawnClaudeSession: (
    cwd?: string,
    opts?: { initialPrompt?: string; cliOverrides?: Record<string, unknown>; label?: string },
  ) => Promise<void>;
  setFilePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSymbolSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPerfOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
  keybindings: Record<string, string>;
  workspaceLayouts: WorkspaceLayout[];
  handleSelectLayout: (layout: WorkspaceLayout) => void;
}

type WindowEventEntry = [string, EventListener];

interface SpawnClaudeTemplateDetail {
  prompt?: string;
  label?: string;
  cliOverrides?: Record<string, unknown>;
}

interface DiffReviewDetail {
  sessionId?: string;
  snapshotHash?: string;
  projectRoot?: string;
  filePaths?: string[];
}

function emitUsagePanel(): void {
  window.dispatchEvent(new CustomEvent(OPEN_USAGE_PANEL_EVENT));
}

function emitSettingsPanel(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_PANEL_EVENT));
}

function registerWindowEvents(events: WindowEventEntry[]): () => void {
  events.forEach(([name, handler]) => window.addEventListener(name, handler));
  return () => events.forEach(([name, handler]) => window.removeEventListener(name, handler));
}

async function selectProjectFolder(
  handleProjectChange: AppEventDeps['handleProjectChange'],
): Promise<void> {
  if (!hasElectronAPI()) return;
  const result = await window.electronAPI.files.selectFolder();
  if (!result.cancelled && result.path) {
    await handleProjectChange(result.path);
  }
}

function createBooleanOpener(
  setter: React.Dispatch<React.SetStateAction<boolean>>,
): EventListener {
  return () => setter(true);
}

function createThemeHandler(setTheme: AppEventDeps['setTheme']): EventListener {
  return (event) => {
    void setTheme((event as CustomEvent<AppTheme>).detail);
  };
}

function createFolderHandler(
  handleProjectChange: AppEventDeps['handleProjectChange'],
): EventListener {
  return () => {
    void selectProjectFolder(handleProjectChange);
  };
}

function createNewTerminalHandler(
  spawnSession: AppEventDeps['spawnSession'],
): EventListener {
  return (event) => {
    const detail = (event as CustomEvent<{ cwd?: string }>).detail;
    void spawnSession(detail?.cwd);
  };
}

function createDiffReviewHandler(): EventListener {
  return (event) => {
    const detail = (event as CustomEvent<DiffReviewDetail>).detail;
    if (detail?.sessionId && detail?.snapshotHash && detail?.projectRoot) {
      window.dispatchEvent(new CustomEvent('agent-ide:diff-review-open', { detail }));
    }
  };
}

function createClaudeTemplateHandler(
  spawnClaudeSession: AppEventDeps['spawnClaudeSession'],
): EventListener {
  return (event) => {
    const detail = (event as CustomEvent<SpawnClaudeTemplateDetail>).detail;
    if (!detail?.prompt) return;
    void spawnClaudeSession(undefined, {
      initialPrompt: detail.prompt,
      label: detail.label,
      cliOverrides: detail.cliOverrides,
    });
  };
}

function createDomEventEntries(args: {
  projectRoot: AppEventDeps['projectRoot'];
  setTheme: AppEventDeps['setTheme'];
  handleProjectChange: AppEventDeps['handleProjectChange'];
  spawnSession: AppEventDeps['spawnSession'];
  spawnClaudeSession: AppEventDeps['spawnClaudeSession'];
  setFilePickerOpen: AppEventDeps['setFilePickerOpen'];
  setSymbolSearchOpen: AppEventDeps['setSymbolSearchOpen'];
  toast: ToastFn;
}): WindowEventEntry[] {
  const {
    projectRoot,
    setTheme,
    handleProjectChange,
    spawnSession,
    spawnClaudeSession,
    setFilePickerOpen,
    setSymbolSearchOpen,
    toast,
  } = args;

  return [
    ['agent-ide:set-theme', createThemeHandler(setTheme)],
    ['agent-ide:open-usage', emitUsagePanel],
    ['agent-ide:open-folder', createFolderHandler(handleProjectChange)],
    ['agent-ide:new-terminal', createNewTerminalHandler(spawnSession)],
    ['agent-ide:new-claude-terminal', () => { void spawnClaudeSession(); }],
    ['agent-ide:clear-active-terminal', () => clearTerminal()],
    ['agent-ide:open-file-picker', createBooleanOpener(setFilePickerOpen)],
    ['agent-ide:open-symbol-search', createBooleanOpener(setSymbolSearchOpen)],
    ['agent-ide:open-diff-review', createDiffReviewHandler()],
    ['agent-ide:spawn-claude-template', createClaudeTemplateHandler(spawnClaudeSession)],
    [RESUME_LATEST_AGENT_CHAT_THREAD_EVENT, createResumeLatestAgentChatThreadHandler({ projectRoot, toast })],
    [OPEN_LATEST_AGENT_CHAT_DETAILS_EVENT, createOpenLatestAgentChatDetailsHandler({ projectRoot, toast })],
  ];
}

export function useMenuEvents(
  deps: Pick<AppEventDeps, 'handleProjectChange' | 'openPalette' | 'spawnSession'>,
): void {
  const { handleProjectChange, openPalette, spawnSession } = deps;

  useEffect(() => {
    if (!hasElectronAPI()) return;
    return window.electronAPI.app.onMenuEvent((event) => {
      if (event === 'menu:open-folder') {
        void selectProjectFolder(handleProjectChange);
      } else if (event === 'menu:command-palette') {
        openPalette();
      } else if (event === 'menu:new-terminal') {
        void spawnSession();
      } else if (event === 'menu:settings') {
        emitSettingsPanel();
      } else if (event === 'menu:toggle-side-chat') {
        window.dispatchEvent(new CustomEvent(TOGGLE_SIDE_CHAT_EVENT));
      }
    });
  }, [handleProjectChange, openPalette, spawnSession]);
}

export function useDomEventListeners(deps: AppEventDeps): void {
  const { toast } = useToastContext();
  const seenAgentChatStatusesRef = useRef<Set<string>>(new Set());
  const {
    projectRoot,
    setTheme,
    handleProjectChange,
    spawnSession,
    spawnClaudeSession,
    setFilePickerOpen,
    setSymbolSearchOpen,
  } = deps;

  useEffect(() => {
    return registerWindowEvents(createDomEventEntries({
      projectRoot,
      setTheme,
      handleProjectChange,
      spawnSession,
      spawnClaudeSession,
      setFilePickerOpen,
      setSymbolSearchOpen,
      toast,
    }));
  }, [projectRoot, setTheme, handleProjectChange, spawnSession, spawnClaudeSession, setFilePickerOpen, setSymbolSearchOpen, toast]);

  useEffect(() => {
    if (!hasElectronAPI()) {
      return undefined;
    }

    return window.electronAPI.agentChat.onStatusChange((status) => {
      handleAgentChatStatusEvent({
        seenStatuses: seenAgentChatStatusesRef.current,
        status,
        toast,
      });
    });
  }, [toast]);
}
