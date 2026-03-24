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

    setThreads([]);
    setActiveThreadId(null);
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

  useInitialThreadReload(reloadThreads);

  return {
    activeThreadId,
    error,
    isLoading,
    projectRootRef,
    reloadThreads,
    setActiveThreadId,
    setError,
    setThreads,
    threads,
  };
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

function makeSnapshotHandler(
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>,
): (event: Event) => void {
  return (event: Event) => {
    const thread = (event as CustomEvent).detail as AgentChatThreadRecord | undefined;
    if (!thread || !thread.id) return;
    setThreads((currentThreads) => mergeThreadCollection(currentThreads, thread));
  };
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

    // Listen for thread snapshots from the streaming bridge (DOM event).
    // This fires just before 'complete' so the persisted assistant message
    // appears in the thread before the streaming UI clears.
    const handleSnapshot = makeSnapshotHandler(setThreads);
    window.addEventListener('agent-chat:thread-snapshot', handleSnapshot);

    return () => {
      cleanupThread();
      cleanupMessage();
      cleanupStatus();
      window.removeEventListener('agent-chat:thread-snapshot', handleSnapshot);
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
