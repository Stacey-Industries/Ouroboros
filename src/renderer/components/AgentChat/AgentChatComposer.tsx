import React, { useCallback, useMemo, useRef } from 'react';

import type {
  AgentChatMessageRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import {
  pickMenuFields,
  useComposerAutocompleteReset,
  useComposerDraftHandlers,
  useComposerDraftSync,
  useComposerMenuState,
  useImageAttachmentHandlers,
} from './AgentChatComposerHooks';
import {
  AttachmentChipsBar,
  ComposerContextBar,
  ComposerFooter,
  type ComposerFooterProps,
  ComposerInput,
  ComposerMenus,
} from './AgentChatComposerParts';
import { getComposerRootClassName, noop } from './AgentChatComposerSupport';
import { AgentChatContextBar } from './AgentChatContextBar';
import type { ChatOverrides } from './ChatControlsBar';
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
  isStreaming?: boolean;
  routedBy?: string;
  slashCommandContext?: SlashCommandContext;
  attachments?: ImageAttachment[];
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void;
};

/* ---------- useComposerState ---------- */

type ComposerState = {
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
  closeAutocomplete: () => void;
  closeMentionAutocomplete: () => void;
  closeSlashMenu: () => void;
  handlers: ReturnType<typeof useComposerDraftHandlers>;
};

type ComposerRefs = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  lastSyncedDraft: React.MutableRefObject<string>;
};

function useComposerHandlers(
  p: AgentChatComposerProps,
  refs: ComposerRefs,
  menu: ReturnType<typeof useComposerMenuState>,
  useMentionSystem: boolean,
) {
  return useComposerDraftHandlers({
    textareaRef: refs.textareaRef,
    lastSyncedDraft: refs.lastSyncedDraft,
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

function useComposerState(props: AgentChatComposerProps): ComposerState {
  const { onCloseAutocomplete, slashCommandContext, attachments, onAttachmentsChange } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedDraft = useRef(props.draft);
  const menuState = useComposerMenuState();
  const useMentionSystem = Boolean(props.onAddMention);
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
    { textareaRef, lastSyncedDraft },
    menuState,
    useMentionSystem,
  );
  useComposerDraftSync(textareaRef, lastSyncedDraft, props.draft);
  useComposerAutocompleteReset(
    menuState.setSelectedIndex,
    (props.autocompleteResults ?? []).length,
  );
  return {
    textareaRef,
    lastSyncedDraft,
    useMentionSystem,
    attachmentHandlers,
    slashCommands,
    closeAutocomplete,
    handlers,
    ...pickMenuFields(menuState),
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

function ComposerInputSection({ state, composerProps: cp }: ComposerSubProps): React.ReactElement {
  const { attachmentHandlers, handlers } = state;
  return (
    <ComposerInput
      canSend={cp.canSend}
      disabled={cp.disabled}
      draft={cp.draft}
      handleChange={handlers.handleChange}
      handleDragLeave={attachmentHandlers.handleDragLeave}
      handleDragOver={attachmentHandlers.handleDragOver}
      handleDrop={attachmentHandlers.handleDrop}
      handleKeyDown={handlers.handleKeyDown}
      handlePaste={attachmentHandlers.handlePaste}
      isSending={cp.isSending}
      onPickImage={attachmentHandlers.handlePickImage}
      onSubmit={cp.onSubmit}
      threadIsBusy={cp.threadIsBusy ?? false}
      textareaRef={state.textareaRef}
      useMentionSystem={state.useMentionSystem}
      onCloseAutocomplete={state.closeAutocomplete}
      onCloseMentionAutocomplete={state.closeMentionAutocomplete}
    />
  );
}

function ComposerBody({ state, composerProps: cp }: ComposerSubProps): React.ReactElement {
  const mentions = cp.mentions ?? [];
  const totalMentionTokens = mentions.reduce((sum, m) => sum + m.estimatedTokens, 0);
  return (
    <div className="px-3">
      <AgentChatContextBar
        pinnedFiles={cp.pinnedFiles ?? []}
        onRemoveFile={cp.onRemoveFile ?? noop}
        contextSummary={cp.contextSummary ?? null}
      />
      {state.useMentionSystem && (
        <MentionChipsBar
          mentions={mentions}
          onRemove={cp.onRemoveMention ?? noop}
          totalTokens={totalMentionTokens}
        />
      )}
      <AttachmentChipsBar
        attachments={cp.attachments ?? []}
        onRemove={state.attachmentHandlers.handleRemoveAttachment}
      />
      <ComposerMenusSection state={state} composerProps={cp} />
      <ComposerInputSection state={state} composerProps={cp} />
    </div>
  );
}

/* ---------- AgentChatComposer ---------- */

function buildFooterProps(p: AgentChatComposerProps): ComposerFooterProps {
  return {
    chatOverrides: p.chatOverrides,
    codexModels: p.codexModels,
    codexSettingsModel: p.codexSettingsModel,
    defaultProvider: p.defaultProvider,
    modelProviders: p.modelProviders,
    routedBy: p.routedBy,
    settingsModel: p.settingsModel,
    onChatOverridesChange: p.onChatOverridesChange,
    streamingTokenUsage: p.streamingTokenUsage,
    threadModelUsage: p.threadModelUsage,
    isStreaming: p.isStreaming,
  };
}

export function AgentChatComposer(composerProps: AgentChatComposerProps): React.ReactElement {
  const state = useComposerState(composerProps);
  const { attachmentHandlers } = state;
  const { streamingTokenUsage, threadModelUsage, chatOverrides, settingsModel, codexModels } =
    composerProps;
  return (
    <div
      className={getComposerRootClassName(attachmentHandlers.isDragging)}
      onDragOver={attachmentHandlers.handleDragOver}
      onDragLeave={attachmentHandlers.handleDragLeave}
      onDrop={attachmentHandlers.handleDrop}
    >
      <ComposerBody state={state} composerProps={composerProps} />
      <ComposerContextBar
        streamingTokenUsage={streamingTokenUsage}
        threadModelUsage={threadModelUsage}
        selectedModel={chatOverrides?.model}
        settingsModel={settingsModel}
        codexModels={codexModels}
      />
      <ComposerFooter {...buildFooterProps(composerProps)} />
    </div>
  );
}
