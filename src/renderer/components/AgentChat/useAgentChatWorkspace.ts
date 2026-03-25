/* @refresh reset */
import log from 'electron-log/renderer';
import { type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

import type { SkillDefinition } from '../../../shared/types/rulesAndSkills';
import { useRulesAndSkills } from '../../hooks/useRulesAndSkills';
import type {
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
} from '../../types/electron';
import { buildAgentChatWorkspaceModel, useAgentChatActions } from './agentChatWorkspaceActions';
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
  skills: SkillDefinition[];
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

const DEFAULT_CHAT_OVERRIDES: ChatOverrides = {
  model: '',
  effort: 'medium',
  permissionMode: 'default',
};

let queueIdCounter = 0;

/* ---------- Model settings ---------- */

interface ModelSettingsSetters {
  setSettingsModel: (v: string) => void;
  setCodexSettingsModel: (v: string) => void;
  setDefaultProvider: (v: 'claude-code' | 'codex' | 'anthropic-api') => void;
  setModelProviders: (v: ModelProvider[]) => void;
}

type CfgType = Awaited<ReturnType<typeof window.electronAPI.config.getAll>>;

function getSettingsModel(cfg: CfgType): string {
  return cfg?.claudeCliSettings?.model ?? '';
}
function getCodexSettingsModel(cfg: CfgType): string {
  return cfg?.codexCliSettings?.model ?? '';
}
function getDefaultProvider(cfg: CfgType): 'claude-code' | 'codex' | 'anthropic-api' {
  return cfg?.agentChatSettings?.defaultProvider ?? 'claude-code';
}
function getModelProviders(cfg: CfgType): ModelProvider[] {
  return cfg?.modelProviders ?? [];
}

function applyModelSettingsConfig(cfg: CfgType, setters: ModelSettingsSetters): void {
  setters.setSettingsModel(getSettingsModel(cfg));
  setters.setCodexSettingsModel(getCodexSettingsModel(cfg));
  setters.setDefaultProvider(getDefaultProvider(cfg));
  setters.setModelProviders(getModelProviders(cfg));
}

function useModelSettings() {
  const [settingsModel, setSettingsModel] = useState('');
  const [codexSettingsModel, setCodexSettingsModel] = useState('');
  const [defaultProvider, setDefaultProvider] = useState<'claude-code' | 'codex' | 'anthropic-api'>(
    'claude-code',
  );
  const [modelProviders, setModelProviders] = useState<ModelProvider[]>([]);
  const [codexModels, setCodexModels] = useState<CodexModelOption[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      window.electronAPI.config
        .getAll()
        .then((cfg) =>
          applyModelSettingsConfig(cfg, {
            setSettingsModel,
            setCodexSettingsModel,
            setDefaultProvider,
            setModelProviders,
          }),
        )
        .catch((error) => {
          log.error('Failed to load config:', error);
        });
      window.electronAPI.codex
        .listModels()
        .then(setCodexModels)
        .catch((error) => {
          log.error('Failed to load Codex models:', error);
        });
    }
  }, []);

  return { settingsModel, codexSettingsModel, defaultProvider, modelProviders, codexModels };
}

/* ---------- Per-thread overrides ---------- */

function usePerThreadOverrides(activeThreadId: string | null) {
  const [chatOverrides, setChatOverridesState] = useState<ChatOverrides>(DEFAULT_CHAT_OVERRIDES);
  const chatOverridesMapRef = useRef<Map<string | null, ChatOverrides>>(new Map());

  const setChatOverrides = useCallback(
    (overrides: ChatOverrides) => {
      setChatOverridesState(overrides);
      chatOverridesMapRef.current.set(activeThreadId, overrides);
    },
    [activeThreadId],
  );

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

function useQueueActions(activeThreadId: string | null, setDraft: (v: string) => void) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const queueMapRef = useRef<Map<string | null, QueuedMessage[]>>(new Map());

  useEffect(() => {
    const saved = queueMapRef.current.get(activeThreadId);
    setQueuedMessages(saved ?? []);
  }, [activeThreadId]);

  const setQueuedMessagesForThread = useCallback(
    (action: SetStateAction<QueuedMessage[]>) => {
      setQueuedMessages((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        queueMapRef.current.set(activeThreadId, next);
        return next;
      });
    },
    [activeThreadId],
  );

  const addToQueue = useCallback((content: string) => {
    setQueuedMessagesForThread((prev) => [
      ...prev,
      { id: `queued-${++queueIdCounter}`, content, queuedAt: Date.now() },
    ]);
  }, [setQueuedMessagesForThread]);

  const editQueuedMessage = useCallback(
    (id: string) => {
      setQueuedMessagesForThread((prev) => {
        const item = prev.find((m) => m.id === id);
        if (item) setDraft(item.content);
        return prev.filter((m) => m.id !== id);
      });
    },
    [setDraft, setQueuedMessagesForThread],
  );

  const deleteQueuedMessage = useCallback((id: string) => {
    setQueuedMessagesForThread((prev) => prev.filter((m) => m.id !== id));
  }, [setQueuedMessagesForThread]);

  return { queuedMessages, setQueuedMessages: setQueuedMessagesForThread, addToQueue, editQueuedMessage, deleteQueuedMessage };
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
  const queue = useQueueActions(threadState.activeThreadId, setDraft);
  const activeThread = useActiveThread(threadState.threads, threadState.activeThreadId);

  useAgentChatEventSubscriptions({
    projectRootRef: threadState.projectRootRef,
    setActiveThreadId: threadState.setActiveThreadId,
    setThreads: threadState.setThreads,
  });

  useAgentChatDraftPersistence(threadState.activeThreadId, draft, setDraft);

  return {
    activeThread,
    attachments,
    contextFilePaths,
    draft,
    isSending,
    pendingUserMessage,
    ...modelSettings,
    ...overrides,
    ...queue,
    setAttachments,
    setContextFilePaths,
    setDraft,
    setIsSending,
    setPendingUserMessage,
    threadState,
  };
}

/* ---------- Public hook ---------- */

function buildActionArgs(controller: ReturnType<typeof useAgentChatWorkspaceController>, projectRoot: string | null, skills: SkillDefinition[]) {
  return { ...controller, projectRoot, activeThread: controller.activeThread, activeThreadId: controller.threadState.activeThreadId, setActiveThreadId: controller.threadState.setActiveThreadId, setError: controller.threadState.setError, setThreads: controller.threadState.setThreads, skills };
}

interface BuildModelArgs { controller: ReturnType<typeof useAgentChatWorkspaceController>; actions: ReturnType<typeof useAgentChatActions>; hooks: ReturnType<typeof useWorkspaceHooks>; projectRoot: string | null; skills: SkillDefinition[]; }
function buildModel(args: BuildModelArgs) {
  const { controller, actions, hooks, projectRoot, skills } = args;
  const ds = hooks.detailsState;
  return buildAgentChatWorkspaceModel({ ...controller, ...actions, ...ds, activeThreadId: controller.threadState.activeThreadId, closeDetails: ds.closeDetails, details: ds.details, detailsError: ds.error, detailsIsLoading: ds.isLoading, error: controller.threadState.error, isDetailsOpen: ds.isOpen, isLoading: controller.threadState.isLoading, openConversationDetails: ds.openDetails, openDetailsInOrchestration: ds.openOrchestration, openLinkedDetails: ds.openDetails, projectRoot, reloadThreads: controller.threadState.reloadThreads, sendMessage: hooks.sendMessage, startNewChat: hooks.startNewChat, threads: controller.threadState.threads, sendQueuedMessageNow: hooks.sendQueuedMessageNow, skills });
}

export function useAgentChatWorkspace(projectRoot: string | null): AgentChatWorkspaceModel {
  const controller = useAgentChatWorkspaceController(projectRoot);
  const { skills } = useRulesAndSkills(projectRoot);
  const actions = useAgentChatActions(buildActionArgs(controller, projectRoot, skills));
  const hooks = useWorkspaceHooks(controller, actions);
  return buildModel({ controller, actions, hooks, projectRoot, skills });
}
