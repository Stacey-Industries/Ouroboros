import {
  OPEN_ORCHESTRATION_PANEL_EVENT,
  OPEN_SETTINGS_PANEL_EVENT,
} from '../../hooks/appEventNames';
import type { Command } from './types';

const EMPTY_ACTION: Command['action'] = () => {};

const THEME_OPTIONS = [
  { id: 'retro', label: 'Retro', icon: '🟢' },
  { id: 'modern', label: 'Modern', icon: '🔵' },
  { id: 'warp', label: 'Warp', icon: '🟣' },
  { id: 'cursor', label: 'Cursor', icon: '⚫' },
  { id: 'kiro', label: 'Kiro', icon: '🟡' },
] as const;

const TERMINAL_OPTIONS = [
  {
    id: 'terminal:new-tab',
    label: 'New Tab',
    shortcut: 'Ctrl+Shift+`',
    icon: '+',
    eventName: 'agent-ide:new-terminal',
  },
  {
    id: 'terminal:close-tab',
    label: 'Close Tab',
    icon: '×',
    eventName: 'agent-ide:close-terminal',
  },
  {
    id: 'terminal:toggle',
    label: 'Toggle Panel',
    shortcut: 'Ctrl+J',
    icon: '⬛',
    eventName: 'agent-ide:toggle-terminal',
  },
] as const;

interface DomCommandConfig {
  id: string;
  label: string;
  category: Command['category'];
  eventName: string;
  shortcut?: string;
  icon?: string;
  detail?: unknown;
}

function dispatchDomEvent(eventName: string, detail?: unknown): void {
  window.dispatchEvent(
    detail === undefined ? new CustomEvent(eventName) : new CustomEvent(eventName, { detail }),
  );
}

function createDomCommand(config: DomCommandConfig): Command {
  const { eventName, detail, ...command } = config;
  return {
    ...command,
    action: () => dispatchDomEvent(eventName, detail),
  };
}

function createSubmenu(config: {
  id: string;
  label: string;
  category: Command['category'];
  icon: string;
  children: Command[];
}): Command {
  const { id, label, category, icon, children } = config;
  return { id, label, category, icon, action: EMPTY_ACTION, children };
}

function buildThemeMenu(): Command {
  const children = THEME_OPTIONS.map((theme) =>
    createDomCommand({
      id: `theme:${theme.id}`,
      label: theme.label,
      category: 'view',
      icon: theme.icon,
      eventName: 'agent-ide:set-theme',
      detail: theme.id,
    }),
  );
  return createSubmenu({ id: 'theme', label: 'Theme', category: 'view', icon: '🎨', children });
}

function buildViewCommands(): Command[] {
  return [
    createDomCommand({
      id: 'view:toggle-sidebar',
      label: 'Toggle Left Sidebar',
      category: 'view',
      shortcut: 'Ctrl+B',
      icon: '⬛',
      eventName: 'agent-ide:toggle-sidebar',
    }),
    createDomCommand({
      id: 'view:toggle-agent-monitor',
      label: 'Toggle Agent Monitor',
      category: 'view',
      shortcut: 'Ctrl+\\',
      icon: '🤖',
      eventName: 'agent-ide:toggle-agent-monitor',
    }),
    createDomCommand({
      id: 'view:orchestration',
      label: 'Open Orchestration',
      category: 'view',
      icon: '◎',
      eventName: OPEN_ORCHESTRATION_PANEL_EVENT,
    }),
  ];
}

function buildTerminalMenu(): Command {
  const children = TERMINAL_OPTIONS.map((command) =>
    createDomCommand({ ...command, category: 'terminal' }),
  );
  return createSubmenu({
    id: 'terminal',
    label: 'Terminal',
    category: 'terminal',
    icon: '>_',
    children,
  });
}

function buildFileCommands(): Command[] {
  return [
    createDomCommand({
      id: 'file:open-folder',
      label: 'Open Project Folder',
      category: 'file',
      icon: '📁',
      eventName: 'agent-ide:open-folder',
    }),
    createDomCommand({
      id: 'file:open-file',
      label: 'Go to File',
      category: 'file',
      shortcut: 'Ctrl+P',
      icon: '📄',
      eventName: 'agent-ide:open-file-picker',
    }),
  ];
}

async function openFolderInNewWindow(): Promise<void> {
  const result = await window.electronAPI.files.selectFolder();
  if (result.success && !result.cancelled && result.path) {
    await window.electronAPI.window.create(result.path);
  }
}

function buildWindowCommands(): Command[] {
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
      id: 'window:new-with-folder',
      label: 'Open Folder in New Window',
      category: 'file',
      icon: '📁',
      action: openFolderInNewWindow,
    },
  ];
}

function buildAppCommands(): Command[] {
  return [
    createDomCommand({
      id: 'app:settings',
      label: 'Open Settings',
      category: 'app',
      shortcut: 'Ctrl+,',
      icon: '⚙',
      eventName: OPEN_SETTINGS_PANEL_EVENT,
    }),
    {
      id: 'app:reload',
      label: 'Reload Window',
      category: 'app',
      shortcut: 'Ctrl+Shift+R',
      icon: '↺',
      action: () => window.location.reload(),
    },
    createDomCommand({
      id: 'app:devtools',
      label: 'Toggle DevTools',
      category: 'app',
      icon: '🔧',
      eventName: 'agent-ide:toggle-devtools',
    }),
    createDomCommand({
      id: 'app:context-builder',
      label: 'Build Project Context',
      category: 'app',
      icon: '⬡',
      eventName: 'agent-ide:open-context-builder',
    }),
  ];
}

function buildTimeTravelCommand(): Command {
  return createDomCommand({
    id: 'git:time-travel',
    label: 'Time Travel: Browse Snapshots',
    category: 'git',
    icon: '⏱',
    eventName: 'agent-ide:open-time-travel',
  });
}

export function buildBuiltinCommands(): Command[] {
  return [
    buildThemeMenu(),
    ...buildViewCommands(),
    buildTerminalMenu(),
    ...buildFileCommands(),
    ...buildWindowCommands(),
    ...buildAppCommands(),
    buildTimeTravelCommand(),
  ];
}
