import log from 'electron-log/renderer';
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';
import {
  mergeThreadCollection,
  mergeThreadMessage,
  mergeThreadStatus,
} from './agentChatWorkspaceReducers';

interface ThreadStateArgs {
  projectRoot: string | null;
}

interface EventSubscriptionArgs {
  projectRootRef: MutableRefObject<string | null>;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>;
}

interface ReloadThreadsArgs {
  projectRoot: string | null;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>;
}

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pickActiveThreadId(
  threads: AgentChatThreadRecord[],
  currentThreadId: string | null,
): string | null {
  if (currentThreadId && threads.some((thread) => thread.id === currentThreadId)) {
    return currentThreadId;
  }

  return threads[0]?.id ?? null;
}

async function listThreadsForWorkspace(workspaceRoot: string): Promise<AgentChatThreadRecord[]> {
  const result = await window.electronAPI.agentChat.listThreads(workspaceRoot);
  if (!result.success) {
    throw new Error(result.error ?? 'Unable to load chat threads.');
  }

  return result.threads ?? [];
}

async function resumeLatestThreadForWorkspace(
  workspaceRoot: string,
): Promise<AgentChatThreadRecord | null> {
  const result = await window.electronAPI.agentChat.resumeLatestThread(workspaceRoot);
  if (!result.success) {
    throw new Error(result.error ?? 'Unable to resume the latest chat thread.');
  }

  return result.thread ?? null;
}

export function useProjectRootRef(projectRoot: string | null): MutableRefObject<string | null> {
  const projectRootRef = useRef(projectRoot);

  useEffect(() => {
    projectRootRef.current = projectRoot;
  }, [projectRoot]);

  return projectRootRef;
}

export function useActiveThread(
  threads: AgentChatThreadRecord[],
  activeThreadId: string | null,
): AgentChatThreadRecord | null {
  return useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );
}

function useInitialThreadReload(reloadThreads: () => Promise<void>): void {
  useEffect(() => {
    void reloadThreads();
  }, [reloadThreads]);
}

interface ClearOnProjectChangeArgs {
  projectRoot: string | null;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>;
}

/**
 * Wave 82.1 — when the workspace's projectRoot CHANGES (not on first mount,
 * not on add/delete cycles within the same project), immediately clear the
 * visible thread list and active thread so the conversation pane doesn't
 * keep showing chats from the previous project while the async reload runs.
 *
 * This complements the optimistic update in `useReloadThreads` (which avoids
 * the "No chats yet" flash on add/delete within the same project — Wave 82
 * round-2 C1 fix). Project-switch is a meaningful navigation, the brief
 * empty state is correct.
 */
function useClearThreadStateOnProjectChange(args: ClearOnProjectChangeArgs): void {
  const { projectRoot, setActiveThreadId, setThreads } = args;
  const previousProjectRootRef = useRef<string | null>(projectRoot);
  useEffect(() => {
    if (previousProjectRootRef.current === projectRoot) return;
    previousProjectRootRef.current = projectRoot;
    setActiveThreadId(null);
    setThreads([]);
  }, [projectRoot, setActiveThreadId, setThreads]);
}

function useReloadThreads(args: ReloadThreadsArgs): () => Promise<void> {
  const { projectRoot, setActiveThreadId, setError, setIsLoading, setThreads } = args;

  return useCallback(async (): Promise<void> => {
    if (!projectRoot || !hasElectronAPI()) {
      setThreads([]);
      setActiveThreadId(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Wave 82 (post-smoke): do NOT clear threads to [] before refetch.
    // The previous clear-then-fill caused the inner sidebar's chat list to
    // briefly render empty ("No chats yet") on add/delete cycles, producing
    // a perceptible flash. Optimistic update — only setThreads after the
    // new data arrives. setIsLoading guards spinner-bearing surfaces.
    setIsLoading(true);
    setError(null);

    try {
      const latestThread = await resumeLatestThreadForWorkspace(projectRoot);
      const listedThreads = await listThreadsForWorkspace(projectRoot);
      const nextThreads = latestThread
        ? mergeThreadCollection(listedThreads, latestThread)
        : listedThreads;
      setThreads(nextThreads);
      setActiveThreadId(
        (currentThreadId) => latestThread?.id ?? pickActiveThreadId(nextThreads, currentThreadId),
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [projectRoot, setActiveThreadId, setError, setIsLoading, setThreads]);
}

export function useThreadState({ projectRoot }: ThreadStateArgs) {
  const [threads, setThreads] = useState<AgentChatThreadRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const projectRootRef = useProjectRootRef(projectRoot);

  const reloadThreads = useReloadThreads({
    projectRoot,
    setActiveThreadId,
    setError,
    setIsLoading,
    setThreads,
  });

  useClearThreadStateOnProjectChange({ projectRoot, setActiveThreadId, setThreads });
  useInitialThreadReload(reloadThreads);

  return useMemo(
    () => ({
      activeThreadId,
      error,
      isLoading,
      projectRootRef,
      reloadThreads,
      setActiveThreadId,
      setError,
      setThreads,
      threads,
    }),
    [activeThreadId, error, isLoading, projectRootRef, reloadThreads, threads],
  );
}

function subscribeThreadUpdates(
  args: EventSubscriptionArgs,
): ReturnType<typeof window.electronAPI.agentChat.onThreadUpdate> {
  const { projectRootRef, setActiveThreadId, setThreads } = args;
  return window.electronAPI.agentChat.onThreadUpdate((thread) => {
    if (thread.workspaceRoot !== projectRootRef.current) return;
    log.info(
      'onThreadUpdate:',
      thread.id,
      'messages:',
      thread.messages.length,
      'status:',
      thread.status,
      'ids:',
      thread.messages.map((m) => `${m.role}:${m.id.slice(-6)}`).join(', '),
    );
    setThreads((currentThreads) => {
      const existing = currentThreads.find((t) => t.id === thread.id);
      if (existing && existing.messages.length > thread.messages.length) {
        log.warn(
          'INCOMING THREAD HAS FEWER MESSAGES!',
          'existing:',
          existing.messages.length,
          'incoming:',
          thread.messages.length,
        );
      }
      return mergeThreadCollection(currentThreads, thread);
    });
    setActiveThreadId((currentThreadId) => currentThreadId ?? thread.id);
  });
}


export function useAgentChatEventSubscriptions(args: EventSubscriptionArgs): void {
  const { projectRootRef, setActiveThreadId, setThreads } = args;

  useEffect(() => {
    if (!hasElectronAPI()) return undefined;

    const cleanupThread = subscribeThreadUpdates(args);
    const cleanupMessage = window.electronAPI.agentChat.onMessageUpdate((message) => {
      setThreads((currentThreads) => mergeThreadMessage(currentThreads, message));
    });
    const cleanupStatus = window.electronAPI.agentChat.onStatusChange((status) => {
      if (status.workspaceRoot !== projectRootRef.current) return;
      setThreads((currentThreads) => mergeThreadStatus(currentThreads, status));
    });

    return () => {
      cleanupThread();
      cleanupMessage();
      cleanupStatus();
    };
  }, [args, projectRootRef, setActiveThreadId, setThreads]);
}

export function useThreadSelectionActions(
  setActiveThreadId: Dispatch<SetStateAction<string | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const selectThread = useCallback(
    (threadId: string | null) => {
      setActiveThreadId(threadId);
      setError(null);
    },
    [setActiveThreadId, setError],
  );

  const startNewChat = useCallback(() => {
    setActiveThreadId(null);
    setError(null);
  }, [setActiveThreadId, setError]);

  return { selectThread, startNewChat };
}

/* Re-export for consumers that import mergeThreadCollection from this module */
export { mergeThreadCollection } from './agentChatWorkspaceReducers';
