import { useState } from 'react';
import type {
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';
import {
  useActiveThread,
  useAgentChatEventSubscriptions,
  useThreadState,
} from './agentChatWorkspaceSupport';
import {
  buildAgentChatWorkspaceModel,
  useAgentChatActions,
} from './agentChatWorkspaceActions';
import { useAgentChatLinkedDetails } from './useAgentChatLinkedDetails';
import { useAgentChatDraftPersistence } from './useAgentChatDraftPersistence';

export interface AgentChatWorkspaceModel {
  activeThread: AgentChatThreadRecord | null;
  activeThreadId: string | null;
  branchFromMessage: (message: AgentChatMessageRecord) => Promise<void>;
  canSend: boolean;
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
  selectThread: (threadId: string | null) => void;
  sendMessage: () => Promise<void>;
  setContextFilePaths: (paths: string[]) => void;
  setDraft: (value: string) => void;
  reloadThreads: () => Promise<void>;
  startNewChat: () => void;
  stopTask: () => Promise<void>;
  threads: AgentChatThreadRecord[];
}

function useAgentChatWorkspaceController(projectRoot: string | null) {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [contextFilePaths, setContextFilePaths] = useState<string[]>([]);
  const threadState = useThreadState({ projectRoot });
  const activeThread = useActiveThread(threadState.threads, threadState.activeThreadId);

  useAgentChatEventSubscriptions({
    projectRootRef: threadState.projectRootRef,
    setActiveThreadId: threadState.setActiveThreadId,
    setThreads: threadState.setThreads,
  });

  useAgentChatDraftPersistence(threadState.activeThreadId, draft, setDraft);

  return { activeThread, contextFilePaths, draft, isSending, pendingUserMessage, setContextFilePaths, setDraft, setIsSending, setPendingUserMessage, threadState };
}

export function useAgentChatWorkspace(projectRoot: string | null): AgentChatWorkspaceModel {
  const controller = useAgentChatWorkspaceController(projectRoot);

  const actions = useAgentChatActions({
    activeThread: controller.activeThread,
    activeThreadId: controller.threadState.activeThreadId,
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
  });

  const detailsState = useAgentChatLinkedDetails({ activeThread: controller.activeThread });

  return buildAgentChatWorkspaceModel({
    activeThread: controller.activeThread,
    activeThreadId: controller.threadState.activeThreadId,
    branchFromMessage: actions.branchFromMessage,
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
    selectThread: actions.selectThread,
    sendMessage: actions.sendMessage,
    setContextFilePaths: controller.setContextFilePaths,
    setDraft: controller.setDraft,
    startNewChat: actions.startNewChat,
    stopTask: actions.stopTask,
    threads: controller.threadState.threads,
  });
}
