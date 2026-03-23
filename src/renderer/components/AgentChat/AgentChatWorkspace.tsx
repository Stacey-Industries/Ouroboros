import React, { useCallback, useEffect, useMemo } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { AgentChatConversation } from './AgentChatConversation';
import type { SlashCommandContext } from './SlashCommandMenu';
import { useAgentChatContext } from './useAgentChatContext';
import type { AgentChatWorkspaceModel } from './useAgentChatWorkspace';
import { useAgentChatWorkspace } from './useAgentChatWorkspace';

export interface AgentChatWorkspaceProps {
  projectRoot: string | null;
  onModelReady?: (model: AgentChatWorkspaceModel) => void;
}

function buildSlashCommandContext(
  model: AgentChatWorkspaceModel,
  onRemember: (content: string) => Promise<void>,
  onOpenMemories: () => void,
): SlashCommandContext {
  return {
    onClearChat: model.reloadThreads,
    onNewThread: model.startNewChat,
    onRemember,
    onOpenMemories,
  };
}

function buildConversationThreadProps(model: AgentChatWorkspaceModel): Pick<React.ComponentProps<typeof AgentChatConversation>, 'activeThread' | 'pendingUserMessage' | 'error' | 'hasProject' | 'isDetailsOpen' | 'isLoading' | 'isSending' | 'draft' | 'closeDetails' | 'details' | 'detailsError' | 'detailsIsLoading' | 'canSend'> {
  return {
    activeThread: model.activeThread,
    pendingUserMessage: model.pendingUserMessage,
    error: model.error,
    hasProject: model.hasProject,
    isDetailsOpen: model.isDetailsOpen,
    isLoading: model.isLoading,
    isSending: model.isSending,
    draft: model.draft,
    closeDetails: model.closeDetails,
    details: model.details,
    detailsError: model.detailsError,
    detailsIsLoading: model.detailsIsLoading,
    canSend: model.canSend,
  };
}

function buildConversationContextProps(
  model: AgentChatWorkspaceModel,
  context: ReturnType<typeof useAgentChatContext>,
): Pick<React.ComponentProps<typeof AgentChatConversation>, 'pinnedFiles' | 'onRemoveFile' | 'contextSummary' | 'autocompleteResults' | 'isAutocompleteOpen' | 'onAutocompleteQuery' | 'onSelectFile' | 'onCloseAutocomplete' | 'onOpenAutocomplete' | 'mentions' | 'onAddMention' | 'onRemoveMention' | 'allFiles'> {
  return {
    pinnedFiles: context.pinnedFiles,
    onRemoveFile: context.removeFile,
    contextSummary: context.contextSummary,
    autocompleteResults: context.autocompleteResults,
    isAutocompleteOpen: context.isAutocompleteOpen,
    onAutocompleteQuery: context.setAutocompleteQuery,
    onSelectFile: context.addFile,
    onCloseAutocomplete: context.closeAutocomplete,
    onOpenAutocomplete: context.openAutocomplete,
    mentions: context.mentions,
    onAddMention: context.addMention,
    onRemoveMention: context.removeMention,
    allFiles: context.allFiles,
  };
}

function buildConversationActionProps(model: AgentChatWorkspaceModel, slashCommandContext: SlashCommandContext): Pick<React.ComponentProps<typeof AgentChatConversation>, 'onDraftChange' | 'onEdit' | 'onRetry' | 'onBranch' | 'onRevert' | 'onOpenLinkedDetails' | 'onOpenLinkedTask' | 'onSend' | 'onStop' | 'onSelectThread' | 'chatOverrides' | 'onChatOverridesChange' | 'settingsModel' | 'codexSettingsModel' | 'defaultProvider' | 'modelProviders' | 'codexModels' | 'queuedMessages' | 'onEditQueuedMessage' | 'onDeleteQueuedMessage' | 'onSendQueuedMessageNow' | 'attachments' | 'onAttachmentsChange' | 'slashCommandContext'> {
  return {
    onDraftChange: model.setDraft,
    onEdit: model.editAndResend,
    onRetry: model.retryMessage,
    onBranch: model.branchFromMessage,
    onRevert: model.revertMessage,
    onOpenLinkedDetails: model.openLinkedDetails,
    onOpenLinkedTask: model.openDetailsInOrchestration,
    onSend: model.sendMessage,
    onStop: model.stopTask,
    onSelectThread: model.selectThread,
    chatOverrides: model.chatOverrides,
    onChatOverridesChange: model.setChatOverrides,
    settingsModel: model.settingsModel,
    codexSettingsModel: model.codexSettingsModel,
    defaultProvider: model.defaultProvider,
    modelProviders: model.modelProviders,
    codexModels: model.codexModels,
    queuedMessages: model.queuedMessages,
    onEditQueuedMessage: model.editQueuedMessage,
    onDeleteQueuedMessage: model.deleteQueuedMessage,
    onSendQueuedMessageNow: model.sendQueuedMessageNow,
    attachments: model.attachments,
    onAttachmentsChange: model.setAttachments,
    slashCommandContext,
  };
}

function buildConversationProps(model: AgentChatWorkspaceModel, context: ReturnType<typeof useAgentChatContext>, slashCommandContext: SlashCommandContext): React.ComponentProps<typeof AgentChatConversation> {
  return {
    ...buildConversationThreadProps(model),
    ...buildConversationContextProps(model, context),
    ...buildConversationActionProps(model, slashCommandContext),
  };
}

export function AgentChatWorkspace({ projectRoot, onModelReady }: AgentChatWorkspaceProps): React.ReactElement {
  const model = useAgentChatWorkspace(projectRoot);
  const context = useAgentChatContext(projectRoot, model.activeThreadId);
  const { toast } = useToastContext();

  const onRemember = useCallback(async (content: string) => {
    if (!content.trim()) return;
    try {
      await window.electronAPI.agentChat.createMemory(projectRoot ?? '', {
        type: 'preference',
        content: content.trim(),
        relevantFiles: [],
      });
      toast('Memory saved', 'success');
    } catch (err) {
      console.warn('[agentChat] failed to save memory:', err);
      toast('Failed to save memory', 'error');
    }
  }, [projectRoot, toast]);

  const onOpenMemories = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('agent-ide:switch-sidebar-view', { detail: { view: 'memory' } }),
    );
  }, []);

  useEffect(() => {
    model.setContextFilePaths(context.filePaths);
  }, [context.filePaths, model]);

  const slashCommandContext = useMemo(() => buildSlashCommandContext(model, onRemember, onOpenMemories), [model, onRemember, onOpenMemories]);
  const conversationProps = useMemo(() => buildConversationProps(model, context, slashCommandContext), [model, context, slashCommandContext]);

  useEffect(() => {
    onModelReady?.(model);
  }, [model, onModelReady]);

  return <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-surface-panel"><div className="flex-1 min-h-0 overflow-hidden"><AgentChatConversation {...conversationProps} /></div></div>;
}
