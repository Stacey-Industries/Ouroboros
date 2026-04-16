import {
  OPEN_SETTINGS_PANEL_EVENT,
  OPEN_THREAD_EVENT,
  OPEN_THREAD_SEARCH_EVENT,
  SPLIT_EDITOR_EVENT,
} from '../../hooks/appEventNames';
import type { Command } from './types';

interface DispatchCommandConfig {
  id: string;
  label: string;
  category: Command['category'];
  icon: string;
  shortcut?: string;
  eventName: string;
}

function dispatchIdeEvent(eventName: string, detail?: string): void {
  window.dispatchEvent(new CustomEvent(eventName, detail ? { detail } : undefined));
}

function createDispatchCommand(config: DispatchCommandConfig): Command {
  return {
    id: config.id,
    label: config.label,
    category: config.category,
    shortcut: config.shortcut,
    icon: config.icon,
    action: () => {
      dispatchIdeEvent(config.eventName);
    },
  };
}

function createWindowCommand(): Command {
  return {
    id: 'window:new',
    label: 'New Window',
    category: 'app',
    shortcut: 'Ctrl+Shift+N',
    icon: '+',
    action: () => { void window.electronAPI.window.create(); },
  };
}

function createReloadCommand(): Command {
  return {
    id: 'app:reload',
    label: 'Reload Window',
    category: 'app',
    shortcut: 'Ctrl+Shift+R',
    icon: 'â†º',
    action: () => window.location.reload(),
  };
}

/** Theme submenu commands. */
function themeCommands(): Command {
  const themes = [
    { id: 'retro', label: 'Retro', icon: 'ðŸŸ¢' },
    { id: 'modern', label: 'Modern', icon: 'ðŸ”µ' },
    { id: 'warp', label: 'Warp', icon: 'ðŸŸ£' },
    { id: 'cursor', label: 'Cursor', icon: 'âš«' },
    { id: 'kiro', label: 'Kiro', icon: 'ðŸŸ¡' },
  ];

  return {
    id: 'theme',
    label: 'Theme',
    category: 'view',
    icon: 'ðŸŽ¨',
    action: () => { /* submenu */ },
    children: themes.map((t) => ({
      id: `theme:${t.id}`,
      label: t.label,
      category: 'view' as const,
      icon: t.icon,
      action: () => {
        dispatchIdeEvent('agent-ide:set-theme', t.id);
      },
    })),
  };
}

/** View commands (flat). */
function viewCommands(): Command[] {
  return [
    {
      id: 'view:toggle-sidebar',
      label: 'Toggle Left Sidebar',
      category: 'view',
      shortcut: 'Ctrl+B',
      icon: '⬛',
      action: () => {
        dispatchIdeEvent('agent-ide:toggle-sidebar');
      },
    },
    {
      id: 'view:toggle-agent-monitor',
      label: 'Toggle Agent Monitor',
      category: 'view',
      shortcut: 'Ctrl+\\',
      icon: 'ðŸ¤–',
      action: () => {
        dispatchIdeEvent('agent-ide:toggle-agent-monitor');
      },
    },
    {
      id: 'view:split-editor',
      label: 'Split Editor Right',
      category: 'view',
      shortcut: 'Ctrl+Shift+\\',
      icon: '\u2503',
      action: () => {
        dispatchIdeEvent(SPLIT_EDITOR_EVENT);
      },
    },
  ];
}

/** Terminal submenu commands. */
function terminalCommands(): Command {
  return {
    id: 'terminal',
    label: 'Terminal',
    category: 'terminal',
    icon: '>_',
    action: () => { /* submenu */ },
    children: [
      {
        id: 'terminal:new-tab',
        label: 'New Tab',
        category: 'terminal',
        shortcut: 'Ctrl+Shift+`',
        icon: '+',
        action: () => {
          dispatchIdeEvent('agent-ide:new-terminal');
        },
      },
      {
        id: 'terminal:close-tab',
        label: 'Close Tab',
        category: 'terminal',
        icon: 'Ã—',
        action: () => {
          dispatchIdeEvent('agent-ide:close-terminal');
        },
      },
      {
        id: 'terminal:toggle',
        label: 'Toggle Panel',
        category: 'terminal',
        shortcut: 'Ctrl+J',
        icon: 'â¬›',
        action: () => {
          dispatchIdeEvent('agent-ide:toggle-terminal');
        },
      },
    ],
  };
}

/** File commands (flat). */
function fileCommands(): Command[] {
  return [
    {
      id: 'file:open-folder',
      label: 'Open Project Folder',
      category: 'file',
      icon: 'ðŸ“',
      action: () => {
        dispatchIdeEvent('agent-ide:open-folder');
      },
    },
    {
      id: 'file:open-file',
      label: 'Go to File',
      category: 'file',
      shortcut: 'Ctrl+P',
      icon: 'ðŸ“„',
      action: () => {
        dispatchIdeEvent('agent-ide:open-file-picker');
      },
    },
    {
      id: 'window:new-with-folder',
      label: 'Open Folder in New Window',
      category: 'file',
      icon: 'ðŸ“',
      action: async () => {
        const result = await window.electronAPI.files.selectFolder();
        if (result.success && !result.cancelled && result.path) {
          await window.electronAPI.window.create(result.path);
        }
      },
    },
  ];
}

/** App and window commands (flat). */
function appCommands(): Command[] {
  return [
    createWindowCommand(),
    createDispatchCommand({
      id: 'app:settings',
      label: 'Open Settings',
      category: 'app',
      shortcut: 'Ctrl+,',
      icon: 'âš™',
      eventName: OPEN_SETTINGS_PANEL_EVENT,
    }),
    createReloadCommand(),
    createDispatchCommand({
      id: 'app:devtools',
      label: 'Toggle DevTools',
      category: 'app',
      icon: 'ðŸ”§',
      eventName: 'agent-ide:toggle-devtools',
    }),
    createDispatchCommand({
      id: 'app:context-builder',
      label: 'Build Project Context',
      category: 'app',
      icon: 'â¬¡',
      eventName: 'agent-ide:open-context-builder',
    }),
  ];
}

/** Git commands (flat). */
function gitCommands(): Command[] {
  return [
    {
      id: 'git:time-travel',
      label: 'Time Travel: Browse Snapshots',
      category: 'git',
      icon: 'â±',
      action: () => {
        dispatchIdeEvent('agent-ide:open-time-travel');
      },
    },
    {
      id: 'git:review-all-changes',
      label: 'Review All Working Changes',
      category: 'git',
      icon: '\u0394',
      action: () => {
        dispatchIdeEvent('agent-ide:review-all-changes');
      },
    },
    {
      id: 'git:review-unstaged-changes',
      label: 'Review Unstaged Changes',
      category: 'git',
      icon: '\u0394',
      action: () => {
        dispatchIdeEvent('agent-ide:review-unstaged-changes');
      },
    },
  ];
}

/**
 * Parse a user-supplied thread navigation target into `{ threadId, messageId? }`.
 * Accepts `thread://<id>#msg=<msgId>` permalinks or a bare thread id.
 * Returns null for empty input.
 */
function parseThreadGotoInput(raw: string): { threadId: string; messageId?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('thread://')) return { threadId: trimmed };
  const body = trimmed.slice('thread://'.length);
  const hashIdx = body.indexOf('#');
  const rawThreadId = hashIdx === -1 ? body : body.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? '' : body.slice(hashIdx + 1);
  try {
    const threadId = decodeURIComponent(rawThreadId);
    if (!threadId) return null;
    const msgMatch = fragment.startsWith('msg=') ? decodeURIComponent(fragment.slice(4)) : '';
    return msgMatch ? { threadId, messageId: msgMatch } : { threadId };
  } catch {
    return null;
  }
}

function runGotoThread(): void {
  if (typeof window === 'undefined') return;
  const input = window.prompt('Go to thread (thread://<id> or plain ID):');
  if (input == null) return;
  const parsed = parseThreadGotoInput(input);
  if (!parsed) return;
  window.dispatchEvent(new CustomEvent(OPEN_THREAD_EVENT, { detail: parsed }));
}

/** Thread / search commands (flat). */
function threadCommands(): Command[] {
  return [
    {
      id: 'threads:search',
      label: 'Search Threads',
      category: 'app',
      shortcut: 'Ctrl+Shift+F',
      icon: '\u{1F50D}',
      action: () => {
        dispatchIdeEvent(OPEN_THREAD_SEARCH_EVENT);
      },
    },
    {
      id: 'threads:goto',
      label: 'Go to Thread\u2026',
      category: 'app',
      icon: '\u{1F517}',
      action: runGotoThread,
    },
  ];
}

/**
 * Build the complete list of built-in commands.
 * Each group function returns a focused subset.
 */
export function buildBuiltinCommands(): Command[] {
  return [
    themeCommands(),
    ...viewCommands(),
    terminalCommands(),
    ...fileCommands(),
    ...appCommands(),
    ...gitCommands(),
    ...threadCommands(),
  ];
}
