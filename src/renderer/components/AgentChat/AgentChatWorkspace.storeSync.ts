/**
 * AgentChatWorkspace.storeSync.ts — Zustand store sync hooks.
 * Extracted from AgentChatWorkspace.tsx to keep that file under 300 lines.
 * Not a public API — import only from AgentChatWorkspace.tsx.
 */
import { useEffect } from 'react';

import { createAgentChatStore } from './agentChatStore';
import type { SlashCommandContext } from './SlashCommandMenu';
import { useAgentChatContext } from './useAgentChatContext';
import type { AgentChatWorkspaceModel } from './useAgentChatWorkspace';

const noop = (): void => undefined;
const noopAsync = async (): Promise<void> => undefined;

function buildReadonlyActions() {
  return {
    onDraftChange: noop,
    onEdit: noopAsync,
    onRetry: noopAsync,
    onBranch: noopAsync,
    onRevert: noopAsync,
    onSend: noopAsync,
    onStop: noopAsync,
    onSelectThread: noop,
    onEditQueuedMessage: noop,
    onDeleteQueuedMessage: noop,
    onSendQueuedMessageNow: noopAsync,
  };
}

function buildWriteActions(model: AgentChatWorkspaceModel) {
  return {
    onDraftChange: model.setDraft,
    onEdit: model.editAndResend,
    onRetry: model.retryMessage,
    onBranch: model.branchFromMessage,
    onRevert: model.revertMessage,
    onSend: model.sendMessage,
    onStop: model.stopTask,
    onSelectThread: model.selectThread,
    onEditQueuedMessage: model.editQueuedMessage,
    onDeleteQueuedMessage: model.deleteQueuedMessage,
    onSendQueuedMessageNow: model.sendQueuedMessageNow,
  };
}

function useSyncStateIntoStore(
  store: ReturnType<typeof createAgentChatStore>,
  model: AgentChatWorkspaceModel,
  context: ReturnType<typeof useAgentChatContext>,
  readOnly: boolean,
): void {
  useEffect(() => {
    store.setState({
      activeThread: model.activeThread,
      threads: model.threads,
      canSend: readOnly ? false : model.canSend,
      draft: readOnly ? '' : model.draft,
      error: model.error,
      hasProject: model.hasProject,
      isLoading: model.isLoading,
      isSending: model.isSending,
      pendingUserMessage: model.pendingUserMessage,
      isDetailsOpen: model.isDetailsOpen,
      details: model.details,
      detailsError: model.detailsError,
      detailsIsLoading: model.detailsIsLoading,
    });
  }, [readOnly, store, model]);

  useEffect(() => {
    store.setState({
      pinnedFiles: context.pinnedFiles,
      contextSummary: context.contextSummary,
      autocompleteResults: context.autocompleteResults,
      isAutocompleteOpen: context.isAutocompleteOpen,
      mentions: context.mentions,
      allFiles: context.allFiles,
      disabledLocalIds: model.disabledLocalIds,
    });
  }, [store, context, model.disabledLocalIds]);
}

function useSyncModelSettingsIntoStore(
  store: ReturnType<typeof createAgentChatStore>,
  model: AgentChatWorkspaceModel,
): void {
  useEffect(() => {
    store.setState({
      chatOverrides: model.chatOverrides,
      settingsModel: model.settingsModel,
      codexSettingsModel: model.codexSettingsModel,
      defaultProvider: model.defaultProvider,
      modelProviders: model.modelProviders,
      codexModels: model.codexModels,
      codexAppServerTransport: model.codexAppServerTransport,
      queuedMessages: model.queuedMessages,
      attachments: model.attachments,
    });
  }, [store, model]);
}

function useSyncActionsIntoStore(
  store: ReturnType<typeof createAgentChatStore>,
  model: AgentChatWorkspaceModel,
  context: ReturnType<typeof useAgentChatContext>,
  readOnly: boolean,
): void {
  useEffect(() => {
    const modeActions = readOnly ? buildReadonlyActions() : buildWriteActions(model);
    store.setState({
      ...modeActions,
      onRerunSuccess: model.selectThread,
      onOpenLinkedDetails: model.openLinkedDetails,
      onOpenLinkedTask: model.openDetailsInOrchestration,
      reloadThreads: model.reloadThreads,
      closeDetails: model.closeDetails,
      onChatOverridesChange: model.setChatOverrides,
      onAttachmentsChange: model.setAttachments,
      onRemoveFile: context.removeFile,
      onAutocompleteQuery: context.setAutocompleteQuery,
      onSelectFile: context.addFile,
      onCloseAutocomplete: context.closeAutocomplete,
      onOpenAutocomplete: context.openAutocomplete,
      onAddMention: context.addMention,
      onRemoveMention: context.removeMention,
      setDisabledLocalIds: model.setDisabledLocalIds,
    });
  }, [readOnly, store, model, context]);
}

export interface WorkspaceStoreSyncArgs {
  store: ReturnType<typeof createAgentChatStore>;
  model: AgentChatWorkspaceModel;
  context: ReturnType<typeof useAgentChatContext>;
  slashCmd: SlashCommandContext;
  readOnly: boolean;
}

export function useWorkspaceStoreSync(args: WorkspaceStoreSyncArgs): void {
  const { store, model, context, slashCmd, readOnly } = args;
  useEffect(() => {
    store.setState({ slashCommandContext: slashCmd });
  }, [store, slashCmd]);
  useSyncStateIntoStore(store, model, context, readOnly);
  useSyncModelSettingsIntoStore(store, model);
  useSyncActionsIntoStore(store, model, context, readOnly);
}
