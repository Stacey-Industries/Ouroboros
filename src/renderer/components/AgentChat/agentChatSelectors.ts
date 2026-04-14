/**
 * agentChatSelectors.ts — Selector hooks for the AgentChat zustand store.
 *
 * Grouped by the builder-function boundaries in AgentChatWorkspace:
 * thread, details, context-files, model, queue, actions.
 *
 * Fine-grained single-value selectors are provided for hot-path components
 * (e.g. draft changes on every keystroke) to minimise re-renders.
 */
import { useShallow } from 'zustand/react/shallow';

import { useAgentChatStoreContext } from './agentChatStore';
import type {
  AgentChatActions,
  AgentChatContextFilesState,
  AgentChatDetailsState,
  AgentChatModelState,
  AgentChatQueueState,
  AgentChatSlashState,
  AgentChatThreadState,
} from './agentChatStore.types';

/* ── Group selectors ──────────────────────────────── */

export function useAgentChatThread(): AgentChatThreadState {
  return useAgentChatStoreContext(useShallow((s) => ({
    activeThread: s.activeThread,
    canSend: s.canSend,
    draft: s.draft,
    error: s.error,
    hasProject: s.hasProject,
    isLoading: s.isLoading,
    isSending: s.isSending,
    pendingUserMessage: s.pendingUserMessage,
  })));
}

export function useAgentChatDetails(): AgentChatDetailsState {
  return useAgentChatStoreContext(useShallow((s) => ({
    isDetailsOpen: s.isDetailsOpen,
    details: s.details,
    detailsError: s.detailsError,
    detailsIsLoading: s.detailsIsLoading,
  })));
}

export function useAgentChatContextFiles(): AgentChatContextFilesState {
  return useAgentChatStoreContext(useShallow((s) => ({
    pinnedFiles: s.pinnedFiles,
    contextSummary: s.contextSummary,
    autocompleteResults: s.autocompleteResults,
    isAutocompleteOpen: s.isAutocompleteOpen,
    mentions: s.mentions,
    allFiles: s.allFiles,
    attachments: s.attachments,
  })));
}

export function useAgentChatModel(): AgentChatModelState {
  return useAgentChatStoreContext(useShallow((s) => ({
    chatOverrides: s.chatOverrides,
    settingsModel: s.settingsModel,
    codexSettingsModel: s.codexSettingsModel,
    defaultProvider: s.defaultProvider,
    modelProviders: s.modelProviders,
    codexModels: s.codexModels,
  })));
}

export function useAgentChatQueue(): AgentChatQueueState {
  return useAgentChatStoreContext(useShallow((s) => ({ queuedMessages: s.queuedMessages })));
}

export function useAgentChatSlash(): AgentChatSlashState {
  return useAgentChatStoreContext(useShallow((s) => ({
    slashCommandContext: s.slashCommandContext,
  })));
}

/** Actions selector — action refs in zustand are stable, so this never causes re-renders. */
export function useAgentChatActions(): AgentChatActions {
  return useAgentChatStoreContext(useShallow((s) => ({
    onDraftChange: s.onDraftChange,
    onEdit: s.onEdit,
    onRetry: s.onRetry,
    onBranch: s.onBranch,
    onRevert: s.onRevert,
    onOpenLinkedDetails: s.onOpenLinkedDetails,
    onOpenLinkedTask: s.onOpenLinkedTask,
    onSend: s.onSend,
    onStop: s.onStop,
    closeDetails: s.closeDetails,
    onRemoveFile: s.onRemoveFile,
    onAutocompleteQuery: s.onAutocompleteQuery,
    onSelectFile: s.onSelectFile,
    onCloseAutocomplete: s.onCloseAutocomplete,
    onOpenAutocomplete: s.onOpenAutocomplete,
    onAddMention: s.onAddMention,
    onRemoveMention: s.onRemoveMention,
    onAttachmentsChange: s.onAttachmentsChange,
    onChatOverridesChange: s.onChatOverridesChange,
    onSelectThread: s.onSelectThread,
    onEditQueuedMessage: s.onEditQueuedMessage,
    onDeleteQueuedMessage: s.onDeleteQueuedMessage,
    onSendQueuedMessageNow: s.onSendQueuedMessageNow,
  })));
}

/* ── Fine-grained selectors (hot path) ───────────── */

export const useChatDraft = (): string =>
  useAgentChatStoreContext((s) => s.draft);

export const useChatIsSending = (): boolean =>
  useAgentChatStoreContext((s) => s.isSending);

export const useChatCanSend = (): boolean =>
  useAgentChatStoreContext((s) => s.canSend);

export const useChatActiveThread = () =>
  useAgentChatStoreContext((s) => s.activeThread);

export const useChatIsDetailsOpen = (): boolean =>
  useAgentChatStoreContext((s) => s.isDetailsOpen);

export const useChatHasProject = (): boolean =>
  useAgentChatStoreContext((s) => s.hasProject);
