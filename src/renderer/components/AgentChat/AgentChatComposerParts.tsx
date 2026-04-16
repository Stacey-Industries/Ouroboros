/**
 * AgentChatComposerParts.tsx — Sub-components for AgentChatComposer.
 *
 * Extracted to keep AgentChatComposer.tsx under the 300-line limit.
 * These components are stateless or lightly stateful UI pieces.
 */

import React from 'react';

import type { CodexModelOption, ImageAttachment, ModelProvider } from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { AdvancedInferenceControls } from './AdvancedInferenceControls';
import type { ModelContextUsage } from './AgentChatConversation';
import { ChatControlsBar, type ChatOverrides } from './ChatControlsBar';
import { resolveActiveModel } from './ChatControlsBarSupport';
import { ContextUsageBar } from './ContextUsageBar';
import { EffortEstimate } from './EffortEstimate';
import type { MentionItem } from './MentionAutocomplete';
import { MentionAutocomplete } from './MentionAutocomplete';
import type { SlashCommand } from './SlashCommandMenu';
import { SlashCommandMenu } from './SlashCommandMenu';

/* ---------- AttachmentChip ---------- */

export function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ImageAttachment;
  onRemove: () => void;
}): React.ReactElement {
  const src = `data:${attachment.mimeType};base64,${attachment.base64Data}`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-tight text-interactive-accent"
      style={{
        backgroundColor: 'var(--interactive-accent-subtle)',
        borderColor: 'var(--interactive-muted)',
      }}
    >
      <img src={src} alt="" className="h-4 w-4 rounded object-cover" />
      <span className="max-w-[100px] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
        {attachment.name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 opacity-60 hover:opacity-100"
        type="button"
        title="Remove attachment"
      >
        &times;
      </button>
    </span>
  );
}

/* ---------- AttachmentChipsBar ---------- */

export function AttachmentChipsBar({
  attachments,
  onRemove,
}: {
  attachments: ImageAttachment[];
  onRemove: (name: string) => void;
}): React.ReactElement | null {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1.5 pt-1">
      {attachments.map((att, i) => (
        <AttachmentChip
          key={`${att.name}-${i}`}
          attachment={att}
          onRemove={() => onRemove(att.name)}
        />
      ))}
    </div>
  );
}

/* ---------- SendButton (re-exported from AgentChatComposerInput.tsx) ---------- */

export { SendButton } from './AgentChatComposerInput';

/* ---------- AutocompleteDropdown ---------- */

export function AutocompleteDropdown(props: {
  results: FileEntry[];
  selectedIndex: number;
  onSelect: (file: FileEntry) => void;
}): React.ReactElement | null {
  if (props.results.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[240px] overflow-y-auto rounded-lg border border-border-semantic shadow-lg bg-surface-base">
      {props.results.map((file, index) => (
        <button
          key={file.path}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors duration-75 text-text-semantic-primary${index === props.selectedIndex ? ' bg-surface-overlay' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            props.onSelect(file);
          }}
        >
          <span className="shrink-0 text-text-semantic-muted">@</span>
          <span className="truncate" style={{ fontFamily: 'var(--font-mono)' }}>
            {file.relativePath}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Textarea helpers ---------- */

export function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  const saved = textarea.scrollTop;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 40), 120)}px`;
  textarea.scrollTop = saved;
}

export function extractMentionQuery(value: string, cursorPos: number): string | null {
  const textBeforeCursor = value.slice(0, cursorPos);
  const lastAt = textBeforeCursor.lastIndexOf('@');
  if (lastAt === -1) return null;
  if (lastAt > 0 && !/\s/.test(textBeforeCursor[lastAt - 1])) return null;
  const query = textBeforeCursor.slice(lastAt + 1);
  if (query.includes('\n')) return null;
  if (query.length > 0 && /^\s/.test(query)) return null;
  return query;
}

export function extractSlashQuery(value: string, cursorPos: number): string | null {
  const textBeforeCursor = value.slice(0, cursorPos);
  const lastSlash = textBeforeCursor.lastIndexOf('/');
  if (lastSlash === -1) return null;
  if (lastSlash > 0 && !/\s/.test(textBeforeCursor[lastSlash - 1])) return null;
  const query = textBeforeCursor.slice(lastSlash + 1);
  if (query.includes(' ') || query.includes('\n')) return null;
  return query;
}

export function findLastUserMessageContent(
  messages: import('../../types/electron').AgentChatMessageRecord[] | undefined,
): string {
  if (!messages) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].content.trim()) {
      return messages[i].content;
    }
  }
  return '';
}

/* ---------- ComposerMenus ---------- */

export type ComposerMenusProps = {
  allFiles: FileEntry[];
  autocompleteResults: FileEntry[];
  handleFileSelect: (file: FileEntry) => void;
  handleMentionSelect: (mention: MentionItem) => void;
  isAutocompleteOpen: boolean;
  isMentionAutocompleteOpen: boolean;
  isSlashMenuOpen: boolean;
  mentionQuery: string | null;
  mentions: MentionItem[];
  onCloseMentionAutocomplete: () => void;
  onCloseSlashMenu: () => void;
  onSlashSelect: (cmd: SlashCommand) => void;
  selectedIndex: number;
  slashCommands: SlashCommand[];
  slashQuery: string | null;
  useMentionSystem: boolean;
};

export function ComposerMenus(props: ComposerMenusProps): React.ReactElement {
  return (
    <div className="relative">
      {props.isSlashMenuOpen && props.slashQuery !== null && (
        <SlashCommandMenu
          query={props.slashQuery}
          commands={props.slashCommands}
          onSelect={props.onSlashSelect}
          onClose={props.onCloseSlashMenu}
          isOpen
        />
      )}
      {props.useMentionSystem && props.isMentionAutocompleteOpen && props.mentionQuery !== null && (
        <MentionAutocomplete
          query={props.mentionQuery}
          allFiles={props.allFiles}
          selectedMentions={props.mentions}
          onSelect={props.handleMentionSelect}
          onClose={props.onCloseMentionAutocomplete}
          isOpen
        />
      )}
      {!props.useMentionSystem && props.isAutocompleteOpen && (
        <AutocompleteDropdown
          results={props.autocompleteResults}
          selectedIndex={props.selectedIndex}
          onSelect={props.handleFileSelect}
        />
      )}
    </div>
  );
}

/* ---------- ComposerContextBar ---------- */

type ComposerContextBarProps = {
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
  threadModelUsage?: { model: string; inputTokens: number; outputTokens: number }[];
  selectedModel?: string;
  settingsModel?: string;
  codexModels?: CodexModelOption[];
};

export function ComposerContextBar(props: ComposerContextBarProps): React.ReactElement | null {
  const activeModel = resolveActiveModel({
    activeProvider: 'claude-code',
    selectedModel: props.selectedModel ?? '',
    settingsModel: props.settingsModel,
  });
  const usage =
    props.streamingTokenUsage ??
    props.threadModelUsage?.find((e) => !e.model || e.model === activeModel);
  if (!usage || usage.inputTokens <= 0) return null;
  return (
    <ContextUsageBar
      inputTokens={usage.inputTokens}
      model={activeModel}
      codexModels={props.codexModels}
    />
  );
}

/* ---------- ComposerInput (re-exported from AgentChatComposerInput.tsx) ---------- */

export type { ComposerInputProps } from './AgentChatComposerInput';
export { ComposerInput } from './AgentChatComposerInput';

/* ---------- ComposerFooter ---------- */

export type ComposerFooterProps = {
  chatOverrides?: ChatOverrides;
  codexModels?: CodexModelOption[];
  codexSettingsModel?: string;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  modelProviders?: ModelProvider[];
  routedBy?: string;
  settingsModel?: string;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
  threadModelUsage?: ModelContextUsage[];
  isStreaming?: boolean;
  /** Estimated context tokens — used to drive the EffortEstimate pill. */
  contextTokens?: number;
};

export function ComposerFooter(props: ComposerFooterProps): React.ReactElement | null {
  if (!props.chatOverrides || !props.onChatOverridesChange) return null;
  return (
    <div className="flex items-center">
      <div className="flex-1">
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
          isStreaming={props.isStreaming}
          routedBy={props.routedBy}
        />
      </div>
      <div className="flex items-center gap-1.5 pr-2">
        <EffortEstimate
          profileId={props.chatOverrides.profileId}
          contextTokens={props.contextTokens ?? 0}
        />
        <AdvancedInferenceControls
          overrides={props.chatOverrides}
          onChange={props.onChatOverridesChange}
        />
      </div>
    </div>
  );
}
