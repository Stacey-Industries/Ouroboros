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
  type AgentChatStoreInstance,
  useAgentChatStoreContext,
} from '../../AgentChat/agentChatStore';
import type { AgentChatStore } from '../../AgentChat/agentChatStore.types';
import type { WorkbenchRailActions } from './WorkbenchRailContextMenu';

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseWorkbenchRailActionsResult {
  actions: WorkbenchRailActions;
  renameTarget: AgentChatThreadRecord | null;
  setRenameTarget: (t: AgentChatThreadRecord | null) => void;
}

async function listAndApply(store: AgentChatStoreInstance, workspaceRoot: string): Promise<void> {
  const result = await window.electronAPI?.agentChat?.listThreads?.(workspaceRoot);
  const threads: AgentChatThreadRecord[] = result?.success && result.threads ? result.threads : [];
  store.setState((state: AgentChatStore) => ({
    ...state,
    threads,
    activeThread: threads.find((t) => t.id === state.activeThread?.id) ?? null,
  }));
}

async function refreshThreadsAfterMutation(
  store: AgentChatStoreInstance | null,
  workspaceRoot: string | undefined,
  fallbackOnDelete?: (threadId: string) => void,
  threadId?: string,
): Promise<void> {
  const reloadThreads = store?.getState().reloadThreads;
  if (reloadThreads) {
    await reloadThreads();
    return;
  }
  if (store && workspaceRoot) {
    await listAndApply(store, workspaceRoot);
    return;
  }
  if (fallbackOnDelete && threadId !== undefined) fallbackOnDelete(threadId);
}

function useThreadActions(
  store: AgentChatStoreInstance | null,
  workspaceRoot: string | undefined,
  setRenameTarget: (t: AgentChatThreadRecord | null) => void,
): Pick<WorkbenchRailActions, 'onDeleteThread' | 'onPinThread' | 'onRenameThread'> {
  // Wave 82 — route through workspace's canonical action; direct store
  // mutation raced with useSyncStateIntoStore and caused row-flash on delete.
  const onDeleteThread = useCallback(
    async (threadId: string): Promise<void> => {
      const deleteThread = store?.getState().deleteThread;
      if (deleteThread) {
        await deleteThread(threadId);
        return;
      }
      // Fallback: legacy mounts where the workspace action isn't wired.
      const result = await window.electronAPI?.agentChat?.deleteThread?.(threadId);
      if (result && typeof result === 'object' && 'success' in result && result.success === false)
        return;
      await refreshThreadsAfterMutation(store, workspaceRoot, undefined, threadId);
    },
    [store, workspaceRoot],
  );
  const onPinThread = useCallback(
    async (threadId: string, pinned: boolean): Promise<void> => {
      await window.electronAPI?.agentChat?.pinThread?.(threadId, pinned);
      await refreshThreadsAfterMutation(store, workspaceRoot);
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
