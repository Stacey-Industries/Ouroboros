/**
 * AgentChatComposerSubcomponents.tsx — ComposerMenusSection, ComposerInputSection, ComposerBody.
 * Extracted from AgentChatComposer.tsx (Wave 81 Phase D) to keep that file under 300 lines.
 */
import React, { useCallback } from 'react';

import type { ComposerState } from './AgentChatComposer';
import type { AgentChatComposerProps } from './AgentChatComposer';
import { AttachmentChipsBar, ComposerInput, ComposerMenus } from './AgentChatComposerParts';
import { noop } from './AgentChatComposerSupport';
import { AgentChatContextBar } from './AgentChatContextBar';
import { MentionChipsBar } from './MentionChip';
import type { SlashCommand } from './SlashCommandMenu';

export type SubProps = { state: ComposerState; composerProps: AgentChatComposerProps };

export function ComposerMenusSection({ state, composerProps: cp }: SubProps): React.ReactElement {
  const { allFiles = [], autocompleteResults = [], isAutocompleteOpen = false, mentions = [] } = cp;
  const { handlers, slashCommands, slashSelectHandlerRef } = state;
  // Lexical path: delegate to imperative ref. Legacy path: textarea-based handler.
  const onSlashSelect = useCallback(
    (cmd: SlashCommand) =>
      slashSelectHandlerRef.current
        ? slashSelectHandlerRef.current(cmd)
        : handlers.handleSlashSelect(cmd),
    [handlers, slashSelectHandlerRef],
  );
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
      onSlashSelect={onSlashSelect}
      selectedIndex={state.selectedIndex}
      slashCommands={slashCommands}
      slashQuery={state.slashQuery}
      useMentionSystem={state.useMentionSystem}
    />
  );
}

export function ComposerInputSection({ state, composerProps: cp }: SubProps): React.ReactElement {
  const { attachmentHandlers, handlers, slashSelectHandlerRef, onSlashStateChange, slashCommands } =
    state;
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
      onStop={cp.onStop}
      onSubmit={cp.onSubmit}
      threadIsBusy={cp.threadIsBusy ?? false}
      textareaRef={state.textareaRef}
      useMentionSystem={state.useMentionSystem}
      onCloseAutocomplete={state.closeAutocomplete}
      onCloseMentionAutocomplete={state.closeMentionAutocomplete}
      activeMidTurnTaskId={cp.activeMidTurnTaskId}
      onInjectMidTurn={cp.onInjectMidTurn}
      allFiles={cp.allFiles}
      mentions={cp.mentions}
      addMention={cp.onAddMention}
      removeMention={cp.onRemoveMention}
      onSlashStateChange={onSlashStateChange}
      slashCommands={slashCommands}
      slashCommandContext={cp.slashCommandContext}
      slashSelectHandlerRef={slashSelectHandlerRef}
    />
  );
}

export function ComposerBody({ state, composerProps: cp }: SubProps): React.ReactElement {
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
