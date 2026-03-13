/**
 * useAppEventListeners — registers Electron menu events, DOM custom events,
 * and keyboard shortcuts for the main app.
 *
 * Extracted from InnerApp to reduce complexity.
 */

import { useEffect } from 'react';
import { keyEventToString, KEYBINDING_ACTIONS } from '../components/Settings/keybindingsData';
import type { AppTheme, WorkspaceLayout } from '../types/electron';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export interface AppEventDeps {
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
type StaticKeyAction = Exclude<KeyAction, { type: 'layout'; index: number }>;
type KeyboardShortcutDeps = Pick<
  AppEventDeps,
  | 'keybindings'
  | 'setFilePickerOpen'
  | 'setSymbolSearchOpen'
  | 'setPerfOverlayVisible'
  | 'spawnClaudeSession'
  | 'workspaceLayouts'
  | 'handleSelectLayout'
>;

interface SpawnClaudeTemplateDetail {
  prompt?: string;
  label?: string;
  cliOverrides?: Record<string, unknown>;
}

interface DiffReviewDetail {
  sessionId?: string;
  snapshotHash?: string;
  projectRoot?: string;
}

interface ShortcutMatcher {
  action: StaticKeyAction;
  binding?: string;
  keybindingId?: string;
}

type KeyAction =
  | 'settings' | 'filePicker' | 'symbolSearch'
  | 'newWindow' | 'usage' | 'perfOverlay'
  | 'spawnClaude' | { type: 'layout'; index: number };

const STATIC_SHORTCUTS: ShortcutMatcher[] = [
  { action: 'settings', keybindingId: 'app:settings' },
  { action: 'filePicker', keybindingId: 'file:open-file' },
  { action: 'symbolSearch', binding: 'Ctrl+T' },
  { action: 'newWindow', binding: 'Ctrl+Shift+N' },
  { action: 'usage', binding: 'Ctrl+U' },
  { action: 'perfOverlay', binding: 'Ctrl+Shift+P' },
  { action: 'spawnClaude', binding: 'Ctrl+Shift+C' },
];

function emitUsagePanel(): void {
  window.dispatchEvent(new CustomEvent('agent-ide:open-usage-panel'));
}

function emitSettingsPanel(): void {
  window.dispatchEvent(new CustomEvent('agent-ide:open-settings-panel'));
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
  setTheme: AppEventDeps['setTheme'];
  handleProjectChange: AppEventDeps['handleProjectChange'];
  spawnSession: AppEventDeps['spawnSession'];
  spawnClaudeSession: AppEventDeps['spawnClaudeSession'];
  setFilePickerOpen: AppEventDeps['setFilePickerOpen'];
  setSymbolSearchOpen: AppEventDeps['setSymbolSearchOpen'];
}): WindowEventEntry[] {
  const {
    setTheme,
    handleProjectChange,
    spawnSession,
    spawnClaudeSession,
    setFilePickerOpen,
    setSymbolSearchOpen,
  } = args;

  return [
    ['agent-ide:set-theme', createThemeHandler(setTheme)],
    ['agent-ide:open-usage', emitUsagePanel],
    ['agent-ide:open-folder', createFolderHandler(handleProjectChange)],
    ['agent-ide:new-terminal', createNewTerminalHandler(spawnSession)],
    ['agent-ide:open-file-picker', createBooleanOpener(setFilePickerOpen)],
    ['agent-ide:open-symbol-search', createBooleanOpener(setSymbolSearchOpen)],
    ['agent-ide:open-diff-review', createDiffReviewHandler()],
    ['agent-ide:spawn-claude-template', createClaudeTemplateHandler(spawnClaudeSession)],
  ];
}

function getShortcut(
  actionId: string,
  keybindings: Record<string, string>,
): string {
  if (keybindings[actionId]) return keybindings[actionId];
  return KEYBINDING_ACTIONS.find((action) => action.id === actionId)?.defaultShortcut ?? '';
}

function matchStaticKeyAction(
  pressed: string,
  keybindings: Record<string, string>,
): StaticKeyAction | null {
  for (const shortcut of STATIC_SHORTCUTS) {
    const expected = shortcut.keybindingId
      ? getShortcut(shortcut.keybindingId, keybindings)
      : shortcut.binding;
    if (pressed === expected) {
      return shortcut.action;
    }
  }
  return null;
}

function matchLayoutKeyAction(
  pressed: string,
  workspaceLayouts: WorkspaceLayout[],
): KeyAction | null {
  const layoutMatch = /^Ctrl\+Alt\+([1-3])$/.exec(pressed);
  if (!layoutMatch) {
    return null;
  }

  const index = Number(layoutMatch[1]) - 1;
  return workspaceLayouts[index] ? { type: 'layout', index } : null;
}

function matchKeyAction(
  pressed: string,
  keybindings: Record<string, string>,
  workspaceLayouts: WorkspaceLayout[],
): KeyAction | null {
  return matchStaticKeyAction(pressed, keybindings) ?? matchLayoutKeyAction(pressed, workspaceLayouts);
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
      }
    });
  }, [handleProjectChange, openPalette, spawnSession]);
}

export function useDomEventListeners(deps: AppEventDeps): void {
  const {
    setTheme,
    handleProjectChange,
    spawnSession,
    spawnClaudeSession,
    setFilePickerOpen,
    setSymbolSearchOpen,
  } = deps;

  useEffect(() => {
    return registerWindowEvents(createDomEventEntries({
      setTheme,
      handleProjectChange,
      spawnSession,
      spawnClaudeSession,
      setFilePickerOpen,
      setSymbolSearchOpen,
    }));
  }, [setTheme, handleProjectChange, spawnSession, spawnClaudeSession, setFilePickerOpen, setSymbolSearchOpen]);
}

export function useKeyboardShortcuts(deps: KeyboardShortcutDeps): void {
  const {
    keybindings,
    setFilePickerOpen,
    setSymbolSearchOpen,
    setPerfOverlayVisible,
    spawnClaudeSession,
    workspaceLayouts,
    handleSelectLayout,
  } = deps;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const pressed = keyEventToString(event);
      if (!pressed) return;

      const action = matchKeyAction(pressed, keybindings, workspaceLayouts);
      if (!action) return;

      event.preventDefault();
      dispatchKeyAction(action, {
        setFilePickerOpen,
        setSymbolSearchOpen,
        setPerfOverlayVisible,
        spawnClaudeSession,
        handleSelectLayout,
        workspaceLayouts,
      });
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keybindings, setFilePickerOpen, setSymbolSearchOpen, setPerfOverlayVisible, spawnClaudeSession, workspaceLayouts, handleSelectLayout]);
}

function dispatchKeyAction(
  action: KeyAction,
  deps: {
    setFilePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setSymbolSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setPerfOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
    spawnClaudeSession: (cwd?: string) => Promise<void>;
    handleSelectLayout: (layout: WorkspaceLayout) => void;
    workspaceLayouts: WorkspaceLayout[];
  },
): void {
  if (action === 'settings') {
    emitSettingsPanel();
  } else if (action === 'filePicker') {
    deps.setFilePickerOpen((prev) => !prev);
  } else if (action === 'symbolSearch') {
    deps.setSymbolSearchOpen((prev) => !prev);
  } else if (action === 'newWindow') {
    if (hasElectronAPI()) void window.electronAPI.window.create();
  } else if (action === 'usage') {
    emitUsagePanel();
  } else if (action === 'perfOverlay') {
    deps.setPerfOverlayVisible((prev) => !prev);
  } else if (action === 'spawnClaude') {
    void deps.spawnClaudeSession();
  } else if (typeof action === 'object') {
    deps.handleSelectLayout(deps.workspaceLayouts[action.index]);
  }
}
