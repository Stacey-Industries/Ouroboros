import {
  useState,
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Command } from './types';

const RECENT_KEY = 'agent-ide:command-recent';
const MAX_RECENT = 5;

const EMPTY_ACTION: Command['action'] = () => {};

const THEME_OPTIONS = [
  { id: 'retro', label: 'Retro', icon: '🟢' },
  { id: 'modern', label: 'Modern', icon: '🔵' },
  { id: 'warp', label: 'Warp', icon: '🟣' },
  { id: 'cursor', label: 'Cursor', icon: '⚫' },
  { id: 'kiro', label: 'Kiro', icon: '🟡' },
] as const;

const TERMINAL_OPTIONS = [
  { id: 'terminal:new-tab', label: 'New Tab', shortcut: 'Ctrl+Shift+`', icon: '+', eventName: 'agent-ide:new-terminal' },
  { id: 'terminal:close-tab', label: 'Close Tab', icon: '×', eventName: 'agent-ide:close-terminal' },
  { id: 'terminal:toggle', label: 'Toggle Panel', shortcut: 'Ctrl+J', icon: '⬛', eventName: 'agent-ide:toggle-terminal' },
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

export interface UseCommandRegistryReturn {
  commands: Command[];
  recentIds: string[];
  execute: (command: Command) => Promise<void>;
  registerCommand: (command: Command) => void;
  unregisterCommand: (id: string) => void;
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    // ignore
  }
  return [];
}

function saveRecent(ids: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function pushRecent(id: string, prev: string[]): string[] {
  const filtered = prev.filter((recentId) => recentId !== id);
  const next = [id, ...filtered].slice(0, MAX_RECENT);
  saveRecent(next);
  return next;
}

function dispatchDomEvent(eventName: string, detail?: unknown): void {
  window.dispatchEvent(
    detail === undefined
      ? new CustomEvent(eventName)
      : new CustomEvent(eventName, { detail }),
  );
}

function createDomCommand(config: DomCommandConfig): Command {
  const { eventName, detail, ...command } = config;
  return {
    ...command,
    action: () => dispatchDomEvent(eventName, detail),
  };
}

function createSubmenu(
  config: {
    id: string;
    label: string;
    category: Command['category'];
    icon: string;
    children: Command[];
  },
): Command {
  const {
    id,
    label,
    category,
    icon,
    children,
  } = config;
  return { id, label, category, icon, action: EMPTY_ACTION, children };
}

function buildThemeMenu(): Command {
  const children = THEME_OPTIONS.map((theme) => createDomCommand({
    id: `theme:${theme.id}`,
    label: theme.label,
    category: 'view',
    icon: theme.icon,
    eventName: 'agent-ide:set-theme',
    detail: theme.id,
  }));

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
  ];
}

function buildTerminalMenu(): Command {
  const children = TERMINAL_OPTIONS.map((command) => createDomCommand({
    ...command,
    category: 'terminal',
  }));

  return createSubmenu({ id: 'terminal', label: 'Terminal', category: 'terminal', icon: '>_', children });
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
      action: async () => window.electronAPI.window.create(),
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
      eventName: 'agent-ide:open-settings',
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

function buildBuiltinCommands(): Command[] {
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

function useCommandExecutor(
  setRecentIds: Dispatch<SetStateAction<string[]>>,
): (command: Command) => Promise<void> {
  return useCallback(async (command: Command): Promise<void> => {
    setRecentIds((prev) => pushRecent(command.id, prev));
    await command.action();
    window.electronAPI.extensions.commandExecuted(command.id).catch(() => {});
  }, [setRecentIds]);
}

function useRegisterCommand(
  setCommands: Dispatch<SetStateAction<Command[]>>,
): (command: Command) => void {
  return useCallback((command: Command): void => {
    setCommands((prev) => {
      const exists = prev.some((candidate) => candidate.id === command.id);
      return exists
        ? prev.map((candidate) => (candidate.id === command.id ? command : candidate))
        : [...prev, command];
    });
  }, [setCommands]);
}

function useUnregisterCommand(
  setCommands: Dispatch<SetStateAction<Command[]>>,
): (id: string) => void {
  return useCallback((id: string): void => {
    setCommands((prev) => prev.filter((command) => command.id !== id));
  }, [setCommands]);
}

function useCommandRegistryBridge(
  registerCommand: (command: Command) => void,
  unregisterCommand: (id: string) => void,
): void {
  useEffect(() => {
    const onRegister = (event: Event): void => {
      const command = (event as CustomEvent<Command>).detail;
      if (command && typeof command.id === 'string') registerCommand(command);
    };
    const onUnregister = (event: Event): void => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === 'string') unregisterCommand(id);
    };

    window.addEventListener('agent-ide:register-command', onRegister);
    window.addEventListener('agent-ide:unregister-command', onUnregister);
    return () => {
      window.removeEventListener('agent-ide:register-command', onRegister);
      window.removeEventListener('agent-ide:unregister-command', onUnregister);
    };
  }, [registerCommand, unregisterCommand]);
}

export function useCommandRegistry(): UseCommandRegistryReturn {
  const [commands, setCommands] = useState<Command[]>(() => buildBuiltinCommands());
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecent());

  const execute = useCommandExecutor(setRecentIds);
  const registerCommand = useRegisterCommand(setCommands);
  const unregisterCommand = useUnregisterCommand(setCommands);

  useCommandRegistryBridge(registerCommand, unregisterCommand);

  return { commands, recentIds, execute, registerCommand, unregisterCommand };
}
