/* @refresh reset */
import { useCallback, useEffect, useRef,useState } from 'react';

import { EXPLAIN_TERMINAL_ERROR_EVENT } from '../../hooks/appEventNames';
import type {
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
  ImageAttachment,
} from '../../types/electron';
import {
  buildAgentChatWorkspaceModel,
  useAgentChatActions,
} from './agentChatWorkspaceActions';
import {
  useActiveThread,
  useAgentChatEventSubscriptions,
  useThreadState,
} from './agentChatWorkspaceSupport';
import type { ChatOverrides } from './ChatControlsBar';
import { useAgentChatDraftPersistence } from './useAgentChatDraftPersistence';
import { useAgentChatLinkedDetails } from './useAgentChatLinkedDetails';

export interface QueuedMessage {
  id: string;
  content: string;
  queuedAt: number;
}

export interface AgentChatWorkspaceModel {
  activeThread: AgentChatThreadRecord | null;
  activeThreadId: string | null;
  attachments: ImageAttachment[];
  setAttachments: (attachments: ImageAttachment[]) => void;
  branchFromMessage: (message: AgentChatMessageRecord) => Promise<void>;
  canSend: boolean;
  chatOverrides: ChatOverrides;
  setChatOverrides: (overrides: ChatOverrides) => void;
  /** Model ID from settings (for labeling the Default option). */
  settingsModel: string;
  pendingUserMessage: string | null;
  closeDetails: () => void;
  deleteThread: (threadId: string) => Promise<void>;
  details: AgentChatLinkedDetailsResult | null;
  detailsError: string | null;
  detailsIsLoading: boolean;
  draft: string;
  editAndResend: (message: AgentChatMessageRecord) => Promise<void>;
  error: string | null;
  hasProject: boolean;
  isDetailsOpen: boolean;
  isLoading: boolean;
  isSending: boolean;
  openConversationDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  openDetailsInOrchestration: () => void;
  openLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  projectRoot: string | null;
  retryMessage: (message: AgentChatMessageRecord) => Promise<void>;
  revertMessage: (message: AgentChatMessageRecord) => Promise<void>;
  selectThread: (threadId: string | null) => void;
  sendMessage: () => Promise<void>;
  setContextFilePaths: (paths: string[]) => void;
  setDraft: (value: string) => void;
  reloadThreads: () => Promise<void>;
  startNewChat: () => void;
  stopTask: () => Promise<void>;
  threads: AgentChatThreadRecord[];
  /** Messages queued while the agent is working. */
  queuedMessages: QueuedMessage[];
  /** Edit a queued message — moves it back to the draft and removes from queue. */
  editQueuedMessage: (id: string) => void;
  /** Delete a queued message from the queue. */
  deleteQueuedMessage: (id: string) => void;
  /** Interrupt the current task and immediately send the queued message. */
  sendQueuedMessageNow: (id: string) => Promise<void>;
}

const DEFAULT_CHAT_OVERRIDES: ChatOverrides = { model: '', effort: '', permissionMode: 'default' };

let queueIdCounter = 0;

function useAgentChatWorkspaceController(projectRoot: string | null) {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [contextFilePaths, setContextFilePaths] = useState<string[]>([]);
  const [chatOverrides, setChatOverridesState] = useState<ChatOverrides>(DEFAULT_CHAT_OVERRIDES);
  const [settingsModel, setSettingsModel] = useState('');
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const threadState = useThreadState({ projectRoot });

  // Per-thread overrides cache — persists model/effort/mode per thread so switching
  // threads doesn't lose user-selected settings for each chat.
  const chatOverridesMapRef = useRef<Map<string | null, ChatOverrides>>(new Map());

  const setChatOverrides = useCallback((overrides: ChatOverrides) => {
    setChatOverridesState(overrides);
    chatOverridesMapRef.current.set(threadState.activeThreadId, overrides);
  }, [threadState.activeThreadId]);

  // Restore saved overrides when the active thread changes.
  // When a new thread is created (null → new ID), keep current overrides
  // rather than resetting — the user's model/effort/mode selections should
  // carry into the newly-created thread.
  useEffect(() => {
    const saved = chatOverridesMapRef.current.get(threadState.activeThreadId);
    if (saved) {
      setChatOverridesState(saved);
    } else if (threadState.activeThreadId === null) {
      // Starting a fresh "new chat" — reset to defaults
      setChatOverridesState(DEFAULT_CHAT_OVERRIDES);
    }
    // else: new thread just created (null → ID) or switching to thread without
    // saved overrides — keep current overrides as-is so settings don't reset
  }, [threadState.activeThreadId]);

  // Read the configured model from settings once on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      window.electronAPI.config.getAll().then((cfg) => {
        setSettingsModel(cfg?.claudeCliSettings?.model ?? '');
      }).catch((error) => { console.error('[agentChat] Failed to load config for settings model:', error) });
    }
  }, []);
  const activeThread = useActiveThread(threadState.threads, threadState.activeThreadId);

  useAgentChatEventSubscriptions({
    projectRootRef: threadState.projectRootRef,
    setActiveThreadId: threadState.setActiveThreadId,
    setThreads: threadState.setThreads,
  });

  useAgentChatDraftPersistence(threadState.activeThreadId, draft, setDraft);

  const addToQueue = useCallback((content: string) => {
    setQueuedMessages((prev) => [
      ...prev,
      { id: `queued-${++queueIdCounter}`, content, queuedAt: Date.now() },
    ]);
  }, []);

  const editQueuedMessage = useCallback((id: string) => {
    setQueuedMessages((prev) => {
      const item = prev.find((m) => m.id === id);
      if (item) {
        setDraft(item.content);
      }
      return prev.filter((m) => m.id !== id);
    });
  }, [setDraft]);

  const deleteQueuedMessage = useCallback((id: string) => {
    setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return {
    activeThread, addToQueue, attachments, chatOverrides, contextFilePaths, deleteQueuedMessage,
    draft, editQueuedMessage, isSending, pendingUserMessage,
    queuedMessages, setChatOverrides, setAttachments, setContextFilePaths, setDraft, setIsSending,
    setPendingUserMessage, setQueuedMessages, settingsModel, threadState,
  };
}

export function useAgentChatWorkspace(projectRoot: string | null): AgentChatWorkspaceModel {
  const controller = useAgentChatWorkspaceController(projectRoot);

  const sendMessageArgs = {
    activeThread: controller.activeThread,
    activeThreadId: controller.threadState.activeThreadId,
    attachments: controller.attachments,
    setAttachments: controller.setAttachments,
    chatOverrides: controller.chatOverrides,
    contextFilePaths: controller.contextFilePaths,
    draft: controller.draft,
    isSending: controller.isSending,
    projectRoot,
    setActiveThreadId: controller.threadState.setActiveThreadId,
    setDraft: controller.setDraft,
    setError: controller.threadState.setError,
    setIsSending: controller.setIsSending,
    setPendingUserMessage: controller.setPendingUserMessage,
    setThreads: controller.threadState.setThreads,
  };

  const actions = useAgentChatActions(sendMessageArgs);

  // The thread is "busy" when it's submitting or running — this is the real
  // indicator that the agent is working, not the brief isSending IPC flag.
  const threadIsBusy = controller.activeThread?.status === 'submitting' || controller.activeThread?.status === 'running';
  const threadIsBusyRef = useRef(threadIsBusy);
  threadIsBusyRef.current = threadIsBusy;

  // Wrap sendMessage to queue when the thread is busy
  const sendMessage = useCallback(async () => {
    const content = controller.draft.trim();
    const hasAttachments = controller.attachments.length > 0;
    if (!content && !hasAttachments) return;

    if (threadIsBusyRef.current || controller.isSending) {
      // Queue the message instead of sending (attachments-only messages queue as empty content)
      controller.addToQueue(content || '[image attachment]');
      controller.setDraft('');
      return;
    }

    await actions.sendMessage();
  }, [controller.draft, controller.attachments, controller.isSending, controller.addToQueue, controller.setDraft, actions.sendMessage]);

  // Auto-send the next queued message when the thread finishes.
  const queueRef = useRef(controller.queuedMessages);
  queueRef.current = controller.queuedMessages;
  const prevThreadBusyRef = useRef(threadIsBusy);

  // Pending auto-send content is stored in a ref. When set, a deferred effect
  // picks it up and calls sendMessage AFTER React commits the new draft state.
  const pendingAutoSendRef = useRef<string | null>(null);

  useEffect(() => {
    const wasBusy = prevThreadBusyRef.current;
    prevThreadBusyRef.current = threadIsBusy;

    if (wasBusy && !threadIsBusy && !controller.isSending && queueRef.current.length > 0) {
      const next = queueRef.current[0];
      controller.setQueuedMessages((prev) => prev.slice(1));
      // Store content for the deferred send and update draft
      pendingAutoSendRef.current = next.content;
      controller.setDraft(next.content);
    }
  }, [threadIsBusy, controller.isSending, controller.setQueuedMessages, controller.setDraft]);

  // Fire sendMessage once React has committed the queued content as the draft.
  // sendMessage reads latest args via ref, so it's stable across renders.
  useEffect(() => {
    if (pendingAutoSendRef.current !== null && controller.draft === pendingAutoSendRef.current) {
      pendingAutoSendRef.current = null;
      void actions.sendMessage();
    }
  }, [controller.draft, actions.sendMessage]);

  // Safety net: if the draft didn't commit in time, retry after a short delay.
  useEffect(() => {
    if (pendingAutoSendRef.current === null) return;
    const timer = setTimeout(() => {
      if (pendingAutoSendRef.current !== null) {
        const content = pendingAutoSendRef.current;
        pendingAutoSendRef.current = null;
        controller.setDraft(content);
        setTimeout(() => void actions.sendMessage(), 50);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [controller.draft, actions.sendMessage, controller.setDraft]);

  // Interrupt current task and send a queued message immediately.
  // Moves the message to the front of the queue, then stops the task.
  // When the thread transitions out of busy, the auto-send effect picks it up.
  const sendQueuedMessageNow = useCallback(async (id: string) => {
    controller.setQueuedMessages((prev) => {
      const item = prev.find((m) => m.id === id);
      if (!item) return prev;
      return [item, ...prev.filter((m) => m.id !== id)];
    });
    await actions.stopTask();
  }, [controller.setQueuedMessages, actions.stopTask]);

  // Listen for "Explain error" requests from the terminal
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt: string }>).detail;
      if (detail?.prompt) {
        controller.setDraft(detail.prompt);
      }
    };
    window.addEventListener(EXPLAIN_TERMINAL_ERROR_EVENT, handler);
    return () => window.removeEventListener(EXPLAIN_TERMINAL_ERROR_EVENT, handler);
  }, [controller.setDraft]);

  const detailsState = useAgentChatLinkedDetails({ activeThread: controller.activeThread });

  return buildAgentChatWorkspaceModel({
    activeThread: controller.activeThread,
    activeThreadId: controller.threadState.activeThreadId,
    attachments: controller.attachments,
    setAttachments: controller.setAttachments,
    branchFromMessage: actions.branchFromMessage,
    chatOverrides: controller.chatOverrides,
    setChatOverrides: controller.setChatOverrides,
    settingsModel: controller.settingsModel,
    closeDetails: detailsState.closeDetails,
    deleteThread: actions.deleteThread,
    editAndResend: actions.editAndResend,
    details: detailsState.details,
    detailsError: detailsState.error,
    detailsIsLoading: detailsState.isLoading,
    draft: controller.draft,
    error: controller.threadState.error,
    isDetailsOpen: detailsState.isOpen,
    isLoading: controller.threadState.isLoading,
    isSending: controller.isSending,
    pendingUserMessage: controller.pendingUserMessage,
    openConversationDetails: detailsState.openDetails,
    openDetailsInOrchestration: detailsState.openOrchestration,
    openLinkedDetails: detailsState.openDetails,
    projectRoot,
    reloadThreads: controller.threadState.reloadThreads,
    retryMessage: actions.retryMessage,
    revertMessage: actions.revertMessage,
    selectThread: actions.selectThread,
    sendMessage,
    setContextFilePaths: controller.setContextFilePaths,
    setDraft: controller.setDraft,
    startNewChat: actions.startNewChat,
    stopTask: actions.stopTask,
    threads: controller.threadState.threads,
    queuedMessages: controller.queuedMessages,
    editQueuedMessage: controller.editQueuedMessage,
    deleteQueuedMessage: controller.deleteQueuedMessage,
    sendQueuedMessageNow,
  });
}
