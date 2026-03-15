import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type {
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';
import { emitOrchestrationOpen } from '../../hooks/orchestrationUiHelpers';
import type { AgentChatWorkspaceModel } from './useAgentChatWorkspace';
import { mergeThreadCollection, useThreadSelectionActions } from './agentChatWorkspaceSupport';
import { clearPersistedDraft } from './useAgentChatDraftPersistence';

export interface SendMessageArgs {
  activeThreadId: string | null;
  contextFilePaths?: string[];
  draft: string;
  isSending: boolean;
  projectRoot: string | null;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  setPendingUserMessage: Dispatch<SetStateAction<string | null>>;
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>;
}

export interface AgentChatActionArgs extends SendMessageArgs {
  activeThread: AgentChatThreadRecord | null;
  setError: Dispatch<SetStateAction<string | null>>;
}

interface AgentChatActionState {
  branchFromMessage: (message: AgentChatMessageRecord) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  editAndResend: (message: AgentChatMessageRecord) => Promise<void>;
  openLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  retryMessage: (message: AgentChatMessageRecord) => Promise<void>;
  selectThread: (threadId: string | null) => void;
  sendMessage: () => Promise<void>;
  startNewChat: () => void;
  stopTask: () => Promise<void>;
}

interface BuildWorkspaceModelArgs extends AgentChatActionState {
  activeThread: AgentChatThreadRecord | null;
  activeThreadId: string | null;
  closeDetails: () => void;
  details: AgentChatLinkedDetailsResult | null;
  detailsError: string | null;
  detailsIsLoading: boolean;
  draft: string;
  error: string | null;
  isLoading: boolean;
  isDetailsOpen: boolean;
  isSending: boolean;
  pendingUserMessage: string | null;
  openConversationDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  openDetailsInOrchestration: () => void;
  projectRoot: string | null;
  reloadThreads: () => Promise<void>;
  setContextFilePaths: (paths: string[]) => void;
  setDraft: (value: string) => void;
  threads: AgentChatThreadRecord[];
}

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function resolveLinkedSessionId(link: AgentChatOrchestrationLink): Promise<string | null> {
  if (link.sessionId) {
    return link.sessionId;
  }

  const result = await window.electronAPI.agentChat.getLinkedDetails(link);
  if (!result.success) {
    throw new Error(result.error ?? 'Unable to open linked orchestration details.');
  }

  return result.session?.id ?? result.link?.sessionId ?? null;
}

export function useSendMessageAction(args: SendMessageArgs): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    if (!args.projectRoot || !hasElectronAPI()) {
      args.setError('Open a project before chatting with the agent.');
      return;
    }

    const content = args.draft.trim();
    if (!content || args.isSending) {
      return;
    }

    args.setIsSending(true);
    args.setError(null);
    // Optimistically clear the draft and show the user's message immediately.
    // Context building (the slow part) runs on the main process while the UI
    // already reflects the sent state.
    args.setDraft('');
    args.setPendingUserMessage(content);

    try {
      const contextSelection = args.contextFilePaths && args.contextFilePaths.length > 0
        ? { userSelectedFiles: args.contextFilePaths }
        : undefined;

      const result = await window.electronAPI.agentChat.sendMessage({
        threadId: args.activeThreadId ?? undefined,
        workspaceRoot: args.projectRoot,
        content,
        contextSelection,
        metadata: {
          source: 'composer',
          usedAdvancedControls: Boolean(contextSelection),
        },
      });

      if (!result.success) {
        throw new Error(result.error ?? 'Unable to send the chat message.');
      }

      if (result.thread) {
        args.setThreads((currentThreads) => mergeThreadCollection(currentThreads, result.thread as AgentChatThreadRecord));
        args.setActiveThreadId(result.thread.id);
      }

      clearPersistedDraft(result.thread?.id ?? args.activeThreadId);
    } catch (sendError) {
      args.setError(getErrorMessage(sendError));
    } finally {
      args.setIsSending(false);
      args.setPendingUserMessage(null);
    }
  }, [args]);
}

export function useOpenLinkedDetailsAction(
  setError: Dispatch<SetStateAction<string | null>>,
): (link?: AgentChatOrchestrationLink) => Promise<void> {
  return useCallback(async (link?: AgentChatOrchestrationLink): Promise<void> => {
    if (!link || !hasElectronAPI()) {
      return;
    }

    setError(null);

    try {
      const sessionId = await resolveLinkedSessionId(link);
      if (!sessionId) {
        throw new Error('The linked orchestration session is unavailable.');
      }

      emitOrchestrationOpen(sessionId);
    } catch (detailsError) {
      setError(getErrorMessage(detailsError));
    }
  }, [setError]);
}

export function useDeleteThreadAction(
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>,
  setActiveThreadId: Dispatch<SetStateAction<string | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
): (threadId: string) => Promise<void> {
  return useCallback(async (threadId: string): Promise<void> => {
    if (!hasElectronAPI()) return;

    try {
      const result = await window.electronAPI.agentChat.deleteThread(threadId);
      if (!result.success) {
        throw new Error(result.error ?? 'Unable to delete the chat thread.');
      }

      setThreads((currentThreads) => {
        const remaining = currentThreads.filter((thread) => thread.id !== threadId);
        return remaining;
      });
      setActiveThreadId((currentId) => {
        if (currentId !== threadId) return currentId;
        return null;
      });
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    }
  }, [setThreads, setActiveThreadId, setError]);
}

export function useEditAndResendAction(args: SendMessageArgs): (message: AgentChatMessageRecord) => Promise<void> {
  return useCallback(async (message: AgentChatMessageRecord): Promise<void> => {
    if (!args.projectRoot || !hasElectronAPI()) {
      args.setError('Open a project before chatting with the agent.');
      return;
    }

    const content = message.content.trim();
    if (!content || args.isSending) return;

    args.setIsSending(true);
    args.setError(null);

    try {
      const result = await window.electronAPI.agentChat.sendMessage({
        threadId: args.activeThreadId ?? undefined,
        workspaceRoot: args.projectRoot,
        content,
        metadata: { source: 'composer', usedAdvancedControls: false },
      });

      if (!result.success) {
        throw new Error(result.error ?? 'Unable to send the edited message.');
      }

      if (result.thread) {
        args.setThreads((currentThreads) => mergeThreadCollection(currentThreads, result.thread as AgentChatThreadRecord));
        args.setActiveThreadId(result.thread.id);
      }

      args.setDraft('');
      clearPersistedDraft(result.thread?.id ?? args.activeThreadId);
    } catch (sendError) {
      args.setError(getErrorMessage(sendError));
    } finally {
      args.setIsSending(false);
    }
  }, [args]);
}

export function useRetryMessageAction(args: SendMessageArgs): (message: AgentChatMessageRecord) => Promise<void> {
  return useCallback(async (message: AgentChatMessageRecord): Promise<void> => {
    if (!args.projectRoot || !hasElectronAPI()) {
      args.setError('Open a project before chatting with the agent.');
      return;
    }

    const content = message.content.trim();
    if (!content || args.isSending) return;

    args.setIsSending(true);
    args.setError(null);

    try {
      const result = await window.electronAPI.agentChat.sendMessage({
        threadId: args.activeThreadId ?? undefined,
        workspaceRoot: args.projectRoot,
        content,
        metadata: { source: 'retry', usedAdvancedControls: false },
      });

      if (!result.success) {
        throw new Error(result.error ?? 'Unable to retry the message.');
      }

      if (result.thread) {
        args.setThreads((currentThreads) => mergeThreadCollection(currentThreads, result.thread as AgentChatThreadRecord));
        args.setActiveThreadId(result.thread.id);
      }
    } catch (sendError) {
      args.setError(getErrorMessage(sendError));
    } finally {
      args.setIsSending(false);
    }
  }, [args]);
}

export function useBranchFromMessageAction(
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>,
  setActiveThreadId: Dispatch<SetStateAction<string | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
): (message: AgentChatMessageRecord) => Promise<void> {
  return useCallback(async (message: AgentChatMessageRecord): Promise<void> => {
    if (!hasElectronAPI()) return;

    try {
      const result = await window.electronAPI.agentChat.branchThread(message.threadId, message.id);
      if (!result.success) {
        throw new Error(result.error ?? 'Unable to branch the conversation.');
      }

      if (result.thread) {
        setThreads((currentThreads) => mergeThreadCollection(currentThreads, result.thread as AgentChatThreadRecord));
        setActiveThreadId(result.thread.id);
      }
    } catch (branchError) {
      setError(getErrorMessage(branchError));
    }
  }, [setThreads, setActiveThreadId, setError]);
}

export function useStopTaskAction(
  activeThread: AgentChatThreadRecord | null,
  setError: Dispatch<SetStateAction<string | null>>,
): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    const taskId = activeThread?.latestOrchestration?.taskId;
    if (!taskId || !hasElectronAPI()) return;

    try {
      await window.electronAPI.orchestration.cancelTask(taskId);
    } catch (stopError) {
      setError(getErrorMessage(stopError));
    }
  }, [activeThread, setError]);
}

export function useAgentChatActions(args: AgentChatActionArgs): AgentChatActionState {
  const selectionActions = useThreadSelectionActions(args.setActiveThreadId, args.setError);
  const sendMessage = useSendMessageAction(args);
  const openLinkedDetails = useOpenLinkedDetailsAction(args.setError);
  const deleteThread = useDeleteThreadAction(args.setThreads, args.setActiveThreadId, args.setError);
  const editAndResend = useEditAndResendAction(args);
  const retryMessage = useRetryMessageAction(args);
  const branchFromMessage = useBranchFromMessageAction(args.setThreads, args.setActiveThreadId, args.setError);
  const stopTask = useStopTaskAction(args.activeThread, args.setError);

  return {
    branchFromMessage,
    deleteThread,
    editAndResend,
    openLinkedDetails,
    retryMessage,
    selectThread: selectionActions.selectThread,
    sendMessage,
    startNewChat: selectionActions.startNewChat,
    stopTask,
  };
}

export function buildAgentChatWorkspaceModel(args: BuildWorkspaceModelArgs): AgentChatWorkspaceModel {
  return {
    activeThread: args.activeThread,
    activeThreadId: args.activeThreadId,
    branchFromMessage: args.branchFromMessage,
    canSend: Boolean(args.projectRoot && args.draft.trim()) && !args.isSending,
    pendingUserMessage: args.pendingUserMessage,
    closeDetails: args.closeDetails,
    deleteThread: args.deleteThread,
    details: args.details,
    detailsError: args.detailsError,
    detailsIsLoading: args.detailsIsLoading,
    draft: args.draft,
    editAndResend: args.editAndResend,
    error: args.error,
    hasProject: Boolean(args.projectRoot),
    isDetailsOpen: args.isDetailsOpen,
    isLoading: args.isLoading,
    isSending: args.isSending,
    openConversationDetails: args.openConversationDetails,
    openDetailsInOrchestration: args.openDetailsInOrchestration,
    projectRoot: args.projectRoot,
    retryMessage: args.retryMessage,
    selectThread: args.selectThread,
    sendMessage: args.sendMessage,
    setContextFilePaths: args.setContextFilePaths,
    setDraft: args.setDraft,
    openLinkedDetails: args.openLinkedDetails,
    reloadThreads: args.reloadThreads,
    startNewChat: args.startNewChat,
    stopTask: args.stopTask,
    threads: args.threads,
  };
}
