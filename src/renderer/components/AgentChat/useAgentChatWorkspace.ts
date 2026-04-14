/* @refresh reset */
import { useMemo,useState } from 'react';

import type { CommandDefinition } from '../../../shared/types/claudeConfig';
import type { UserSelectedFileRange } from '../../../shared/types/orchestrationDomain';
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
import { useAgentChatDraftPersistence } from './useAgentChatDraftPersistence';
import { usePerThreadOverrides } from './useAgentChatWorkspace.overrides';
import { useQueueActions } from './useAgentChatWorkspace.queue';
import { useModelSettings } from './useAgentChatWorkspace.settings';
import { useWorkspaceHooks } from './useAgentChatWorkspaceHooks';

export { resolveChatOverridesForThread } from './useAgentChatWorkspace.overrides';
export type { QueuedMessage } from './useAgentChatWorkspace.queue';

export interface AgentChatWorkspaceModel {
  activeThread: AgentChatThreadRecord | null;
  activeThreadId: string | null;
  attachments: ImageAttachment[];
  setAttachments: (attachments: ImageAttachment[]) => void;
  commands: CommandDefinition[];
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
  setMentionRanges: (ranges: UserSelectedFileRange[]) => void;
  setDraft: (value: string) => void;
  reloadThreads: () => Promise<void>;
  startNewChat: () => void;
  stopTask: () => Promise<void>;
  threads: AgentChatThreadRecord[];
  /** Messages queued while the agent is working. */
  queuedMessages: import('./useAgentChatWorkspace.queue').QueuedMessage[];
  /** Edit a queued message — moves it back to the draft and removes from queue. */
  editQueuedMessage: (id: string) => void;
  /** Delete a queued message from the queue. */
  deleteQueuedMessage: (id: string) => void;
  /** Interrupt the current task and immediately send the queued message. */
  sendQueuedMessageNow: (id: string) => Promise<void>;
}

/* ---------- Controller ---------- */

function useControllerState() {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [contextFilePaths, setContextFilePaths] = useState<string[]>([]);
  const [mentionRanges, setMentionRanges] = useState<UserSelectedFileRange[]>([]);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  return {
    draft, setDraft, isSending, setIsSending,
    pendingUserMessage, setPendingUserMessage,
    contextFilePaths, setContextFilePaths,
    mentionRanges, setMentionRanges,
    attachments, setAttachments,
  };
}

function useAgentChatWorkspaceController(projectRoot: string | null) {
  const state = useControllerState();
  const threadState = useThreadState({ projectRoot });
  const modelSettings = useModelSettings();
  const activeThread = useActiveThread(threadState.threads, threadState.activeThreadId);
  const overrides = usePerThreadOverrides(
    threadState.activeThreadId,
    activeThread?.latestOrchestration?.model,
    activeThread?.latestOrchestration?.effort,
  );
  const queue = useQueueActions(threadState.activeThreadId, state.setDraft);

  useAgentChatEventSubscriptions({
    projectRootRef: threadState.projectRootRef,
    setActiveThreadId: threadState.setActiveThreadId,
    setThreads: threadState.setThreads,
  });

  useAgentChatDraftPersistence(threadState.activeThreadId, state.draft, state.setDraft);

  return { activeThread, ...state, ...modelSettings, ...overrides, ...queue, threadState };
}

/* ---------- Public hook ---------- */

function buildActionArgs(
  controller: ReturnType<typeof useAgentChatWorkspaceController>,
  projectRoot: string | null,
) {
  return {
    ...controller,
    projectRoot,
    activeThread: controller.activeThread,
    activeThreadId: controller.threadState.activeThreadId,
    setActiveThreadId: controller.threadState.setActiveThreadId,
    setError: controller.threadState.setError,
    setThreads: controller.threadState.setThreads,
  };
}

interface BuildModelArgs {
  controller: ReturnType<typeof useAgentChatWorkspaceController>;
  actions: ReturnType<typeof useAgentChatActions>;
  hooks: ReturnType<typeof useWorkspaceHooks>;
  projectRoot: string | null;
  commands: CommandDefinition[];
}

function buildModel(args: BuildModelArgs) {
  const { controller, actions, hooks, projectRoot, commands } = args;
  const ds = hooks.detailsState;
  return buildAgentChatWorkspaceModel({
    ...controller,
    ...actions,
    ...ds,
    activeThreadId: controller.threadState.activeThreadId,
    closeDetails: ds.closeDetails,
    details: ds.details,
    detailsError: ds.error,
    detailsIsLoading: ds.isLoading,
    error: controller.threadState.error,
    isDetailsOpen: ds.isOpen,
    isLoading: controller.threadState.isLoading,
    openConversationDetails: ds.openDetails,
    openDetailsInOrchestration: ds.openOrchestration,
    openLinkedDetails: ds.openDetails,
    projectRoot,
    reloadThreads: controller.threadState.reloadThreads,
    sendMessage: hooks.sendMessage,
    startNewChat: hooks.startNewChat,
    threads: controller.threadState.threads,
    sendQueuedMessageNow: hooks.sendQueuedMessageNow,
    commands,
  });
}

export function useAgentChatWorkspace(projectRoot: string | null): AgentChatWorkspaceModel {
  const controller = useAgentChatWorkspaceController(projectRoot);
  const { commands } = useRulesAndSkills(projectRoot);
  const actions = useAgentChatActions(buildActionArgs(controller, projectRoot));
  const hooks = useWorkspaceHooks(controller, actions);
  return useMemo(
    () => buildModel({ controller, actions, hooks, projectRoot, commands }),
    [controller, actions, hooks, projectRoot, commands],
  );
}
