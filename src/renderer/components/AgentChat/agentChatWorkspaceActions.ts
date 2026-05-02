import { type Dispatch, type SetStateAction, useCallback, useRef } from 'react';

import type { CommandDefinition } from '../../../shared/types/claudeConfig';
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
  getErrorMessage,
  hasElectronAPI,
  mergeReturnedThread,
} from './agentChatWorkspaceActionHelpers';
export type {
  AgentChatActionArgs,
  QueuedResend,
  SendMessageArgs,
} from './agentChatWorkspaceActionHelpers';
import type { AgentChatActionArgs, SendMessageArgs } from './agentChatWorkspaceActionHelpers';
import {
  editAndResendOnBranch,
  executeStopTask,
  resolveLinkedSessionId,
  sendComposerMessage,
  sendResentMessage,
} from './agentChatWorkspaceSendFlows';
export { flushPendingResend } from './agentChatWorkspaceSendFlows';
import { useThreadSelectionActions } from './agentChatWorkspaceSupport';
import type { ChatOverrides } from './ChatControlsBar';
import type { AgentChatWorkspaceModel, QueuedMessage } from './useAgentChatWorkspace';

type AgentChatActionState = {
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
};
type BuildWorkspaceModelArgs = AgentChatActionState & {
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
  codexAppServerTransport: boolean;
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
  setMentionRanges: (
    ranges: import('../../../shared/types/orchestrationDomain').UserSelectedFileRange[],
  ) => void;
  setDraft: (value: string) => void;
  threads: AgentChatThreadRecord[];
  queuedMessages: QueuedMessage[];
  editQueuedMessage: (id: string) => void;
  deleteQueuedMessage: (id: string) => void;
  sendQueuedMessageNow: (id: string) => Promise<void>;
  commands?: CommandDefinition[];
  disabledLocalIds: ReadonlySet<string>;
  setDisabledLocalIds: import('react').Dispatch<
    import('react').SetStateAction<ReadonlySet<string>>
  >;
};

export function useSendMessageAction(args: SendMessageArgs): () => Promise<void> {
  const argsRef = useRef(args);
  argsRef.current = args;
  return useCallback(async () => {
    await sendComposerMessage(argsRef.current);
  }, []);
}
export function useOpenLinkedDetailsAction(
  setError: Dispatch<SetStateAction<string | null>>,
): (link?: AgentChatOrchestrationLink) => Promise<void> {
  return useCallback(
    async (link?: AgentChatOrchestrationLink): Promise<void> => {
      if (!link || !hasElectronAPI()) return;
      setError(null);
      try {
        const sessionId = await resolveLinkedSessionId(link);
        if (!sessionId) throw new Error('The linked orchestration session is unavailable.');
      } catch (detailsError) {
        setError(getErrorMessage(detailsError));
      }
    },
    [setError],
  );
}
export function useDeleteThreadAction(
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>,
  setActiveThreadId: Dispatch<SetStateAction<string | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
): (threadId: string) => Promise<void> {
  return useCallback(
    async (threadId: string): Promise<void> => {
      if (!hasElectronAPI()) return;
      try {
        const result = await window.electronAPI.agentChat.deleteThread(threadId);
        if (!result.success) throw new Error(result.error ?? 'Unable to delete the chat thread.');
        setThreads((currentThreads) => currentThreads.filter((thread) => thread.id !== threadId));
        setActiveThreadId((currentId) => (currentId === threadId ? null : currentId));
      } catch (deleteError) {
        setError(getErrorMessage(deleteError));
      }
    },
    [setActiveThreadId, setError, setThreads],
  );
}
export function useEditAndResendAction(
  args: AgentChatActionArgs,
): (message: AgentChatMessageRecord) => Promise<void> {
  const argsRef = useRef(args);
  argsRef.current = args;
  return useCallback(async (message: AgentChatMessageRecord): Promise<void> => {
    await editAndResendOnBranch(argsRef.current, message);
  }, []);
}
export function useRetryMessageAction(
  args: AgentChatActionArgs,
): (message: AgentChatMessageRecord) => Promise<void> {
  const argsRef = useRef(args);
  argsRef.current = args;
  return useCallback(async (message: AgentChatMessageRecord): Promise<void> => {
    await sendResentMessage(argsRef.current, message, 'retry');
  }, []);
}
export function useBranchFromMessageAction(
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>,
  setActiveThreadId: Dispatch<SetStateAction<string | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
): (message: AgentChatMessageRecord) => Promise<void> {
  return useCallback(
    async (message: AgentChatMessageRecord): Promise<void> => {
      if (!hasElectronAPI()) return;
      try {
        const result = await window.electronAPI.agentChat.branchThread(
          message.threadId,
          message.id,
        );
        if (!result.success) throw new Error(result.error ?? 'Unable to branch the conversation.');
        mergeReturnedThread(result.thread, setThreads, setActiveThreadId);
      } catch (branchError) {
        setError(getErrorMessage(branchError));
      }
    },
    [setActiveThreadId, setError, setThreads],
  );
}
export function useStopTaskAction(args: AgentChatActionArgs): () => Promise<void> {
  const argsRef = useRef(args);
  argsRef.current = args;
  return useCallback(async (): Promise<void> => {
    await executeStopTask(argsRef.current);
  }, []);
}
export function useRevertMessageAction(
  setError: Dispatch<SetStateAction<string | null>>,
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>,
): (message: AgentChatMessageRecord) => Promise<void> {
  return useCallback(
    async (message: AgentChatMessageRecord): Promise<void> => {
      if (!hasElectronAPI()) return;
      if (!message.orchestration?.preSnapshotHash)
        return void setError(
          'No snapshot was captured before this agent turn. Revert is unavailable.',
        );
      try {
        const result = await window.electronAPI.agentChat.revertToSnapshot(
          message.threadId,
          message.id,
        );
        if (!result.success) return void setError(result.error ?? 'Revert failed.');
        const threadsResult = await window.electronAPI.agentChat.listThreads();
        if (threadsResult.success && threadsResult.threads) setThreads(threadsResult.threads);
      } catch (revertError) {
        setError(getErrorMessage(revertError));
      }
    },
    [setError, setThreads],
  );
}
export function useAgentChatActions(args: AgentChatActionArgs): AgentChatActionState {
  const selectionActions = useThreadSelectionActions(args.setActiveThreadId, args.setError);
  const sendMessage = useSendMessageAction(args);
  const openLinkedDetails = useOpenLinkedDetailsAction(args.setError);
  const deleteThread = useDeleteThreadAction(
    args.setThreads,
    args.setActiveThreadId,
    args.setError,
  );
  const editAndResend = useEditAndResendAction(args);
  const retryMessage = useRetryMessageAction(args);
  const revertMessage = useRevertMessageAction(args.setError, args.setThreads);
  const branchFromMessage = useBranchFromMessageAction(
    args.setThreads,
    args.setActiveThreadId,
    args.setError,
  );
  const stopTask = useStopTaskAction(args);
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
export function buildAgentChatWorkspaceModel(
  args: BuildWorkspaceModelArgs,
): AgentChatWorkspaceModel {
  return {
    ...args,
    commands: args.commands ?? [],
    canSend:
      Boolean(args.projectRoot && (args.draft.trim() || args.attachments.length > 0)) &&
      !args.isSending,
    hasProject: Boolean(args.projectRoot),
  };
}
