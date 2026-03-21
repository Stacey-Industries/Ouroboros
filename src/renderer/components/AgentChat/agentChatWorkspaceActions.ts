import { type Dispatch, type SetStateAction,useCallback, useRef } from 'react';

import { SAVE_ALL_DIRTY_EVENT } from '../../hooks/appEventNames';
import type {
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
} from '../../types/electron';
import { mergeThreadCollection, useThreadSelectionActions } from './agentChatWorkspaceSupport';
import type { ChatOverrides } from './ChatControlsBar';
import { clearPersistedDraft } from './useAgentChatDraftPersistence';
import type { AgentChatWorkspaceModel, QueuedMessage } from './useAgentChatWorkspace';

export interface SendMessageArgs {
  activeThreadId: string | null;
  attachments?: ImageAttachment[];
  setAttachments?: Dispatch<SetStateAction<ImageAttachment[]>>;
  chatOverrides?: ChatOverrides;
  codexModels?: CodexModelOption[];
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
  revertMessage: (message: AgentChatMessageRecord) => Promise<void>;
  selectThread: (threadId: string | null) => void;
  sendMessage: () => Promise<void>;
  startNewChat: () => void;
  stopTask: () => Promise<void>;
}

interface BuildWorkspaceModelArgs extends AgentChatActionState {
  activeThread: AgentChatThreadRecord | null;
  activeThreadId: string | null;
  attachments: ImageAttachment[];
  setAttachments: (attachments: ImageAttachment[]) => void;
  chatOverrides: ChatOverrides;
  setChatOverrides: (overrides: ChatOverrides) => void;
  settingsModel: string;
  codexSettingsModel: string;
  defaultProvider: 'claude-code' | 'codex' | 'anthropic-api';
  modelProviders: ModelProvider[];
  codexModels: CodexModelOption[];
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
  queuedMessages: QueuedMessage[];
  editQueuedMessage: (id: string) => void;
  deleteQueuedMessage: (id: string) => void;
  sendQueuedMessageNow: (id: string) => Promise<void>;
}

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

function isCodexModel(model: string | undefined, codexModels: CodexModelOption[] | undefined): boolean {
  if (!model) return false;
  return (codexModels ?? []).some((entry) => entry.id === model);
}

/**
 * Dispatch a DOM event that asks the FileViewerManager to save all dirty
 * editor buffers.  Returns a promise that resolves once every dirty file
 * has been flushed to disk (or immediately if there are none).
 */
async function saveAllDirtyBuffers(): Promise<void> {
  const promises: Promise<void>[] = [];
  window.dispatchEvent(
    new CustomEvent(SAVE_ALL_DIRTY_EVENT, {
      detail: { addPromise: (p: Promise<void>) => promises.push(p) },
    }),
  );
  if (promises.length > 0) {
    await Promise.all(promises);
  }
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
  const argsRef = useRef(args);
  argsRef.current = args;

  return useCallback(async (): Promise<void> => {
    const a = argsRef.current;
    if (!a.projectRoot || !hasElectronAPI()) {
      a.setError('Open a project before chatting with the agent.');
      return;
    }

    const content = a.draft.trim();
    if ((!content && !(a.attachments?.length)) || a.isSending) {
      return;
    }

    a.setIsSending(true);
    a.setError(null);
    // Optimistically clear the draft and show the user's message immediately.
    // Context building (the slow part) runs on the main process while the UI
    // already reflects the sent state.
    a.setDraft('');
    a.setPendingUserMessage(content);

    // Yield a frame so React can flush the optimistic UI (pending bubble +
    // streaming indicator) before we enter potentially slow IPC calls.
    const t0 = performance.now();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    console.log('[agentChat:timing] rAF yield:', (performance.now() - t0).toFixed(0), 'ms');

    try {
      // Flush dirty editor buffers to disk so Claude Code reads fresh content.
      const t1 = performance.now();
      await saveAllDirtyBuffers();
      console.log('[agentChat:timing] saveAllDirtyBuffers:', (performance.now() - t1).toFixed(0), 'ms');

      const contextSelection = a.contextFilePaths && a.contextFilePaths.length > 0
        ? { userSelectedFiles: a.contextFilePaths }
        : undefined;

      const overrides: Record<string, string | undefined> = {};
      const selectedModel = a.chatOverrides?.model;
      if (selectedModel) {
        overrides.provider = isCodexModel(selectedModel, a.codexModels) ? 'codex' : 'claude-code';
      }
      if (selectedModel) overrides.model = selectedModel;
      if (a.chatOverrides?.effort) overrides.effort = a.chatOverrides.effort;
      if (a.chatOverrides?.permissionMode && a.chatOverrides.permissionMode !== 'default') {
        overrides.permissionMode = a.chatOverrides.permissionMode;
      }

      const t2 = performance.now();
      const result = await window.electronAPI.agentChat.sendMessage({
        threadId: a.activeThreadId ?? undefined,
        workspaceRoot: a.projectRoot,
        content,
        attachments: a.attachments?.length ? a.attachments : undefined,
        contextSelection,
        overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        metadata: {
          source: 'composer',
          usedAdvancedControls: Boolean(contextSelection),
        },
      });
      console.log('[agentChat:timing] IPC sendMessage:', (performance.now() - t2).toFixed(0), 'ms');
      console.log('[agentChat:timing] total send path:', (performance.now() - t0).toFixed(0), 'ms');

      if (!result.success) {
        throw new Error(result.error ?? 'Unable to send the chat message.');
      }

      // Clear attachments after successful send
      a.setAttachments?.([]);

      if (result.thread) {
        const rt = result.thread as AgentChatThreadRecord;
        console.log('[agentChat:debug] IPC result thread:', rt.id,
          'messages:', rt.messages.length,
          'ids:', rt.messages.map(m => `${m.role}:${m.id.slice(-6)}`).join(', '));
        const t3 = performance.now();
        a.setThreads((currentThreads) => mergeThreadCollection(currentThreads, rt));
        a.setActiveThreadId(rt.id);
        console.log('[agentChat:timing] setState calls:', (performance.now() - t3).toFixed(0), 'ms');
      }

      // Clear the optimistic bubble only after the thread has been merged —
      // React 18 batches these so both update in a single render.
      a.setPendingUserMessage(null);
      // Measure how long until React actually renders
      const t4 = performance.now();
      requestAnimationFrame(() => {
        console.log('[agentChat:timing] time-to-render after send:', (performance.now() - t4).toFixed(0), 'ms');
      });
      clearPersistedDraft(result.thread?.id ?? a.activeThreadId);
    } catch (sendError) {
      a.setError(getErrorMessage(sendError));
      // Restore the draft so the user doesn't lose their message on failure.
      a.setDraft(content);
      a.setPendingUserMessage(null);
    } finally {
      a.setIsSending(false);
    }
  }, []);
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

      // Orchestration panel removed — linked details are now surfaced in chat
      console.log('[agent-chat] linked orchestration session:', sessionId);
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

export function useEditAndResendAction(args: AgentChatActionArgs): (message: AgentChatMessageRecord) => Promise<void> {
  const argsRef = useRef(args);
  argsRef.current = args;

  return useCallback(async (message: AgentChatMessageRecord): Promise<void> => {
    const a = argsRef.current;
    if (!a.projectRoot || !hasElectronAPI()) {
      a.setError('Open a project before chatting with the agent.');
      return;
    }

    const content = message.content.trim();
    if (!content || a.isSending) return;

    const threadStatus = a.activeThread?.status;
    if (threadStatus === 'running' || threadStatus === 'submitting') {
      a.setError('The agent is still working. Wait for it to finish or stop it first.');
      return;
    }

    a.setIsSending(true);
    a.setError(null);

    try {
      await saveAllDirtyBuffers();

      const result = await window.electronAPI.agentChat.sendMessage({
        threadId: a.activeThreadId ?? undefined,
        workspaceRoot: a.projectRoot,
        content,
        metadata: { source: 'composer', usedAdvancedControls: false },
      });

      if (!result.success) {
        throw new Error(result.error ?? 'Unable to send the edited message.');
      }

      if (result.thread) {
        a.setThreads((currentThreads) => mergeThreadCollection(currentThreads, result.thread as AgentChatThreadRecord));
        a.setActiveThreadId(result.thread.id);
      }

      a.setDraft('');
      clearPersistedDraft(result.thread?.id ?? a.activeThreadId);
    } catch (sendError) {
      a.setError(getErrorMessage(sendError));
    } finally {
      a.setIsSending(false);
    }
  }, []);
}

export function useRetryMessageAction(args: AgentChatActionArgs): (message: AgentChatMessageRecord) => Promise<void> {
  const argsRef = useRef(args);
  argsRef.current = args;

  return useCallback(async (message: AgentChatMessageRecord): Promise<void> => {
    const a = argsRef.current;
    if (!a.projectRoot || !hasElectronAPI()) {
      a.setError('Open a project before chatting with the agent.');
      return;
    }

    const content = message.content.trim();
    if (!content || a.isSending) return;

    const threadStatus = a.activeThread?.status;
    if (threadStatus === 'running' || threadStatus === 'submitting') {
      a.setError('The agent is still working. Wait for it to finish or stop it first.');
      return;
    }

    a.setIsSending(true);
    a.setError(null);

    try {
      await saveAllDirtyBuffers();

      const result = await window.electronAPI.agentChat.sendMessage({
        threadId: a.activeThreadId ?? undefined,
        workspaceRoot: a.projectRoot,
        content,
        metadata: { source: 'retry', usedAdvancedControls: false },
      });

      if (!result.success) {
        throw new Error(result.error ?? 'Unable to retry the message.');
      }

      if (result.thread) {
        a.setThreads((currentThreads) => mergeThreadCollection(currentThreads, result.thread as AgentChatThreadRecord));
        a.setActiveThreadId(result.thread.id);
      }
    } catch (sendError) {
      a.setError(getErrorMessage(sendError));
    } finally {
      a.setIsSending(false);
    }
  }, []);
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
      // Route through agentChat.cancelTask which uses the singleton
      // orchestration that actually owns the running process.
      await window.electronAPI.agentChat.cancelTask(taskId);
    } catch (stopError) {
      setError(getErrorMessage(stopError));
    }
  }, [activeThread, setError]);
}

export function useRevertMessageAction(
  setError: Dispatch<SetStateAction<string | null>>,
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>,
): (message: AgentChatMessageRecord) => Promise<void> {
  return useCallback(async (message: AgentChatMessageRecord): Promise<void> => {
    if (!hasElectronAPI()) return;
    if (!message.orchestration?.preSnapshotHash) {
      setError('No snapshot was captured before this agent turn. Revert is unavailable.');
      return;
    }

    try {
      const result = await window.electronAPI.agentChat.revertToSnapshot(message.threadId, message.id);
      if (!result.success) {
        setError(result.error ?? 'Revert failed.');
        return;
      }

      // Refresh the thread list so the UI reflects the reverted file state
      const threadsResult = await window.electronAPI.agentChat.listThreads();
      if (threadsResult.success && threadsResult.threads) {
        setThreads(threadsResult.threads);
      }
    } catch (revertError) {
      setError(getErrorMessage(revertError));
    }
  }, [setError, setThreads]);
}

export function useAgentChatActions(args: AgentChatActionArgs): AgentChatActionState {
  const selectionActions = useThreadSelectionActions(args.setActiveThreadId, args.setError);
  const sendMessage = useSendMessageAction(args);
  const openLinkedDetails = useOpenLinkedDetailsAction(args.setError);
  const deleteThread = useDeleteThreadAction(args.setThreads, args.setActiveThreadId, args.setError);
  const editAndResend = useEditAndResendAction(args);
  const retryMessage = useRetryMessageAction(args);
  const revertMessage = useRevertMessageAction(args.setError, args.setThreads);
  const branchFromMessage = useBranchFromMessageAction(args.setThreads, args.setActiveThreadId, args.setError);
  const stopTask = useStopTaskAction(args.activeThread, args.setError);

  return {
    branchFromMessage,
    deleteThread,
    editAndResend,
    openLinkedDetails,
    retryMessage,
    revertMessage,
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
    attachments: args.attachments,
    setAttachments: args.setAttachments,
    branchFromMessage: args.branchFromMessage,
    // Allow sending when the thread is busy — the message will be queued.
    // Only block during the brief IPC send call itself to prevent double-clicks.
    canSend: Boolean(args.projectRoot && (args.draft.trim() || args.attachments.length > 0)) && !args.isSending,
    chatOverrides: args.chatOverrides,
    setChatOverrides: args.setChatOverrides,
    settingsModel: args.settingsModel,
    codexSettingsModel: args.codexSettingsModel,
    defaultProvider: args.defaultProvider,
    modelProviders: args.modelProviders,
    codexModels: args.codexModels,
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
    revertMessage: args.revertMessage,
    selectThread: args.selectThread,
    sendMessage: args.sendMessage,
    setContextFilePaths: args.setContextFilePaths,
    setDraft: args.setDraft,
    openLinkedDetails: args.openLinkedDetails,
    reloadThreads: args.reloadThreads,
    startNewChat: args.startNewChat,
    stopTask: args.stopTask,
    threads: args.threads,
    queuedMessages: args.queuedMessages,
    editQueuedMessage: args.editQueuedMessage,
    deleteQueuedMessage: args.deleteQueuedMessage,
    sendQueuedMessageNow: args.sendQueuedMessageNow,
  };
}
