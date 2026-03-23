import React, { useMemo } from 'react';

import type {
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { ComposerSection, ConversationBody } from './AgentChatConversationBody';
import { AgentChatDetailsDrawer } from './AgentChatDetailsDrawer';
import { QueuedMessageBanner } from './AgentChatMessageComponents';
import type { ChatOverrides } from './ChatControlsBar';
import type { MentionItem } from './MentionAutocomplete';
import type { SlashCommandContext } from './SlashCommandMenu';
import type { PinnedFile } from './useAgentChatContext';
import { useAgentChatStreaming } from './useAgentChatStreaming';
import type { QueuedMessage } from './useAgentChatWorkspace';

export interface AgentChatConversationProps {
  activeThread: AgentChatThreadRecord | null;
  canSend: boolean;
  closeDetails: () => void;
  details: AgentChatLinkedDetailsResult | null;
  detailsError: string | null;
  detailsIsLoading: boolean;
  draft: string;
  error: string | null;
  hasProject: boolean;
  isDetailsOpen: boolean;
  isLoading: boolean;
  isSending: boolean;
  pendingUserMessage?: string | null;
  onDraftChange: (value: string) => void;
  onEdit: (message: AgentChatMessageRecord) => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert?: (message: AgentChatMessageRecord) => void;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onOpenLinkedTask: () => void;
  onSend: () => Promise<void>;
  onStop?: () => Promise<void>;
  pinnedFiles?: PinnedFile[];
  onRemoveFile?: (path: string) => void;
  contextSummary?: string | null;
  autocompleteResults?: FileEntry[];
  isAutocompleteOpen?: boolean;
  onAutocompleteQuery?: (query: string) => void;
  onSelectFile?: (file: FileEntry) => void;
  onCloseAutocomplete?: () => void;
  onOpenAutocomplete?: () => void;
  mentions?: MentionItem[];
  onAddMention?: (mention: MentionItem) => void;
  onRemoveMention?: (key: string) => void;
  allFiles?: FileEntry[];
  onSelectThread?: (threadId: string) => void;
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  settingsModel?: string;
  codexSettingsModel?: string;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  modelProviders?: ModelProvider[];
  codexModels?: CodexModelOption[];
  slashCommandContext?: SlashCommandContext;
  queuedMessages?: QueuedMessage[];
  onEditQueuedMessage?: (id: string) => void;
  onDeleteQueuedMessage?: (id: string) => void;
  onSendQueuedMessageNow?: (id: string) => Promise<void>;
  attachments?: ImageAttachment[];
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void;
}

/** Per-model context usage entry. */
export interface ModelContextUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function useThreadModelUsage(thread: AgentChatThreadRecord | null | undefined): ModelContextUsage[] | undefined {
  return useMemo(() => {
    if (!thread?.messages) return undefined;
    const perModel = new Map<string, { inputTokens: number; outputTokens: number }>();
    for (const msg of thread.messages) {
      if (!msg.tokenUsage) continue;
      const key = msg.model || '';
      const ex = perModel.get(key);
      if (ex) { ex.inputTokens += msg.tokenUsage.inputTokens; ex.outputTokens += msg.tokenUsage.outputTokens; }
      else { perModel.set(key, { inputTokens: msg.tokenUsage.inputTokens, outputTokens: msg.tokenUsage.outputTokens }); }
    }
    if (perModel.size === 0) return undefined;
    return Array.from(perModel.entries()).map(([model, usage]) => ({ model, ...usage }));
  }, [thread?.messages]);
}

function buildConversationBodyProps(props: AgentChatConversationProps, streaming: ReturnType<typeof useAgentChatStreaming>): React.ComponentProps<typeof ConversationBody> {
  return {
    activeThread: props.activeThread,
    streaming,
    error: props.error,
    hasProject: props.hasProject,
    isSending: props.isSending,
    isLoading: props.isLoading,
    onEdit: props.onEdit,
    onRetry: props.onRetry,
    onBranch: props.onBranch,
    onRevert: props.onRevert,
    onOpenLinkedDetails: props.onOpenLinkedDetails,
    onStop: props.onStop,
    pendingUserMessage: props.pendingUserMessage,
    onSelectThread: props.onSelectThread,
    onDraftChange: props.onDraftChange,
  };
}

function buildComposerSectionProps(
  props: AgentChatConversationProps,
  threadModelUsage: ModelContextUsage[] | undefined,
  streaming: ReturnType<typeof useAgentChatStreaming>,
): React.ComponentProps<typeof ComposerSection> {
  return {
    activeThread: props.activeThread,
    canSend: props.canSend,
    hasProject: props.hasProject,
    draft: props.draft,
    isSending: props.isSending,
    onDraftChange: props.onDraftChange,
    onSend: props.onSend,
    pinnedFiles: props.pinnedFiles,
    onRemoveFile: props.onRemoveFile,
    contextSummary: props.contextSummary,
    autocompleteResults: props.autocompleteResults,
    isAutocompleteOpen: props.isAutocompleteOpen,
    onAutocompleteQuery: props.onAutocompleteQuery,
    onSelectFile: props.onSelectFile,
    onCloseAutocomplete: props.onCloseAutocomplete,
    onOpenAutocomplete: props.onOpenAutocomplete,
    mentions: props.mentions,
    onAddMention: props.onAddMention,
    onRemoveMention: props.onRemoveMention,
    allFiles: props.allFiles,
    chatOverrides: props.chatOverrides,
    onChatOverridesChange: props.onChatOverridesChange,
    settingsModel: props.settingsModel,
    codexSettingsModel: props.codexSettingsModel,
    defaultProvider: props.defaultProvider,
    modelProviders: props.modelProviders,
    codexModels: props.codexModels,
    threadModelUsage,
    streamingTokenUsage: streaming.streamingTokenUsage,
    slashCommandContext: props.slashCommandContext,
    attachments: props.attachments,
    onAttachmentsChange: props.onAttachmentsChange,
  };
}

function hasQueuedMessages(props: AgentChatConversationProps): boolean {
  return Boolean(props.queuedMessages?.length && props.onEditQueuedMessage && props.onDeleteQueuedMessage && props.onSendQueuedMessageNow);
}

export function AgentChatConversation(props: AgentChatConversationProps): React.ReactElement {
  const streaming = useAgentChatStreaming(props.activeThread?.id ?? null);
  const threadModelUsage = useThreadModelUsage(props.activeThread);
  const hasQueue = hasQueuedMessages(props);
  const bodyProps = buildConversationBodyProps(props, streaming);
  const composerProps = buildComposerSectionProps(props, threadModelUsage, streaming);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface-panel">
      <ConversationBody {...bodyProps} />
      {hasQueue && (
        <QueuedMessageBanner
          messages={props.queuedMessages!}
          onEdit={props.onEditQueuedMessage!}
          onDelete={props.onDeleteQueuedMessage!}
          onSendNow={props.onSendQueuedMessageNow!}
        />
      )}
      <ComposerSection {...composerProps} />
      <AgentChatDetailsDrawer
        activeLink={props.details?.link ?? props.activeThread?.latestOrchestration}
        details={props.details}
        error={props.detailsError}
        isLoading={props.detailsIsLoading}
        isOpen={props.isDetailsOpen}
        onClose={props.closeDetails}
        onOpenOrchestration={props.onOpenLinkedTask}
      />
    </div>
  );
}
