/**
 * useAppKeyboardShortcuts.ts — Application keyboard shortcuts.
 */

import { useEffect, useCallback } from 'react';
import type { WorkspaceLayout } from '../types/electron';

interface KeyboardShortcutsDeps {
  keybindings: Record<string, string>
  setFilePickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  setSymbolSearchOpen: React.Dispatch<React.SetStateAction<boolean>>
  setPerfOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>
  spawnClaudeSession: (
    cwd?: string,
    opts?: { initialPrompt?: string; cliOverrides?: Record<string, unknown>; label?: string },
  ) => Promise<void>
  workspaceLayouts: WorkspaceLayout[]
  handleSelectLayout: (layout: WorkspaceLayout) => void
}

export function useKeyboardShortcuts(deps: KeyboardShortcutsDeps): void {
  const {
    keybindings,
    setFilePickerOpen,
    setSymbolSearchOpen,
    setPerfOverlayVisible,
    spawnClaudeSession,
    workspaceLayouts,
    handleSelectLayout,
  } = deps;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Build reverse map: key combo string -> action name
      const reverseMap = new Map<string, string>();
      for (const [action, combo] of Object.entries(keybindings)) {
        reverseMap.set(combo, action);
      }

      // Build key string from the event
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      // Normalize the key
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      parts.push(key);

      const combo = parts.join('+');
      const action = reverseMap.get(combo);

      if (!action) return;

      e.preventDefault();

      if (action.includes('file-picker') || action.includes('file')) {
        setFilePickerOpen(true);
      } else if (action.includes('symbol')) {
        setSymbolSearchOpen(true);
      } else if (action.includes('perf')) {
        setPerfOverlayVisible((prev) => !prev);
      } else if (action.includes('claude') || action.includes('session')) {
        void spawnClaudeSession();
      } else {
        // Check for layout shortcuts
        const matchedLayout = workspaceLayouts.find(
          (layout) => action.toLowerCase().includes(layout.name.toLowerCase()),
        );
        if (matchedLayout) {
          handleSelectLayout(matchedLayout);
        }
      }
    },
    [keybindings, setFilePickerOpen, setSymbolSearchOpen, setPerfOverlayVisible, spawnClaudeSession, workspaceLayouts, handleSelectLayout],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
