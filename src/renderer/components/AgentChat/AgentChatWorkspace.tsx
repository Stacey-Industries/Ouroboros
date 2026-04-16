import log from 'electron-log/renderer';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { SWITCH_SIDEBAR_VIEW_EVENT } from '../../hooks/appEventNames';
import { useConfig } from '../../hooks/useConfig';
import { useStreamCompletionNotifications } from '../../hooks/useStreamCompletionNotifications';
import type { ToastType } from '../../hooks/useToast';
import { AgentChatConversation } from './AgentChatConversation';
import { AgentChatStoreContext, createAgentChatStore } from './agentChatStore';
import { DensityProvider } from './DensityContext';
import type { SlashCommandContext } from './SlashCommandMenu';
import { buildMentionRanges, useAgentChatContext } from './useAgentChatContext';
import type { AgentChatWorkspaceModel } from './useAgentChatWorkspace';
import { useAgentChatWorkspace } from './useAgentChatWorkspace';

export interface AgentChatWorkspaceProps {
  projectRoot: string | null;
  onModelReady?: (model: AgentChatWorkspaceModel) => void;
}

/* ── Sync hooks: push existing hook data into zustand store ──────────────── */

function useSyncStateIntoStore(
  store: ReturnType<typeof createAgentChatStore>,
  model: AgentChatWorkspaceModel,
  context: ReturnType<typeof useAgentChatContext>,
): void {
  useEffect(() => {
    store.setState({
      activeThread: model.activeThread,
      canSend: model.canSend,
      draft: model.draft,
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
  }, [store, model]);

  useEffect(() => {
    store.setState({
      pinnedFiles: context.pinnedFiles,
      contextSummary: context.contextSummary,
      autocompleteResults: context.autocompleteResults,
      isAutocompleteOpen: context.isAutocompleteOpen,
      mentions: context.mentions,
      allFiles: context.allFiles,
    });
  }, [store, context]);
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
      queuedMessages: model.queuedMessages,
      attachments: model.attachments,
    });
  }, [store, model]);
}

function useSyncActionsIntoStore(
  store: ReturnType<typeof createAgentChatStore>,
  model: AgentChatWorkspaceModel,
  context: ReturnType<typeof useAgentChatContext>,
): void {
  useEffect(() => {
    store.setState({
      onDraftChange: model.setDraft,
      onEdit: model.editAndResend,
      onRetry: model.retryMessage,
      onBranch: model.branchFromMessage,
      onRevert: model.revertMessage,
      onOpenLinkedDetails: model.openLinkedDetails,
      onOpenLinkedTask: model.openDetailsInOrchestration,
      onSend: model.sendMessage,
      onStop: model.stopTask,
      closeDetails: model.closeDetails,
      onSelectThread: model.selectThread,
      onChatOverridesChange: model.setChatOverrides,
      onEditQueuedMessage: model.editQueuedMessage,
      onDeleteQueuedMessage: model.deleteQueuedMessage,
      onSendQueuedMessageNow: model.sendQueuedMessageNow,
      onAttachmentsChange: model.setAttachments,
      onRemoveFile: context.removeFile,
      onAutocompleteQuery: context.setAutocompleteQuery,
      onSelectFile: context.addFile,
      onCloseAutocomplete: context.closeAutocomplete,
      onOpenAutocomplete: context.openAutocomplete,
      onAddMention: context.addMention,
      onRemoveMention: context.removeMention,
    });
  }, [store, model, context]);
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function useRememberAction(
  projectRoot: string | null,
  toast: (msg: string, type?: ToastType) => void,
): (content: string) => Promise<void> {
  return useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      try {
        await window.electronAPI.agentChat.createMemory(projectRoot ?? '', {
          type: 'preference',
          content: content.trim(),
          relevantFiles: [],
        });
        toast('Memory saved', 'success');
      } catch (err) {
        log.warn('failed to save memory:', err);
        toast('Failed to save memory', 'error');
      }
    },
    [projectRoot, toast],
  );
}

function useSpecAction(
  projectRoot: string | null,
  toast: (msg: string, type?: ToastType) => void,
): (featureName: string) => void {
  return useCallback(
    (featureName: string) => {
      if (!projectRoot) { toast('Open a project before scaffolding a spec.', 'error'); return; }
      void window.electronAPI.spec.scaffold({ projectRoot, featureName })
        .then((result) => {
          if (!result.success) {
            if (result.collision) {
              toast(`Spec "${featureName}" already exists — not overwritten.`, 'error');
            } else {
              toast(result.error ?? 'Scaffold failed', 'error');
            }
            return;
          }
          for (const filePath of result.files ?? []) {
            window.dispatchEvent(new CustomEvent('agent-ide:open-file', { detail: filePath }));
          }
          toast(`Spec scaffolded: .ouroboros/specs/${result.slug}/`, 'success');
        })
        .catch((err: unknown) => {
          log.warn('[spec] scaffold error:', err);
          toast('Scaffold failed', 'error');
        });
    },
    [projectRoot, toast],
  );
}

/* ── Store sync orchestration ────────────────────────────────────────────── */

function useWorkspaceStoreSync(
  store: ReturnType<typeof createAgentChatStore>,
  model: AgentChatWorkspaceModel,
  context: ReturnType<typeof useAgentChatContext>,
  slashCmd: SlashCommandContext,
): void {
  useEffect(() => { store.setState({ slashCommandContext: slashCmd }); }, [store, slashCmd]);
  useSyncStateIntoStore(store, model, context);
  useSyncModelSettingsIntoStore(store, model);
  useSyncActionsIntoStore(store, model, context);
}

/* ���─ Workspace component ─────────���───────────────────────���───────────────── */

function useWorkspaceNotifications(): void {
  const { config } = useConfig();
  useStreamCompletionNotifications(config);
}

export function AgentChatWorkspace({
  projectRoot,
  onModelReady,
}: AgentChatWorkspaceProps): React.ReactElement {
  const model = useAgentChatWorkspace(projectRoot);
  const context = useAgentChatContext(projectRoot, model.activeThreadId);
  const { toast } = useToastContext();
  const store = useRef(createAgentChatStore()).current;
  useWorkspaceNotifications();

  const onRemember = useRememberAction(projectRoot, toast);
  const onSpec = useSpecAction(projectRoot, toast);
  const onOpenMemories = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(SWITCH_SIDEBAR_VIEW_EVENT, { detail: { view: 'memory' } }),
    );
  }, []);

  const { setContextFilePaths, setMentionRanges } = model;
  useEffect(() => { setContextFilePaths(context.filePaths); }, [context.filePaths, setContextFilePaths]);
  useEffect(() => {
    setMentionRanges(buildMentionRanges(context.mentions));
  }, [context.mentions, setMentionRanges]);
  useEffect(() => { onModelReady?.(model); }, [model, onModelReady]);

  const slashCmd = useMemo<SlashCommandContext>(
    () => ({
      onClearChat: model.reloadThreads, onNewThread: model.startNewChat,
      onRemember, onOpenMemories, onSpec, commands: model.commands,
    }),
    [model, onRemember, onOpenMemories, onSpec],
  );

  useWorkspaceStoreSync(store, model, context, slashCmd);

  return (
    <AgentChatStoreContext.Provider value={store}>
      <DensityProvider>
        <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-surface-panel">
          <div className="flex-1 min-h-0 overflow-hidden"><AgentChatConversation /></div>
        </div>
      </DensityProvider>
    </AgentChatStoreContext.Provider>
  );
}
