/**
 * useWorkbenchRailActions — builds WorkbenchRailActions for the WorkbenchRail.
 *
 * Encapsulates IPC calls for session and thread mutations so WorkbenchRail.tsx
 * stays under the 300-line limit.
 */

import { useCallback, useContext, useState } from 'react';

import type { AgentChatThreadRecord } from '../../../types/electron';
import {
  AgentChatStoreContext,
  useAgentChatStoreContext,
} from '../../AgentChat/agentChatStore';
import type { AgentChatStore } from '../../AgentChat/agentChatStore.types';
import type { WorkbenchRailActions } from './WorkbenchRailContextMenu';

// ── Store helpers (mirrors ChatHistorySidebar pattern) ────────────────────────

async function syncThreadsInStore(
  store: ReturnType<typeof useContext<typeof AgentChatStoreContext>> | null,
  workspaceRoot: string | undefined,
): Promise<void> {
  if (!store || !workspaceRoot) return;
  const result = await window.electronAPI?.agentChat?.listThreads?.(workspaceRoot);
  const threads: AgentChatThreadRecord[] =
    result?.success && result.threads ? result.threads : [];
  store.setState((state: AgentChatStore) => ({
    ...state,
    threads,
    activeThread: threads.find((t) => t.id === state.activeThread?.id) ?? null,
  }));
}

function applyLocalDelete(
  store: ReturnType<typeof useContext<typeof AgentChatStoreContext>> | null,
  id: string,
): void {
  if (!store) return;
  store.setState((state: AgentChatStore) => ({
    ...state,
    threads: state.threads.filter((t) => t.id !== id),
    activeThread: state.activeThread?.id === id ? null : state.activeThread,
  }));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseWorkbenchRailActionsResult {
  actions: WorkbenchRailActions;
  renameTarget: AgentChatThreadRecord | null;
  setRenameTarget: (t: AgentChatThreadRecord | null) => void;
}

function useThreadActions(
  store: ReturnType<typeof useContext<typeof AgentChatStoreContext>> | null,
  workspaceRoot: string | undefined,
  setRenameTarget: (t: AgentChatThreadRecord | null) => void,
): Pick<WorkbenchRailActions, 'onDeleteThread' | 'onPinThread' | 'onRenameThread'> {
  const onDeleteThread = useCallback(
    async (threadId: string): Promise<void> => {
      await window.electronAPI?.agentChat?.deleteThread?.(threadId);
      applyLocalDelete(store, threadId);
    },
    [store],
  );
  const onPinThread = useCallback(
    async (threadId: string, pinned: boolean): Promise<void> => {
      await window.electronAPI?.agentChat?.pinThread?.(threadId, pinned);
      await syncThreadsInStore(store, workspaceRoot);
    },
    [store, workspaceRoot],
  );
  const onRenameThread = useCallback(
    (thread: AgentChatThreadRecord): void => {
      setRenameTarget(thread);
    },
    [setRenameTarget],
  );
  return { onDeleteThread, onPinThread, onRenameThread };
}

export function useWorkbenchRailActions(): UseWorkbenchRailActionsResult {
  const store = useContext(AgentChatStoreContext);
  const threads = useAgentChatStoreContext((s) => s.threads);
  const activeThread = useAgentChatStoreContext((s) => s.activeThread);
  const [renameTarget, setRenameTarget] = useState<AgentChatThreadRecord | null>(null);
  const workspaceRoot = activeThread?.workspaceRoot ?? threads[0]?.workspaceRoot;
  const threadActions = useThreadActions(store, workspaceRoot, setRenameTarget);
  const onDeleteSession = useCallback(async (sessionId: string): Promise<void> => {
    await window.electronAPI?.sessionCrud?.delete?.(sessionId);
  }, []);
  const onArchiveSession = useCallback(async (sessionId: string): Promise<void> => {
    await window.electronAPI?.sessionCrud?.archive?.(sessionId);
  }, []);
  return {
    actions: { onDeleteSession, onArchiveSession, ...threadActions },
    renameTarget,
    setRenameTarget,
  };
}
