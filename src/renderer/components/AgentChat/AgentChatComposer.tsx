import React, { useCallback, useMemo, useRef, useState } from 'react';

import type {
  AgentChatMessageRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import {
  useComposerAutocompleteReset,
  useComposerDraftHandlers,
  useComposerDraftSync,
  useImageAttachmentHandlers,
} from './AgentChatComposerHooks';
import { AttachmentChipsBar, ComposerInput, ComposerMenus } from './AgentChatComposerParts';
import { getComposerRootClassName, noop } from './AgentChatComposerSupport';
import { AgentChatContextBar } from './AgentChatContextBar';
import { ChatControlsBar, type ChatOverrides } from './ChatControlsBar';
import type { MentionItem } from './MentionAutocomplete';
import { MentionChipsBar } from './MentionChip';
import { buildChatSlashCommands, type SlashCommandContext } from './SlashCommandMenu';
import type { PinnedFile } from './useAgentChatContext';

export type AgentChatComposerProps = {
  canSend: boolean;
  disabled: boolean;
  draft: string;
  isSending: boolean;
  threadIsBusy?: boolean;
  messages?: AgentChatMessageRecord[];
  onChange: (value: string) => void;
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
  threadModelUsage?: import('./AgentChatConversation').ModelContextUsage[];
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
  slashCommandContext?: SlashCommandContext;
  attachments?: ImageAttachment[];
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void;
};

/* ---------- ComposerFooter ---------- */

type ComposerFooterProps = {
  chatOverrides?: ChatOverrides;
  codexModels?: CodexModelOption[];
  codexSettingsModel?: string;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  modelProviders?: ModelProvider[];
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  settingsModel?: string;
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
  threadModelUsage?: import('./AgentChatConversation').ModelContextUsage[];
};

function ComposerFooter(props: ComposerFooterProps): React.ReactElement | null {
  return props.chatOverrides && props.onChatOverridesChange ? (
    <ChatControlsBar
      overrides={props.chatOverrides}
      onChange={props.onChatOverridesChange}
      settingsModel={props.settingsModel}
      codexSettingsModel={props.codexSettingsModel}
      defaultProvider={props.defaultProvider}
      providers={props.modelProviders}
      codexModels={props.codexModels}
      threadModelUsage={props.threadModelUsage}
      streamingTokenUsage={props.streamingTokenUsage}
    />
  ) : null;
}

/* ---------- useComposerState ---------- */

type ComposerState = {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  lastSyncedDraft: React.MutableRefObject<string>;
  selectedIndex: number;
  mentionQuery: string | null;
  isMentionAutocompleteOpen: boolean;
  slashQuery: string | null;
  isSlashMenuOpen: boolean;
  useMentionSystem: boolean;
  attachmentHandlers: ReturnType<typeof useImageAttachmentHandlers>;
  slashCommands: ReturnType<typeof buildChatSlashCommands>;
  closeAutocomplete: () => void;
  closeMentionAutocomplete: () => void;
  closeSlashMenu: () => void;
  handlers: ReturnType<typeof useComposerDraftHandlers>;
};

function useComposerState(props: AgentChatComposerProps): ComposerState {
  const {
    draft,
    autocompleteResults = [],
    isAutocompleteOpen = false,
    onAutocompleteQuery,
    onSelectFile,
    onCloseAutocomplete,
    onOpenAutocomplete,
    canSend,
    messages,
    chatOverrides,
    onChatOverridesChange,
    defaultProvider,
    codexModels,
    onChange,
    onSubmit,
    slashCommandContext,
    onAddMention,
    attachments = [],
    onAttachmentsChange,
  } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedDraft = useRef(draft);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [isMentionAutocompleteOpen, setIsMentionAutocompleteOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);
  const useMentionSystem = Boolean(onAddMention);
  const attachmentHandlers = useImageAttachmentHandlers(attachments, onAttachmentsChange);
  const slashCommands = useMemo(
    () => buildChatSlashCommands(slashCommandContext ?? {}),
    [slashCommandContext],
  );
  const closeAutocomplete = useCallback(() => onCloseAutocomplete?.(), [onCloseAutocomplete]);
  const closeMentionAutocomplete = useCallback(() => {
    setIsMentionAutocompleteOpen(false);
    setMentionQuery(null);
  }, []);
  const closeSlashMenu = useCallback(() => {
    setIsSlashMenuOpen(false);
    setSlashQuery(null);
  }, []);
  const handlers = useComposerDraftHandlers({
    textareaRef,
    lastSyncedDraft,
    draft,
    messages,
    canSend,
    isAutocompleteOpen,
    autocompleteResults,
    selectedIndex,
    setSelectedIndex,
    isSlashMenuOpen,
    isMentionAutocompleteOpen,
    useMentionSystem,
    mentionQuery,
    setMentionQuery,
    setIsMentionAutocompleteOpen,
    slashQuery,
    setSlashQuery,
    setIsSlashMenuOpen,
    chatOverrides,
    onChatOverridesChange,
    defaultProvider,
    codexModels,
    onAutocompleteQuery,
    onOpenAutocomplete,
    onCloseAutocomplete,
    onChange,
    onSubmit,
    slashCommandContext,
    onAddMention,
    onSelectFile,
  });
  useComposerDraftSync(textareaRef, lastSyncedDraft, draft);
  useComposerAutocompleteReset(setSelectedIndex, autocompleteResults.length);
  return {
    textareaRef,
    lastSyncedDraft,
    selectedIndex,
    mentionQuery,
    isMentionAutocompleteOpen,
    slashQuery,
    isSlashMenuOpen,
    useMentionSystem,
    attachmentHandlers,
    slashCommands,
    closeAutocomplete,
    closeMentionAutocomplete,
    closeSlashMenu,
    handlers,
  };
}

/* ---------- ComposerMenusSection ---------- */

type ComposerSubProps = { state: ComposerState; composerProps: AgentChatComposerProps };

function ComposerMenusSection({ state, composerProps: cp }: ComposerSubProps): React.ReactElement {
  const { allFiles = [], autocompleteResults = [], isAutocompleteOpen = false, mentions = [] } = cp;
  const { handlers, slashCommands } = state;
  return (
    <ComposerMenus
      allFiles={allFiles}
      autocompleteResults={autocompleteResults}
      handleFileSelect={handlers.handleFileSelect}
      handleMentionSelect={handlers.handleMentionSelect}
      isAutocompleteOpen={isAutocompleteOpen}
      isMentionAutocompleteOpen={state.isMentionAutocompleteOpen}
      isSlashMenuOpen={state.isSlashMenuOpen}
      mentionQuery={state.mentionQuery}
      mentions={mentions}
      onCloseMentionAutocomplete={state.closeMentionAutocomplete}
      onCloseSlashMenu={state.closeSlashMenu}
      onSlashSelect={handlers.handleSlashSelect}
      selectedIndex={state.selectedIndex}
      slashCommands={slashCommands}
      slashQuery={state.slashQuery}
      useMentionSystem={state.useMentionSystem}
    />
  );
}

/* ---------- ComposerBody ---------- */

function ComposerBody({ state, composerProps: cp }: ComposerSubProps): React.ReactElement {
  const {
    canSend,
    disabled,
    draft,
    isSending,
    threadIsBusy = false,
    pinnedFiles = [],
    onRemoveFile,
    contextSummary,
    mentions = [],
    onRemoveMention,
    attachments = [],
    onSubmit,
  } = cp;
  const { attachmentHandlers, handlers } = state;
  const mentionChips = state.useMentionSystem ? (
    <MentionChipsBar
      mentions={mentions}
      onRemove={onRemoveMention ?? noop}
      totalTokens={mentions.reduce((sum, m) => sum + m.estimatedTokens, 0)}
    />
  ) : null;
  return (
    <div className="px-3">
      <AgentChatContextBar
        pinnedFiles={pinnedFiles}
        onRemoveFile={onRemoveFile ?? noop}
        contextSummary={contextSummary ?? null}
      />
      {mentionChips}
      <AttachmentChipsBar
        attachments={attachments}
        onRemove={attachmentHandlers.handleRemoveAttachment}
      />
      <ComposerMenusSection state={state} composerProps={cp} />
      <ComposerInput
        canSend={canSend}
        disabled={disabled}
        draft={draft}
        handleChange={handlers.handleChange}
        handleDragLeave={attachmentHandlers.handleDragLeave}
        handleDragOver={attachmentHandlers.handleDragOver}
        handleDrop={attachmentHandlers.handleDrop}
        handleKeyDown={handlers.handleKeyDown}
        handlePaste={attachmentHandlers.handlePaste}
        isSending={isSending}
        onPickImage={attachmentHandlers.handlePickImage}
        onSubmit={onSubmit}
        threadIsBusy={threadIsBusy}
        textareaRef={state.textareaRef}
        useMentionSystem={state.useMentionSystem}
        onCloseAutocomplete={state.closeAutocomplete}
        onCloseMentionAutocomplete={state.closeMentionAutocomplete}
      />
    </div>
  );
}

/* ---------- AgentChatComposer ---------- */

export function AgentChatComposer(composerProps: AgentChatComposerProps): React.ReactElement {
  const {
    chatOverrides,
    onChatOverridesChange,
    settingsModel,
    codexSettingsModel,
    defaultProvider,
    modelProviders,
    codexModels,
    threadModelUsage,
    streamingTokenUsage,
  } = composerProps;
  const state = useComposerState(composerProps);
  const { attachmentHandlers } = state;
  return (
    <div
      className={getComposerRootClassName(attachmentHandlers.isDragging)}
      onDragOver={attachmentHandlers.handleDragOver}
      onDragLeave={attachmentHandlers.handleDragLeave}
      onDrop={attachmentHandlers.handleDrop}
    >
      <ComposerBody state={state} composerProps={composerProps} />
      <ComposerFooter
        chatOverrides={chatOverrides}
        codexModels={codexModels}
        codexSettingsModel={codexSettingsModel}
        defaultProvider={defaultProvider}
        modelProviders={modelProviders}
        onChatOverridesChange={onChatOverridesChange}
        settingsModel={settingsModel}
        streamingTokenUsage={streamingTokenUsage}
        threadModelUsage={threadModelUsage}
      />
    </div>
  );
}
