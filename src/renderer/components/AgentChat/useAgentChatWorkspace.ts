/* @refresh reset */
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
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
import { isDraftThreadId, useAgentChatDraftPersistence } from './useAgentChatDraftPersistence';
import { useWorkspaceHooks } from './useAgentChatWorkspaceHooks';

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
  codexSettingsModel: string;
  defaultProvider: 'claude-code' | 'codex' | 'anthropic-api';
  /** Configured model providers (non-Anthropic) for the model picker. */
  modelProviders: ModelProvider[];
  codexModels: CodexModelOption[];
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

const DEFAULT_CHAT_OVERRIDES: ChatOverrides = { model: '', effort: 'medium', permissionMode: 'default' };

let queueIdCounter = 0;

/* ---------- Model settings ---------- */

interface ModelSettingsSetters {
  setSettingsModel: (v: string) => void;
  setCodexSettingsModel: (v: string) => void;
  setDefaultProvider: (v: 'claude-code' | 'codex' | 'anthropic-api') => void;
  setModelProviders: (v: ModelProvider[]) => void;
}

type CfgType = Awaited<ReturnType<typeof window.electronAPI.config.getAll>>;

function getSettingsModel(cfg: CfgType): string { return cfg?.claudeCliSettings?.model ?? ''; }
function getCodexSettingsModel(cfg: CfgType): string { return cfg?.codexCliSettings?.model ?? ''; }
function getDefaultProvider(cfg: CfgType): 'claude-code' | 'codex' | 'anthropic-api' {
  return cfg?.agentChatSettings?.defaultProvider ?? 'claude-code';
}
function getModelProviders(cfg: CfgType): ModelProvider[] { return cfg?.modelProviders ?? []; }

function applyModelSettingsConfig(cfg: CfgType, setters: ModelSettingsSetters): void {
  setters.setSettingsModel(getSettingsModel(cfg));
  setters.setCodexSettingsModel(getCodexSettingsModel(cfg));
  setters.setDefaultProvider(getDefaultProvider(cfg));
  setters.setModelProviders(getModelProviders(cfg));
}

function useModelSettings() {
  const [settingsModel, setSettingsModel] = useState('');
  const [codexSettingsModel, setCodexSettingsModel] = useState('');
  const [defaultProvider, setDefaultProvider] = useState<'claude-code' | 'codex' | 'anthropic-api'>('claude-code');
  const [modelProviders, setModelProviders] = useState<ModelProvider[]>([]);
  const [codexModels, setCodexModels] = useState<CodexModelOption[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      window.electronAPI.config.getAll()
        .then((cfg) => applyModelSettingsConfig(cfg, { setSettingsModel, setCodexSettingsModel, setDefaultProvider, setModelProviders }))
        .catch((error) => { console.error('[agentChat] Failed to load config:', error); });
      window.electronAPI.codex.listModels().then(setCodexModels).catch((error) => {
        console.error('[agentChat] Failed to load Codex models:', error);
      });
    }
  }, []);

  return { settingsModel, codexSettingsModel, defaultProvider, modelProviders, codexModels };
}

/* ---------- Per-thread overrides ---------- */

function usePerThreadOverrides(activeThreadId: string | null) {
  const [chatOverrides, setChatOverridesState] = useState<ChatOverrides>(DEFAULT_CHAT_OVERRIDES);
  const chatOverridesMapRef = useRef<Map<string | null, ChatOverrides>>(new Map());

  const setChatOverrides = useCallback((overrides: ChatOverrides) => {
    setChatOverridesState(overrides);
    chatOverridesMapRef.current.set(activeThreadId, overrides);
  }, [activeThreadId]);

  useEffect(() => {
    const saved = chatOverridesMapRef.current.get(activeThreadId);
    if (saved) {
      setChatOverridesState(saved);
    } else if (activeThreadId === null || isDraftThreadId(activeThreadId)) {
      setChatOverridesState(DEFAULT_CHAT_OVERRIDES);
    }
  }, [activeThreadId]);

  return { chatOverrides, setChatOverrides };
}

/* ---------- Queue actions ---------- */

function useQueueActions(setDraft: (v: string) => void) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);

  const addToQueue = useCallback((content: string) => {
    setQueuedMessages((prev) => [
      ...prev,
      { id: `queued-${++queueIdCounter}`, content, queuedAt: Date.now() },
    ]);
  }, []);

  const editQueuedMessage = useCallback((id: string) => {
    setQueuedMessages((prev) => {
      const item = prev.find((m) => m.id === id);
      if (item) setDraft(item.content);
      return prev.filter((m) => m.id !== id);
    });
  }, [setDraft]);

  const deleteQueuedMessage = useCallback((id: string) => {
    setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { queuedMessages, setQueuedMessages, addToQueue, editQueuedMessage, deleteQueuedMessage };
}

/* ---------- Controller ---------- */

function useAgentChatWorkspaceController(projectRoot: string | null) {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [contextFilePaths, setContextFilePaths] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const threadState = useThreadState({ projectRoot });
  const modelSettings = useModelSettings();
  const overrides = usePerThreadOverrides(threadState.activeThreadId);
  const queue = useQueueActions(setDraft);
  const activeThread = useActiveThread(threadState.threads, threadState.activeThreadId);

  useAgentChatEventSubscriptions({
    projectRootRef: threadState.projectRootRef,
    setActiveThreadId: threadState.setActiveThreadId,
    setThreads: threadState.setThreads,
  });

  useAgentChatDraftPersistence(threadState.activeThreadId, draft, setDraft);

  return {
    activeThread, attachments, contextFilePaths,
    draft, isSending, pendingUserMessage,
    ...modelSettings, ...overrides, ...queue,
    setAttachments, setContextFilePaths, setDraft, setIsSending,
    setPendingUserMessage, threadState,
  };
}

/* ---------- Public hook ---------- */

export function useAgentChatWorkspace(projectRoot: string | null): AgentChatWorkspaceModel {
  const controller = useAgentChatWorkspaceController(projectRoot);
  const actions = useAgentChatActions({
    ...controller, projectRoot,
    activeThread: controller.activeThread,
    activeThreadId: controller.threadState.activeThreadId,
    setActiveThreadId: controller.threadState.setActiveThreadId,
    setError: controller.threadState.setError,
    setThreads: controller.threadState.setThreads,
  });
  const { sendMessage, sendQueuedMessageNow, detailsState, startNewChat } = useWorkspaceHooks(controller, actions);

  return buildAgentChatWorkspaceModel({
    ...controller, ...actions, ...detailsState,
    activeThreadId: controller.threadState.activeThreadId,
    closeDetails: detailsState.closeDetails,
    details: detailsState.details,
    detailsError: detailsState.error,
    detailsIsLoading: detailsState.isLoading,
    error: controller.threadState.error,
    isDetailsOpen: detailsState.isOpen,
    isLoading: controller.threadState.isLoading,
    openConversationDetails: detailsState.openDetails,
    openDetailsInOrchestration: detailsState.openOrchestration,
    openLinkedDetails: detailsState.openDetails,
    projectRoot,
    reloadThreads: controller.threadState.reloadThreads,
    sendMessage, startNewChat,
    threads: controller.threadState.threads,
    sendQueuedMessageNow,
  });
}
