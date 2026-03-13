/**
 * useAppEventListeners — registers Electron menu events, DOM custom events,
 * and keyboard shortcuts for the main app.
 *
 * Extracted from InnerApp to reduce complexity.
 */

import { useEffect } from 'react';
import type { AppTheme, WorkspaceLayout } from '../types/electron';
import { keyEventToString, KEYBINDING_ACTIONS } from '../components/Settings/keybindingsData';

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

export function useMenuEvents(deps: Pick<AppEventDeps, 'handleProjectChange' | 'openPalette' | 'spawnSession'>): void {
  const { handleProjectChange, openPalette, spawnSession } = deps;

  useEffect(() => {
    if (!hasElectronAPI()) return;

    const cleanup = window.electronAPI.app.onMenuEvent((event) => {
      if (event === 'menu:open-folder') {
        void window.electronAPI.files.selectFolder().then((result) => {
          if (!result.cancelled && result.path) void handleProjectChange(result.path);
        });
      } else if (event === 'menu:command-palette') {
        openPalette();
      } else if (event === 'menu:new-terminal') {
        void spawnSession();
      } else if (event === 'menu:settings') {
        window.dispatchEvent(new CustomEvent('agent-ide:open-settings-panel'));
      }
    });

    return cleanup;
  }, [handleProjectChange, openPalette, spawnSession]);
}

export function useDomEventListeners(deps: AppEventDeps): void {
  const {
    setTheme, handleProjectChange, spawnSession, spawnClaudeSession,
    setFilePickerOpen, setSymbolSearchOpen,
  } = deps;

  useEffect(() => {
    function onSetTheme(e: Event): void {
      void setTheme((e as CustomEvent<string>).detail as AppTheme);
    }
    function onOpenUsage(): void {
      window.dispatchEvent(new CustomEvent('agent-ide:open-usage-panel'));
    }
    function onOpenFolder(): void {
      if (!hasElectronAPI()) return;
      void window.electronAPI.files.selectFolder().then((result) => {
        if (!result.cancelled && result.path) void handleProjectChange(result.path);
      });
    }
    function onNewTerminal(e: Event): void {
      void spawnSession((e as CustomEvent<{ cwd?: string }>).detail?.cwd);
    }
    function onOpenFilePicker(): void { setFilePickerOpen(true); }
    function onOpenSymbolSearch(): void { setSymbolSearchOpen(true); }

    function onOpenDiffReview(e: Event): void {
      const detail = (e as CustomEvent).detail;
      if (detail?.sessionId && detail?.snapshotHash && detail?.projectRoot) {
        window.dispatchEvent(new CustomEvent('agent-ide:diff-review-open', { detail }));
      }
    }

    function onSpawnClaudeTemplate(e: Event): void {
      const detail = (e as CustomEvent).detail;
      if (detail?.prompt) {
        void spawnClaudeSession(undefined, {
          initialPrompt: detail.prompt,
          label: detail.label,
          cliOverrides: detail.cliOverrides,
        });
      }
    }

    const events: Array<[string, (e: Event) => void]> = [
      ['agent-ide:set-theme', onSetTheme],
      ['agent-ide:open-usage', onOpenUsage],
      ['agent-ide:open-folder', onOpenFolder],
      ['agent-ide:new-terminal', onNewTerminal],
      ['agent-ide:open-file-picker', onOpenFilePicker],
      ['agent-ide:open-symbol-search', onOpenSymbolSearch],
      ['agent-ide:open-diff-review', onOpenDiffReview],
      ['agent-ide:spawn-claude-template', onSpawnClaudeTemplate],
    ];

    for (const [name, handler] of events) window.addEventListener(name, handler);
    return () => { for (const [name, handler] of events) window.removeEventListener(name, handler); };
  }, [setTheme, handleProjectChange, spawnSession, spawnClaudeSession, setFilePickerOpen, setSymbolSearchOpen]);
}

export function useKeyboardShortcuts(deps: Pick<AppEventDeps, 'keybindings' | 'setFilePickerOpen' | 'setSymbolSearchOpen' | 'setPerfOverlayVisible' | 'spawnClaudeSession' | 'workspaceLayouts' | 'handleSelectLayout'>): void {
  const {
    keybindings, setFilePickerOpen, setSymbolSearchOpen,
    setPerfOverlayVisible, spawnClaudeSession,
    workspaceLayouts, handleSelectLayout,
  } = deps;

  useEffect(() => {
    function getShortcut(actionId: string): string {
      if (keybindings[actionId]) return keybindings[actionId];
      return KEYBINDING_ACTIONS.find((a) => a.id === actionId)?.defaultShortcut ?? '';
    }

    function onKeyDown(e: KeyboardEvent): void {
      const pressed = keyEventToString(e);
      if (!pressed) return;

      const action = matchKeyAction(pressed, getShortcut, workspaceLayouts);
      if (!action) return;

      e.preventDefault();
      dispatchKeyAction(action, {
        setFilePickerOpen, setSymbolSearchOpen,
        setPerfOverlayVisible, spawnClaudeSession, handleSelectLayout,
        workspaceLayouts,
      });
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keybindings, setFilePickerOpen, setSymbolSearchOpen, setPerfOverlayVisible, spawnClaudeSession, workspaceLayouts, handleSelectLayout]);
}

type KeyAction =
  | 'settings' | 'filePicker' | 'symbolSearch'
  | 'newWindow' | 'usage' | 'perfOverlay'
  | 'spawnClaude' | { type: 'layout'; index: number };

function matchKeyAction(
  pressed: string,
  getShortcut: (id: string) => string,
  workspaceLayouts: WorkspaceLayout[],
): KeyAction | null {
  if (pressed === getShortcut('app:settings')) return 'settings';
  if (pressed === getShortcut('file:open-file')) return 'filePicker';
  if (pressed === 'Ctrl+T') return 'symbolSearch';
  if (pressed === 'Ctrl+Shift+N') return 'newWindow';
  if (pressed === 'Ctrl+U') return 'usage';
  if (pressed === 'Ctrl+Shift+P') return 'perfOverlay';
  if (pressed === 'Ctrl+Shift+C') return 'spawnClaude';
  for (let i = 0; i < 3; i++) {
    if (pressed === `Ctrl+Alt+${i + 1}` && workspaceLayouts[i]) {
      return { type: 'layout', index: i };
    }
  }
  return null;
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
    window.dispatchEvent(new CustomEvent('agent-ide:open-settings-panel'));
  } else if (action === 'filePicker') {
    deps.setFilePickerOpen((prev) => !prev);
  } else if (action === 'symbolSearch') {
    deps.setSymbolSearchOpen((prev) => !prev);
  } else if (action === 'newWindow') {
    if (hasElectronAPI()) void window.electronAPI.window.create();
  } else if (action === 'usage') {
    window.dispatchEvent(new CustomEvent('agent-ide:open-usage-panel'));
  } else if (action === 'perfOverlay') {
    deps.setPerfOverlayVisible((prev) => !prev);
  } else if (action === 'spawnClaude') {
    void deps.spawnClaudeSession();
  } else if (typeof action === 'object') {
    deps.handleSelectLayout(deps.workspaceLayouts[action.index]);
  }
}
