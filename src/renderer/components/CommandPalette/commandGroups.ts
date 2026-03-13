import type { Command } from './types';

/** Theme submenu commands. */
function themeCommands(): Command {
  const themes = [
    { id: 'retro', label: 'Retro', icon: '🟢' },
    { id: 'modern', label: 'Modern', icon: '🔵' },
    { id: 'warp', label: 'Warp', icon: '🟣' },
    { id: 'cursor', label: 'Cursor', icon: '⚫' },
    { id: 'kiro', label: 'Kiro', icon: '🟡' },
  ];

  return {
    id: 'theme',
    label: 'Theme',
    category: 'view',
    icon: '🎨',
    action: () => { /* submenu */ },
    children: themes.map((t) => ({
      id: `theme:${t.id}`,
      label: t.label,
      category: 'view' as const,
      icon: t.icon,
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-ide:set-theme', { detail: t.id }));
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
        window.dispatchEvent(new CustomEvent('agent-ide:toggle-sidebar'));
      },
    },
    {
      id: 'view:toggle-agent-monitor',
      label: 'Toggle Agent Monitor',
      category: 'view',
      shortcut: 'Ctrl+\\',
      icon: '🤖',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-ide:toggle-agent-monitor'));
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
          window.dispatchEvent(new CustomEvent('agent-ide:new-terminal'));
        },
      },
      {
        id: 'terminal:close-tab',
        label: 'Close Tab',
        category: 'terminal',
        icon: '×',
        action: () => {
          window.dispatchEvent(new CustomEvent('agent-ide:close-terminal'));
        },
      },
      {
        id: 'terminal:toggle',
        label: 'Toggle Panel',
        category: 'terminal',
        shortcut: 'Ctrl+J',
        icon: '⬛',
        action: () => {
          window.dispatchEvent(new CustomEvent('agent-ide:toggle-terminal'));
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
      icon: '📁',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-ide:open-folder'));
      },
    },
    {
      id: 'file:open-file',
      label: 'Go to File',
      category: 'file',
      shortcut: 'Ctrl+P',
      icon: '📄',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-ide:open-file-picker'));
      },
    },
    {
      id: 'window:new-with-folder',
      label: 'Open Folder in New Window',
      category: 'file',
      icon: '📁',
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
    {
      id: 'window:new',
      label: 'New Window',
      category: 'app',
      shortcut: 'Ctrl+Shift+N',
      icon: '+',
      action: async () => {
        await window.electronAPI.window.create();
      },
    },
    {
      id: 'app:settings',
      label: 'Open Settings',
      category: 'app',
      shortcut: 'Ctrl+,',
      icon: '⚙',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-ide:open-settings'));
      },
    },
    {
      id: 'app:reload',
      label: 'Reload Window',
      category: 'app',
      shortcut: 'Ctrl+Shift+R',
      icon: '↺',
      action: () => {
        window.location.reload();
      },
    },
    {
      id: 'app:devtools',
      label: 'Toggle DevTools',
      category: 'app',
      icon: '🔧',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-ide:toggle-devtools'));
      },
    },
    {
      id: 'app:context-builder',
      label: 'Build Project Context',
      category: 'app',
      icon: '⬡',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-ide:open-context-builder'));
      },
    },
  ];
}

/** Git commands (flat). */
function gitCommands(): Command[] {
  return [
    {
      id: 'git:time-travel',
      label: 'Time Travel: Browse Snapshots',
      category: 'git',
      icon: '⏱',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-ide:open-time-travel'));
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
