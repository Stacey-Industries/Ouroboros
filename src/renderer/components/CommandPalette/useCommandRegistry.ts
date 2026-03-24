import log from 'electron-log/renderer';
import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react';

import { buildBuiltinCommands } from './commandRegistry.builders';
import type { Command } from './types';

const RECENT_KEY = 'agent-ide:command-recent';
const MAX_RECENT = 5;

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

function useCommandExecutor(
  setRecentIds: Dispatch<SetStateAction<string[]>>,
): (command: Command) => Promise<void> {
  return useCallback(
    async (command: Command): Promise<void> => {
      setRecentIds((prev) => pushRecent(command.id, prev));
      await command.action();
      window.electronAPI.extensions.commandExecuted(command.id).catch((error) => {
        log.error('Failed to record command execution:', command.id, error);
      });
    },
    [setRecentIds],
  );
}

function useRegisterCommand(
  setCommands: Dispatch<SetStateAction<Command[]>>,
): (command: Command) => void {
  return useCallback(
    (command: Command): void => {
      setCommands((prev) => {
        const exists = prev.some((candidate) => candidate.id === command.id);
        return exists
          ? prev.map((candidate) => (candidate.id === command.id ? command : candidate))
          : [...prev, command];
      });
    },
    [setCommands],
  );
}

function useUnregisterCommand(
  setCommands: Dispatch<SetStateAction<Command[]>>,
): (id: string) => void {
  return useCallback(
    (id: string): void => {
      setCommands((prev) => prev.filter((command) => command.id !== id));
    },
    [setCommands],
  );
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
