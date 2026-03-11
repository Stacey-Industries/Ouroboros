import { useState, useCallback, useRef, useEffect } from 'react';
import type { Command } from './types';

// ─── localStorage keys ────────────────────────────────────────────────────────

const RECENT_KEY = 'agent-ide:command-recent';
const MAX_RECENT = 5;

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
  const filtered = prev.filter((r) => r !== id);
  const next = [id, ...filtered].slice(0, MAX_RECENT);
  saveRecent(next);
  return next;
}

// ─── Built-in command definitions ────────────────────────────────────────────

/**
 * Built-in commands. Theme and Terminal commands are nested under parent
 * commands with `children` arrays. View, File, and App commands remain flat.
 */
function buildBuiltinCommands(): Command[] {
  return [
    // ── Theme (nested) ───────────────────────────────────────────────────────
    {
      id: 'theme',
      label: 'Theme',
      category: 'view',
      icon: '🎨',
      // No action — navigates into children
      action: () => { /* submenu — handled by palette navigation */ },
      children: [
        {
          id: 'theme:retro',
          label: 'Retro',
          category: 'view',
          icon: '🟢',
          action: () => {
            window.dispatchEvent(new CustomEvent('agent-ide:set-theme', { detail: 'retro' }));
          },
        },
        {
          id: 'theme:modern',
          label: 'Modern',
          category: 'view',
          icon: '🔵',
          action: () => {
            window.dispatchEvent(new CustomEvent('agent-ide:set-theme', { detail: 'modern' }));
          },
        },
        {
          id: 'theme:warp',
          label: 'Warp',
          category: 'view',
          icon: '🟣',
          action: () => {
            window.dispatchEvent(new CustomEvent('agent-ide:set-theme', { detail: 'warp' }));
          },
        },
        {
          id: 'theme:cursor',
          label: 'Cursor',
          category: 'view',
          icon: '⚫',
          action: () => {
            window.dispatchEvent(new CustomEvent('agent-ide:set-theme', { detail: 'cursor' }));
          },
        },
        {
          id: 'theme:kiro',
          label: 'Kiro',
          category: 'view',
          icon: '🟡',
          action: () => {
            window.dispatchEvent(new CustomEvent('agent-ide:set-theme', { detail: 'kiro' }));
          },
        },
      ],
    },

    // ── View ─────────────────────────────────────────────────────────────────
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

    // ── Terminal (nested) ────────────────────────────────────────────────────
    {
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
    },

    // ── File ─────────────────────────────────────────────────────────────────
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

    // ── App ──────────────────────────────────────────────────────────────────
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
  ];
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseCommandRegistryReturn {
  commands: Command[];
  recentIds: string[];
  execute: (command: Command) => Promise<void>;
  registerCommand: (command: Command) => void;
  unregisterCommand: (id: string) => void;
}

export function useCommandRegistry(): UseCommandRegistryReturn {
  const [commands, setCommands] = useState<Command[]>(() => buildBuiltinCommands());
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecent());

  // Keep a stable ref to commands for execute without stale closure
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  const execute = useCallback(async (command: Command): Promise<void> => {
    setRecentIds((prev) => pushRecent(command.id, prev));
    await command.action();
  }, []);

  const registerCommand = useCallback((command: Command): void => {
    setCommands((prev) => {
      // Replace if ID already exists, otherwise append
      const exists = prev.some((c) => c.id === command.id);
      if (exists) {
        return prev.map((c) => (c.id === command.id ? command : c));
      }
      return [...prev, command];
    });
  }, []);

  const unregisterCommand = useCallback((id: string): void => {
    setCommands((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ── DOM event bridge for programmatic registration ────────────────────────
  // External code can fire `agent-ide:register-command` / `agent-ide:unregister-command`
  // with a Command payload to inject commands at runtime (e.g. from extensions).

  useEffect(() => {
    function onRegister(e: Event): void {
      const command = (e as CustomEvent<Command>).detail;
      if (command && typeof command.id === 'string') {
        registerCommand(command);
      }
    }

    function onUnregister(e: Event): void {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === 'string') {
        unregisterCommand(id);
      }
    }

    window.addEventListener('agent-ide:register-command', onRegister);
    window.addEventListener('agent-ide:unregister-command', onUnregister);
    return () => {
      window.removeEventListener('agent-ide:register-command', onRegister);
      window.removeEventListener('agent-ide:unregister-command', onUnregister);
    };
  }, [registerCommand, unregisterCommand]);

  return { commands, recentIds, execute, registerCommand, unregisterCommand };
}
