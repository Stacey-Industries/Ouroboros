/**
 * useAppKeyboardShortcuts.ts — Application keyboard shortcuts.
 */

import { useCallback, useEffect } from 'react';

import type { WorkspaceLayout } from '../types/electron';
import {
  OPEN_SETTINGS_EVENT,
  OPEN_USAGE_PANEL_EVENT,
  TOGGLE_IMMERSIVE_CHAT_EVENT,
  TOGGLE_LAYOUT_MODE_EVENT,
  TOGGLE_SHORTCUT_CHEATSHEET_EVENT,
  TOGGLE_SIDE_CHAT_EVENT,
} from './appEventNames';

interface KeyboardShortcutsDeps {
  keybindings: Record<string, string>;
  setFilePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSymbolSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPerfOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
  spawnClaudeSession: (
    cwd?: string,
    opts?: { initialPrompt?: string; cliOverrides?: Record<string, unknown>; label?: string },
  ) => Promise<void>;
  workspaceLayouts: WorkspaceLayout[];
  handleSelectLayout: (layout: WorkspaceLayout) => void;
}

function buildComboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(key);
  return parts.join('+');
}

function buildReverseMap(keybindings: Record<string, string>): Map<string, string> {
  const reverseMap = new Map<string, string>();
  for (const [action, combo] of Object.entries(keybindings)) {
    reverseMap.set(combo, action);
  }
  return reverseMap;
}

function dispatchShortcutAction(action: string, deps: KeyboardShortcutsDeps): void {
  if (action.includes('file-picker') || action.includes('file')) {
    deps.setFilePickerOpen(true);
  } else if (action.includes('symbol')) {
    deps.setSymbolSearchOpen(true);
  } else if (action.includes('perf')) {
    deps.setPerfOverlayVisible((prev) => !prev);
  } else if (action.includes('claude') || action.includes('session')) {
    void deps.spawnClaudeSession();
  } else {
    matchAndApplyLayout(action, deps.workspaceLayouts, deps.handleSelectLayout);
  }
}

function matchAndApplyLayout(
  action: string,
  layouts: WorkspaceLayout[],
  apply: (l: WorkspaceLayout) => void,
): void {
  const matched = layouts.find((l) => action.toLowerCase().includes(l.name.toLowerCase()));
  if (matched) apply(matched);
}

function handleUsagePanelShortcut(e: KeyboardEvent): boolean {
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(OPEN_USAGE_PANEL_EVENT));
    return true;
  }
  return false;
}

function handleLayoutModeToggle(e: KeyboardEvent): boolean {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toUpperCase() === 'L') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(TOGGLE_LAYOUT_MODE_EVENT));
    return true;
  }
  return false;
}

function handleSideChatToggle(e: KeyboardEvent): boolean {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === ';') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(TOGGLE_SIDE_CHAT_EVENT));
    return true;
  }
  return false;
}

// Ctrl+Alt+I (Ctrl+Shift+I is taken by Toggle Developer Tools in Help menu).
function handleImmersiveChatToggle(e: KeyboardEvent): boolean {
  if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key.toUpperCase() === 'I') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(TOGGLE_IMMERSIVE_CHAT_EVENT));
    return true;
  }
  return false;
}

// Ctrl+, — open Settings modal (chat-only mode; no collision with IDE bindings).
function handleOpenSettings(e: KeyboardEvent): boolean {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === ',') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
    return true;
  }
  return false;
}

// Ctrl+/ — toggle keyboard cheat-sheet (chat-only; no IDE collision).
function handleToggleCheatSheet(e: KeyboardEvent): boolean {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '/') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(TOGGLE_SHORTCUT_CHEATSHEET_EVENT));
    return true;
  }
  return false;
}

// Ctrl+K — open command palette via existing 'agent-ide:command-palette' event.
// Note: Ctrl+Shift+P is the primary palette shortcut (handled in useCommandPalette).
// Ctrl+K is an additive alias for chat-only discoverability.
function handleOpenCommandPalette(e: KeyboardEvent): boolean {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('agent-ide:command-palette'));
    return true;
  }
  return false;
}

export function useKeyboardShortcuts(deps: KeyboardShortcutsDeps): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (handleUsagePanelShortcut(e)) return;
      if (handleLayoutModeToggle(e)) return;
      if (handleSideChatToggle(e)) return;
      if (handleImmersiveChatToggle(e)) return;
      if (handleOpenSettings(e)) return;
      if (handleToggleCheatSheet(e)) return;
      if (handleOpenCommandPalette(e)) return;
      const reverseMap = buildReverseMap(deps.keybindings);
      const combo = buildComboFromEvent(e);
      const action = reverseMap.get(combo);
      if (!action) return;
      e.preventDefault();
      dispatchShortcutAction(action, deps);
    },
    [deps],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
