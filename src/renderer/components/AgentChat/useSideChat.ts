/**
 * useSideChat.ts — Wave 23 Phase C
 *
 * Manages in-memory open side-chat thread IDs for the current session.
 * Side chats are forked threads (isSideChat: true); they are not persisted
 * across sessions from the UI perspective (the threads themselves persist in
 * the store, but the drawer's open-tab list is session-scoped).
 */

import log from 'electron-log/renderer';
import { useCallback, useState } from 'react';

import type { AgentChatForkThreadRequest } from '../../types/electron';

export interface UseSideChatReturn {
  /** Ordered list of thread IDs open in the side-chat drawer. */
  sideChats: string[];
  /** The thread ID currently shown in the drawer body (null if drawer closed). */
  activeSideChatId: string | null;
  /** Fork a thread and open the result as a new side-chat tab. */
  openSideChat: (
    parentThreadId: string,
    forkAtMessageId?: string,
    includeHistory?: boolean,
  ) => Promise<string | null>;
  /** Remove a thread ID from the drawer tab list (thread stays in store). */
  closeSideChat: (threadId: string) => void;
  /** Set which side-chat is currently displayed. */
  setActive: (threadId: string | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function forkToSideChat(req: AgentChatForkThreadRequest): Promise<string | null> {
  if (typeof window === 'undefined' || !('electronAPI' in window)) return null;
  try {
    const result = await window.electronAPI.agentChat.forkThread(req);
    if (!result.success || !result.thread) {
      log.warn('[useSideChat] forkThread failed:', result.error);
      return null;
    }
    return result.thread.id;
  } catch (err) {
    log.warn('[useSideChat] forkThread threw:', err);
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSideChat(): UseSideChatReturn {
  const [sideChats, setSideChats] = useState<string[]>([]);
  const [activeSideChatId, setActiveSideChatId] = useState<string | null>(null);

  const openSideChat = useCallback(
    async (
      parentThreadId: string,
      forkAtMessageId?: string,
      includeHistory = false,
    ): Promise<string | null> => {
      const fromMessageId = forkAtMessageId ?? '';
      const newId = await forkToSideChat({
        sourceThreadId: parentThreadId,
        fromMessageId,
        includeHistory,
        isSideChat: true,
      });
      if (!newId) return null;
      setSideChats((prev) => (prev.includes(newId) ? prev : [...prev, newId]));
      setActiveSideChatId(newId);
      return newId;
    },
    [],
  );

  const closeSideChat = useCallback((threadId: string) => {
    setSideChats((prev) => {
      const next = prev.filter((id) => id !== threadId);
      return next;
    });
    setActiveSideChatId((prev) => {
      if (prev !== threadId) return prev;
      return null;
    });
  }, []);

  const setActive = useCallback((threadId: string | null) => {
    setActiveSideChatId(threadId);
  }, []);

  return { sideChats, activeSideChatId, openSideChat, closeSideChat, setActive };
}
