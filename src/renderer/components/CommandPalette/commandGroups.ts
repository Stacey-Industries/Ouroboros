import { OPEN_SETTINGS_PANEL_EVENT, SPLIT_EDITOR_EVENT } from '../../hooks/appEventNames';
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
    action: async () => window.electronAPI.window.create(),
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
      icon: 'â¬›',
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
  ];
}
