/**
 * useChatSidebarMode — reads and cycles the chat sidebar pin mode.
 *
 * Mode cycle: pinned → collapsed → hidden → pinned.
 * Persisted to config.layout.chatSidebarMode.
 * Subscribes to CYCLE_CHAT_SIDEBAR_MODE_EVENT for keyboard/button triggers.
 */

import { useCallback, useEffect, useState } from 'react';

import { CYCLE_CHAT_SIDEBAR_MODE_EVENT } from '../../../hooks/appEventNames';

export type ChatSidebarMode = 'pinned' | 'collapsed' | 'hidden';

const MODE_CYCLE: ChatSidebarMode[] = ['pinned', 'collapsed', 'hidden'];

function nextMode(current: ChatSidebarMode): ChatSidebarMode {
  const idx = MODE_CYCLE.indexOf(current);
  return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
}

function readConfigMode(): ChatSidebarMode {
  const raw = window.electronAPI?.config?.getAll;
  if (!raw) return 'pinned';
  return 'pinned'; // sync fallback; actual value comes via IPC in useEffect
}

interface UseChatSidebarModeReturn {
  mode: ChatSidebarMode;
  cycleMode: () => void;
}

export function useChatSidebarMode(): UseChatSidebarModeReturn {
  const [mode, setMode] = useState<ChatSidebarMode>(readConfigMode);

  // Load persisted mode from config on mount.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.config
      ?.getAll?.()
      .then((cfg) => {
        if (cancelled) return;
        const persisted = cfg?.layout?.chatSidebarMode;
        if (persisted === 'pinned' || persisted === 'collapsed' || persisted === 'hidden') {
          setMode(persisted);
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cycleMode = useCallback((): void => {
    setMode((current) => {
      const next = nextMode(current);
      // Persist async; optimistic update already applied via setMode.
      window.electronAPI?.config?.set?.('layout', { chatSidebarMode: next } as never).catch(() => {
        /* ignore persistence failure */
      });
      return next;
    });
  }, []);

  // Subscribe to DOM event for keyboard / title-bar button trigger.
  useEffect(() => {
    const handler = (): void => {
      cycleMode();
    };
    window.addEventListener(CYCLE_CHAT_SIDEBAR_MODE_EVENT, handler);
    return () => {
      window.removeEventListener(CYCLE_CHAT_SIDEBAR_MODE_EVENT, handler);
    };
  }, [cycleMode]);

  return { mode, cycleMode };
}
