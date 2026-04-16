import log from 'electron-log/renderer';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { SWITCH_SIDEBAR_VIEW_EVENT, TOGGLE_SIDE_CHAT_EVENT } from '../../hooks/appEventNames';
import { useConfig } from '../../hooks/useConfig';
import { useStreamCompletionNotifications } from '../../hooks/useStreamCompletionNotifications';
import type { ToastType } from '../../hooks/useToast';
import { AgentChatConversation } from './AgentChatConversation';
import { AgentChatStoreContext, createAgentChatStore } from './agentChatStore';
import { BranchCompareModal, useBranchCompare } from './AgentChatWorkspace.compare';
import { DensityProvider } from './DensityContext';
import { PinnedContextBar } from './PinnedContextBar';
import { SideChatDrawer } from './SideChatDrawer';
import type { SlashCommandContext } from './SlashCommandMenu';
import { buildMentionRanges, useAgentChatContext } from './useAgentChatContext';
import type { AgentChatWorkspaceModel } from './useAgentChatWorkspace';
import { useAgentChatWorkspace } from './useAgentChatWorkspace';
import { useSideChat } from './useSideChat';

export interface AgentChatWorkspaceProps {
  projectRoot: string | null;
  /** Wave 25 — session ID for pinned context; null hides the bar. */
  activeSessionId?: string | null;
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
      threads: model.threads,
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
      onRerunSuccess: model.selectThread,
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

/* ── Workspace helpers ───────────────────────────────────────────────────── */

function useWorkspaceNotifications(): void {
  const { config } = useConfig();
  useStreamCompletionNotifications(config);
}

function useLastMessageId(model: AgentChatWorkspaceModel): string {
  const messages = model.activeThread?.messages ?? [];
  const last = messages[messages.length - 1];
  return last?.id ?? '';
}

interface SideChatDrawerState {
  sideChat: ReturnType<typeof useSideChat>;
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function useSideChatDrawer(model: AgentChatWorkspaceModel): SideChatDrawerState {
  const sideChat = useSideChat();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const lastMessageId = useLastMessageId(model);

  const handleToggle = useCallback(() => {
    if (!isDrawerOpen) {
      setIsDrawerOpen(true);
      if (sideChat.sideChats.length === 0 && model.activeThreadId) {
        void sideChat.openSideChat(model.activeThreadId, lastMessageId, false);
      }
    } else {
      setIsDrawerOpen(false);
    }
  }, [isDrawerOpen, sideChat, model.activeThreadId, lastMessageId]);

  useEffect(() => {
    window.addEventListener(TOGGLE_SIDE_CHAT_EVENT, handleToggle);
    return () => window.removeEventListener(TOGGLE_SIDE_CHAT_EVENT, handleToggle);
  }, [handleToggle]);

  return { sideChat, isDrawerOpen, setIsDrawerOpen };
}

function useWorkspaceSlashCmd(
  model: AgentChatWorkspaceModel,
  onRemember: (content: string) => Promise<void>,
  onOpenMemories: () => void,
  onSpec: (name: string) => void,
): SlashCommandContext {
  // Wave 25 Phase C — research.explicit defaults to true.
  // Phase E will wire this to config.research?.explicit once that key is added.
  return useMemo<SlashCommandContext>(
    () => ({
      onClearChat: model.reloadThreads, onNewThread: model.startNewChat,
      onRemember, onOpenMemories, onSpec, commands: model.commands,
      researchEnabled: true,
    }),
    [model, onRemember, onOpenMemories, onSpec],
  );
}

/* ── Workspace component ─────────────────────────────────────────────────── */

interface WorkspaceWiringArgs {
  model: AgentChatWorkspaceModel;
  context: ReturnType<typeof useAgentChatContext>;
  store: ReturnType<typeof createAgentChatStore>;
  onModelReady: AgentChatWorkspaceProps['onModelReady'];
  onRemember: (c: string) => Promise<void>;
  onOpenMemories: () => void;
  onSpec: (n: string) => void;
  activeSessionId?: string | null;
}

function useWorkspaceWiring(args: WorkspaceWiringArgs): void {
  const { model, context, store, onModelReady, onRemember, onOpenMemories, onSpec } = args;
  const { setContextFilePaths, setMentionRanges } = model;
  useEffect(() => { setContextFilePaths(context.filePaths); }, [context.filePaths, setContextFilePaths]);
  useEffect(() => { setMentionRanges(buildMentionRanges(context.mentions)); }, [context.mentions, setMentionRanges]);
  useEffect(() => { onModelReady?.(model); }, [model, onModelReady]);
  const slashCmd = useWorkspaceSlashCmd(model, onRemember, onOpenMemories, onSpec);
  useWorkspaceStoreSync(store, model, context, slashCmd);
  const { activeSessionId } = args;
  useEffect(() => { store.setState({ activeSessionId: activeSessionId ?? null }); }, [store, activeSessionId]);
}

function useWorkspaceActions(
  projectRoot: string | null,
  sideChat: ReturnType<typeof useSideChat>,
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>,
): { onRemember: (c: string) => Promise<void>; onSpec: (n: string) => void; onOpenMemories: () => void; onCloseTab: (id: string) => void } {
  const { toast } = useToastContext();
  const onRemember = useRememberAction(projectRoot, toast);
  const onSpec = useSpecAction(projectRoot, toast);
  const onOpenMemories = useCallback(() => {
    window.dispatchEvent(new CustomEvent(SWITCH_SIDEBAR_VIEW_EVENT, { detail: { view: 'memory' } }));
  }, []);
  const onCloseTab = useCallback((id: string) => {
    sideChat.closeSideChat(id);
    if (sideChat.sideChats.length <= 1) setIsDrawerOpen(false);
  }, [sideChat, setIsDrawerOpen]);
  return { onRemember, onSpec, onOpenMemories, onCloseTab };
}

export function AgentChatWorkspace({
  projectRoot,
  activeSessionId = null,
  onModelReady,
}: AgentChatWorkspaceProps): React.ReactElement {
  const model = useAgentChatWorkspace(projectRoot);
  const context = useAgentChatContext(projectRoot, model.activeThreadId);
  const store = useRef(createAgentChatStore()).current;
  useWorkspaceNotifications();

  const { sideChat, isDrawerOpen, setIsDrawerOpen } = useSideChatDrawer(model);
  const { compareState, closeCompare } = useBranchCompare();
  const { onRemember, onSpec, onOpenMemories, onCloseTab } = useWorkspaceActions(projectRoot, sideChat, setIsDrawerOpen);
  useWorkspaceWiring({ model, context, store, onModelReady, onRemember, onOpenMemories, onSpec, activeSessionId });

  return (
    <AgentChatStoreContext.Provider value={store}>
      <DensityProvider>
        <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-surface-panel">
          <PinnedContextBar activeSessionId={activeSessionId} />
          <div className="flex-1 min-h-0 overflow-hidden"><AgentChatConversation /></div>
        </div>
        <SideChatDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          sideChats={sideChat.sideChats}
          activeSideChatId={sideChat.activeSideChatId}
          onSelect={sideChat.setActive}
          onCloseTab={onCloseTab}
        />
        {compareState && <BranchCompareModal compareState={compareState} onClose={closeCompare} />}
      </DensityProvider>
    </AgentChatStoreContext.Provider>
  );
}
