import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type {
  AgentChatMessageRecord,
  AgentChatThreadRecord,
  AgentChatThreadStatusSnapshot,
} from '../../types/electron';

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

function sortThreads(threads: AgentChatThreadRecord[]): AgentChatThreadRecord[] {
  return [...threads].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
    if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
    return left.id.localeCompare(right.id);
  });
}

function sortMessages(messages: AgentChatMessageRecord[]): AgentChatMessageRecord[] {
  return [...messages].sort((left, right) => {
    if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
    return left.id.localeCompare(right.id);
  });
}

export function mergeThreadCollection(
  threads: AgentChatThreadRecord[],
  nextThread: AgentChatThreadRecord,
): AgentChatThreadRecord[] {
  const remainingThreads = threads.filter((thread) => thread.id !== nextThread.id);
  return sortThreads([...remainingThreads, nextThread]);
}

function mergeThreadMessage(
  threads: AgentChatThreadRecord[],
  message: AgentChatMessageRecord,
): AgentChatThreadRecord[] {
  const targetThread = threads.find((thread) => thread.id === message.threadId);
  if (!targetThread) return threads;

  const nextMessages = sortMessages([
    ...targetThread.messages.filter((entry) => entry.id !== message.id),
    message,
  ]);

  return mergeThreadCollection(threads, {
    ...targetThread,
    messages: nextMessages,
    updatedAt: Math.max(targetThread.updatedAt, message.createdAt),
  });
}

function mergeThreadStatus(
  threads: AgentChatThreadRecord[],
  status: AgentChatThreadStatusSnapshot,
): AgentChatThreadRecord[] {
  const targetThread = threads.find((thread) => thread.id === status.threadId);
  if (!targetThread) return threads;

  // Preserve linkedTerminalId from the existing thread when the incoming
  // status update doesn't carry one.  Early session updates fire before
  // the adapter has populated it, so we treat it as a "sticky" field.
  const incoming = status.latestOrchestration;
  const existing = targetThread.latestOrchestration;
  const mergedOrchestration = incoming
    ? {
        ...incoming,
        claudeSessionId: incoming.claudeSessionId ?? existing?.claudeSessionId,
        linkedTerminalId: incoming.linkedTerminalId ?? existing?.linkedTerminalId,
      }
    : existing;

  return mergeThreadCollection(threads, {
    ...targetThread,
    status: status.status,
    latestOrchestration: mergedOrchestration,
    updatedAt: status.updatedAt,
  });
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

async function resumeLatestThreadForWorkspace(workspaceRoot: string): Promise<AgentChatThreadRecord | null> {
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
  const {
    projectRoot,
    setActiveThreadId,
    setError,
    setIsLoading,
    setThreads,
  } = args;

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
      setActiveThreadId((currentThreadId) => latestThread?.id ?? pickActiveThreadId(nextThreads, currentThreadId));
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

export function useAgentChatEventSubscriptions(args: EventSubscriptionArgs): void {
  const { projectRootRef, setActiveThreadId, setThreads } = args;

  useEffect(() => {
    if (!hasElectronAPI()) return undefined;

    const cleanupThread = window.electronAPI.agentChat.onThreadUpdate((thread) => {
      if (thread.workspaceRoot !== projectRootRef.current) return;
      setThreads((currentThreads) => mergeThreadCollection(currentThreads, thread));
      setActiveThreadId((currentThreadId) => currentThreadId ?? thread.id);
    });

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
    const handleSnapshot = (event: Event) => {
      const thread = (event as CustomEvent).detail as AgentChatThreadRecord | undefined;
      if (!thread || !thread.id) return;
      setThreads((currentThreads) => mergeThreadCollection(currentThreads, thread));
    };
    window.addEventListener('agent-chat:thread-snapshot', handleSnapshot);

    return () => {
      cleanupThread();
      cleanupMessage();
      cleanupStatus();
      window.removeEventListener('agent-chat:thread-snapshot', handleSnapshot);
    };
  }, [projectRootRef, setActiveThreadId, setThreads]);
}

export function useThreadSelectionActions(
  setActiveThreadId: Dispatch<SetStateAction<string | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const selectThread = useCallback((threadId: string | null) => {
    setActiveThreadId(threadId);
    setError(null);
  }, [setActiveThreadId, setError]);

  const startNewChat = useCallback(() => {
    setActiveThreadId(null);
    setError(null);
  }, [setActiveThreadId, setError]);

  return { selectThread, startNewChat };
}
