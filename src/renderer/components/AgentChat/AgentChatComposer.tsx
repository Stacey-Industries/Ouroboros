import React, { useCallback, useMemo, useRef } from 'react';

import type {
  AgentChatMessageRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { ChatStatusChipRow } from '../Layout/ChatOnlyShell/ChatStatusChipRow';
import {
  buildChatOnlyContextPreviewProps,
  buildComposerContextBarProps,
  toMentionLabels,
} from './AgentChatComposer.helpers';
import {
  pickMenuFields,
  useComposerAutocompleteReset,
  useComposerDraftHandlers,
  useComposerDraftSync,
  useComposerMenuState,
  useImageAttachmentHandlers,
  useQuoteListener,
} from './AgentChatComposerHooks';
import {
  buildComposerFooterProps,
  ComposerContextBar,
  ComposerFooter,
} from './AgentChatComposerParts';
import { ComposerBody } from './AgentChatComposerSubcomponents';
import { useChatActiveThread } from './agentChatSelectors';
import type { ChatOverrides } from './ChatControlsBar';
import { ComposerContextPreview } from './ComposerContextPreview';
import { FloatingComposerContainer } from './FloatingComposerContainer';
import type { SlashState } from './lexicalComposer/SlashCommandPlugin';
import type { MentionItem } from './MentionAutocomplete';
import {
  buildChatSlashCommands,
  type SlashCommand,
  type SlashCommandContext,
} from './SlashCommandMenu';
import type { PinnedFile } from './useAgentChatContext';
import { useWorkspaceVariant } from './WorkspaceVariantContext';

export type AgentChatComposerProps = {
  canSend: boolean;
  disabled: boolean;
  draft: string;
  isSending: boolean;
  threadIsBusy?: boolean;
  messages?: AgentChatMessageRecord[];
  onChange: (value: string) => void;
  onStop?: () => Promise<void>;
  onSubmit: () => Promise<void>;
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
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  settingsModel?: string;
  codexSettingsModel?: string;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  modelProviders?: ModelProvider[];
  codexModels?: CodexModelOption[];
  codexAppServerTransport?: boolean;
  threadModelUsage?: import('./AgentChatConversation').ModelContextUsage[];
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
  isStreaming?: boolean;
  routedBy?: string;
  slashCommandContext?: SlashCommandContext;
  attachments?: ImageAttachment[];
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void;
  /** taskId for mid-turn injection — shows lightning button when streaming. */
  activeMidTurnTaskId?: string | null;
  onInjectMidTurn?: (taskId: string, content: string) => Promise<void>;
  disabledLocalIds?: ReadonlySet<string>;
  setDisabledLocalIds?: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
};

export type ComposerState = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  lastSyncedDraft: React.MutableRefObject<string>;
  selectedIndex: number;
  mentionQuery: string | null;
  isMentionAutocompleteOpen: boolean;
  slashQuery: string | null;
  isSlashMenuOpen: boolean;
  useMentionSystem: boolean;
  attachmentHandlers: ReturnType<typeof useImageAttachmentHandlers>;
  slashCommands: ReturnType<typeof buildChatSlashCommands>;
  slashSelectHandlerRef: React.MutableRefObject<((cmd: SlashCommand) => void) | null>;
  onSlashStateChange: (state: SlashState) => void;
  closeAutocomplete: () => void;
  closeMentionAutocomplete: () => void;
  closeSlashMenu: () => void;
  handlers: ReturnType<typeof useComposerDraftHandlers>;
};

type HandlerRefs = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  lastSyncedDraft: React.MutableRefObject<string>;
  useMentionSystem: boolean;
};

function useComposerHandlers(
  p: AgentChatComposerProps,
  refs: HandlerRefs,
  menu: ReturnType<typeof useComposerMenuState>,
) {
  const { textareaRef, lastSyncedDraft, useMentionSystem } = refs;
  return useComposerDraftHandlers({
    textareaRef,
    lastSyncedDraft,
    draft: p.draft,
    messages: p.messages,
    canSend: p.canSend,
    isAutocompleteOpen: p.isAutocompleteOpen ?? false,
    autocompleteResults: p.autocompleteResults ?? [],
    selectedIndex: menu.selectedIndex,
    setSelectedIndex: menu.setSelectedIndex,
    isSlashMenuOpen: menu.isSlashMenuOpen,
    isMentionAutocompleteOpen: menu.isMentionAutocompleteOpen,
    useMentionSystem,
    mentionQuery: menu.mentionQuery,
    setMentionQuery: menu.setMentionQuery,
    setIsMentionAutocompleteOpen: menu.setIsMentionAutocompleteOpen,
    slashQuery: menu.slashQuery,
    setSlashQuery: menu.setSlashQuery,
    setIsSlashMenuOpen: menu.setIsSlashMenuOpen,
    chatOverrides: p.chatOverrides,
    onChatOverridesChange: p.onChatOverridesChange,
    defaultProvider: p.defaultProvider,
    codexModels: p.codexModels,
    codexAppServerTransport: p.codexAppServerTransport,
    onAutocompleteQuery: p.onAutocompleteQuery,
    onOpenAutocomplete: p.onOpenAutocomplete,
    onCloseAutocomplete: p.onCloseAutocomplete,
    onChange: p.onChange,
    onSubmit: p.onSubmit,
    slashCommandContext: p.slashCommandContext,
    onAddMention: p.onAddMention,
    onSelectFile: p.onSelectFile,
  });
}

function useSlashState(menu: ReturnType<typeof useComposerMenuState>) {
  const slashSelectHandlerRef = useRef<((cmd: SlashCommand) => void) | null>(null);
  const onSlashStateChange = useCallback(
    (s: SlashState) => {
      menu.setIsSlashMenuOpen(s.isOpen);
      menu.setSlashQuery(s.query);
    },
    [menu],
  );
  return { slashSelectHandlerRef, onSlashStateChange };
}

function useComposerState(props: AgentChatComposerProps): ComposerState {
  const { onCloseAutocomplete, slashCommandContext, attachments, onAttachmentsChange } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedDraft = useRef(props.draft);
  const menuState = useComposerMenuState();
  const useMentionSystem = Boolean(props.onAddMention);
  const { slashSelectHandlerRef, onSlashStateChange } = useSlashState(menuState);
  const attachmentHandlers = useImageAttachmentHandlers(attachments ?? [], onAttachmentsChange, {
    textareaRef,
    lastSyncedDraft,
    onChange: props.onChange,
  });
  const slashCommands = useMemo(
    () => buildChatSlashCommands(slashCommandContext ?? {}),
    [slashCommandContext],
  );
  const closeAutocomplete = useCallback(() => onCloseAutocomplete?.(), [onCloseAutocomplete]);
  const handlers = useComposerHandlers(
    props,
    { textareaRef, lastSyncedDraft, useMentionSystem },
    menuState,
  );
  useComposerDraftSync(textareaRef, lastSyncedDraft, props.draft);
  useComposerAutocompleteReset(
    menuState.setSelectedIndex,
    (props.autocompleteResults ?? []).length,
  );
  return {
    textareaRef,
    lastSyncedDraft,
    slashSelectHandlerRef,
    onSlashStateChange,
    useMentionSystem,
    attachmentHandlers,
    slashCommands,
    closeAutocomplete,
    handlers,
    ...pickMenuFields(menuState),
  };
}

export function AgentChatComposer(composerProps: AgentChatComposerProps): React.ReactElement {
  const state = useComposerState(composerProps);
  useQuoteListener(composerProps.draft, composerProps.onChange);
  const { attachmentHandlers } = state;
  const { chatOverrides, settingsModel, mentions } = composerProps;
  const variant = useWorkspaceVariant();
  const claudeSessionId = useChatActiveThread()?.latestOrchestration?.claudeSessionId;
  const mentionLabels = useMemo(() => toMentionLabels(mentions), [mentions]);
  return (
    <div data-layout="agent-chat-composer" className="px-4 pb-3 pt-1">
      {variant === 'chat-only' && (
        <ComposerContextPreview
          {...buildChatOnlyContextPreviewProps({
            composerProps,
            chatOverrides,
            settingsModel,
            claudeSessionId,
            mentionLabels,
          })}
        />
      )}
      <FloatingComposerContainer
        isDragging={attachmentHandlers.isDragging}
        onDragOver={attachmentHandlers.handleDragOver}
        onDragLeave={attachmentHandlers.handleDragLeave}
        onDrop={attachmentHandlers.handleDrop}
      >
        <ComposerBody state={state} composerProps={composerProps} />
        <ComposerContextBar {...buildComposerContextBarProps(composerProps)} />
        <ComposerFooter {...buildComposerFooterProps(composerProps)} />
      </FloatingComposerContainer>
      {variant === 'chat-only' && <ChatStatusChipRow />}
    </div>
  );
}
