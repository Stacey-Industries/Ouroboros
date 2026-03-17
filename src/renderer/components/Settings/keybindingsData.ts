/**
 * keybindingsData.ts — Keybinding action definitions and key normalization.
 */

export interface KeybindingAction {
  id: string;
  label: string;
  category: string;
  defaultShortcut: string;
}

export const KEYBINDING_ACTIONS: KeybindingAction[] = [
  { id: 'app:settings',              label: 'Open Settings',        category: 'App',      defaultShortcut: 'Ctrl+,' },
  { id: 'app:command-palette',       label: 'Command Palette',      category: 'App',      defaultShortcut: 'Ctrl+Shift+P' },
  { id: 'file:open-file',            label: 'Go to File (Picker)',  category: 'File',     defaultShortcut: 'Ctrl+P' },
  { id: 'view:toggle-sidebar',       label: 'Toggle Left Sidebar',  category: 'View',     defaultShortcut: 'Ctrl+B' },
  { id: 'view:toggle-terminal',      label: 'Toggle Terminal',      category: 'View',     defaultShortcut: 'Ctrl+J' },
  { id: 'view:toggle-agent-monitor', label: 'Toggle Agent Monitor', category: 'View',     defaultShortcut: 'Ctrl+\\' },
  { id: 'terminal:new-tab',          label: 'New Terminal Tab',     category: 'Terminal', defaultShortcut: 'Ctrl+Shift+`' },
  { id: 'editor:find',               label: 'Find in File',         category: 'Editor',   defaultShortcut: 'Ctrl+F' },
  { id: 'editor:replace',            label: 'Find and Replace',     category: 'Editor',   defaultShortcut: 'Ctrl+H' },
  { id: 'editor:go-to-line',         label: 'Go to Line',           category: 'Editor',   defaultShortcut: 'Ctrl+G' },
  { id: 'editor:toggle-diff',        label: 'Toggle Diff View',     category: 'Editor',   defaultShortcut: 'Ctrl+D' },
  { id: 'editor:fold-all',           label: 'Fold All',             category: 'Editor',   defaultShortcut: 'Ctrl+Shift+[' },
  { id: 'editor:unfold-all',         label: 'Unfold All',           category: 'Editor',   defaultShortcut: 'Ctrl+Shift+]' },
  { id: 'editor:word-wrap',          label: 'Toggle Word Wrap',     category: 'Editor',   defaultShortcut: 'Alt+Z' },
];

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Dead']);

const SPECIAL_KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
};

export function keyEventToString(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = SPECIAL_KEY_MAP[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  parts.push(key);
  return parts.join('+');
}

export function getEffectiveShortcut(
  actionId: string,
  keybindings: Record<string, string>,
): string {
  return keybindings[actionId] ?? KEYBINDING_ACTIONS.find((a) => a.id === actionId)?.defaultShortcut ?? '';
}

export function findConflict(
  shortcut: string,
  excludeId: string,
  keybindings: Record<string, string>,
): string | null {
  for (const action of KEYBINDING_ACTIONS) {
    if (action.id === excludeId) continue;
    const effective = getEffectiveShortcut(action.id, keybindings);
    if (effective.toLowerCase() === shortcut.toLowerCase()) return action.id;
  }
  return null;
}
