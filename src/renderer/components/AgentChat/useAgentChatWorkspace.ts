/* @refresh reset */
import log from 'electron-log/renderer';
import { useEffect, useMemo, useRef, useState } from 'react';

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
import {
  buildAgentChatWorkspaceModel,
  flushPendingResend,
  type QueuedResend,
  useAgentChatActions,
} from './agentChatWorkspaceActions';
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
  codexAppServerTransport: boolean;
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
  /** Wave 71 — popover-local toggles (file:<path>, mention:<i>:<label>). */
  disabledLocalIds: ReadonlySet<string>;
  setDisabledLocalIds: import('react').Dispatch<
    import('react').SetStateAction<ReadonlySet<string>>
  >;
}

/* ---------- Controller ---------- */

function useControllerState() {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [contextFilePaths, setContextFilePaths] = useState<string[]>([]);
  const [mentionRanges, setMentionRanges] = useState<UserSelectedFileRange[]>([]);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [disabledLocalIds, setDisabledLocalIds] = useState<ReadonlySet<string>>(new Set());
  const pendingResendRef = useRef<QueuedResend | null>(null);
  // Memoize so the controller-level useMemo can detect stability — without
  // this, a fresh object literal every render cascades into model + slashCmd
  // re-creation and triggers an infinite Zustand setState loop in storeSync.
  return useMemo(
    () => ({
      draft,
      setDraft,
      isSending,
      setIsSending,
      pendingUserMessage,
      setPendingUserMessage,
      contextFilePaths,
      setContextFilePaths,
      mentionRanges,
      setMentionRanges,
      attachments,
      setAttachments,
      disabledLocalIds,
      setDisabledLocalIds,
      pendingResendRef,
    }),
    [
      draft,
      isSending,
      pendingUserMessage,
      contextFilePaths,
      mentionRanges,
      attachments,
      disabledLocalIds,
    ],
  );
}

function usePendingUserMessageClearEffect(
  pendingUserMessage: string | null,
  setPendingUserMessage: (next: string | null) => void,
  activeThread: AgentChatThreadRecord | null | undefined,
): void {
  // Clear pendingUserMessage once the persisted turn contains a matching
  // user message. Without this, the optimistic bubble disappears the moment
  // isSending flips to false — which leaves the user's prompt invisible
  // during the window before thread_snapshot lands, and makes the next
  // assistant turn look like it rendered "above" the user's prompt.
  useEffect(() => {
    if (!pendingUserMessage || !activeThread) return;
    for (let i = activeThread.messages.length - 1; i >= 0; i--) {
      const m = activeThread.messages[i];
      if (m.role !== 'user') continue;
      const matched = m.content === pendingUserMessage;
      log.info(
        '[trace:chat-order] pendingUserClearEffect',
        'thread:',
        activeThread.id.slice(-6),
        'lastUserId:',
        m.id.slice(-6),
        'matched:',
        matched,
        'pendingPreview:',
        pendingUserMessage.slice(0, 40),
        'lastUserPreview:',
        m.content.slice(0, 40),
      );
      if (matched) setPendingUserMessage(null);
      return;
    }
    log.info(
      '[trace:chat-order] pendingUserClearEffect',
      'thread:',
      activeThread.id.slice(-6),
      'outcome:',
      'no user message in thread yet',
      'pendingPreview:',
      pendingUserMessage.slice(0, 40),
    );
  }, [activeThread, pendingUserMessage, setPendingUserMessage]);
}

function useAgentChatWorkspaceController(projectRoot: string | null, readOnly: boolean) {
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

  // Always call unconditionally (rules-of-hooks). When readOnly, pass null threadId and '' draft so
  // persistence is a no-op that never contaminates the real per-thread draft storage.
  useAgentChatDraftPersistence(
    readOnly ? null : threadState.activeThreadId,
    readOnly ? '' : state.draft,
    state.setDraft,
  );
  usePendingUserMessageClearEffect(
    state.pendingUserMessage,
    state.setPendingUserMessage,
    activeThread,
  );

  // Without this memo, the controller object is reconstructed every render,
  // which cascades through buildActionArgs → useAgentChatActions → buildModel
  // → slashCmd → useWorkspaceStoreSync, producing an infinite render loop.
  return useMemo(
    () => ({ activeThread, ...state, ...modelSettings, ...overrides, ...queue, threadState }),
    [activeThread, state, modelSettings, overrides, queue, threadState],
  );
}

/**
 * When the user tries to edit/retry while the agent is busy, the action is
 * stashed in pendingResendRef instead of rejected. This effect flushes that
 * queued action as soon as the thread transitions out of running/submitting,
 * so the edit actually fires instead of being silently dropped.
 */
function useFlushPendingResend(
  controller: ReturnType<typeof useAgentChatWorkspaceController>,
  projectRoot: string | null,
): void {
  const status = controller.activeThread?.status;
  const isBusy = status === 'running' || status === 'submitting';
  const wasBusyRef = useRef(isBusy);
  const argsRef = useRef<ReturnType<typeof buildActionArgs> | null>(null);
  argsRef.current = buildActionArgs(controller, projectRoot);
  useEffect(() => {
    if (wasBusyRef.current && !isBusy && controller.pendingResendRef.current && argsRef.current) {
      void flushPendingResend(argsRef.current);
    }
    wasBusyRef.current = isBusy;
  }, [isBusy, controller.pendingResendRef]);
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

function usePreferredThreadSelection(
  threadState: ReturnType<typeof useThreadState>,
  preferredThreadId?: string | null,
): void {
  const { activeThreadId, setActiveThreadId, threads } = threadState;

  useEffect(() => {
    if (!preferredThreadId) return;
    if (!threads.some((thread) => thread.id === preferredThreadId)) return;
    if (activeThreadId === preferredThreadId) return;
    setActiveThreadId(preferredThreadId);
  }, [activeThreadId, preferredThreadId, setActiveThreadId, threads]);
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

export function useAgentChatWorkspace(
  projectRoot: string | null,
  preferredThreadId?: string | null,
  readOnly = false,
): AgentChatWorkspaceModel {
  const controller = useAgentChatWorkspaceController(projectRoot, readOnly);
  const { commands } = useRulesAndSkills(projectRoot);
  const actionArgs = useMemo(
    () => buildActionArgs(controller, projectRoot),
    [controller, projectRoot],
  );
  const actions = useAgentChatActions(actionArgs);
  const hooks = useWorkspaceHooks(controller, actions);
  useFlushPendingResend(controller, projectRoot);
  usePreferredThreadSelection(controller.threadState, preferredThreadId);

  return useMemo(
    () => buildModel({ controller, actions, hooks, projectRoot, commands }),
    [controller, actions, hooks, projectRoot, commands],
  );
}
