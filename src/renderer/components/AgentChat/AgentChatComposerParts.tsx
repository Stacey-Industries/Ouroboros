/**
 * AgentChatComposerParts.tsx — Sub-components for AgentChatComposer.
 *
 * Extracted to keep AgentChatComposer.tsx under the 300-line limit.
 * These components are stateless or lightly stateful UI pieces.
 */

import React from 'react';

import type { ImageAttachment } from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { getTextareaStyle } from './AgentChatComposerSupport';
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
      style={{ backgroundColor: 'rgba(100,180,255,0.08)', borderColor: 'rgba(100,180,255,0.25)' }}
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

/* ---------- SendButton ---------- */

export function SendButton(props: {
  canSend: boolean;
  isSending: boolean;
  willQueue: boolean;
  onClick: () => void;
}): React.ReactElement {
  const label = props.willQueue ? 'Queue message' : 'Send message';
  return (
    <button
      onClick={props.onClick}
      disabled={!props.canSend}
      title={label}
      aria-busy={props.isSending}
      className="absolute right-2 flex items-center justify-center rounded-md text-xs font-medium transition-all duration-100 hover:bg-[rgba(255,255,255,0.08)] disabled:cursor-not-allowed disabled:opacity-30"
      style={{
        top: '6px',
        width: '28px',
        height: '28px',
        color: props.canSend ? 'var(--text-primary)' : 'var(--text-muted)',
      }}
    >
      {props.willQueue ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      ) : (
        '\u2191'
      )}
    </button>
  );
}

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
  textarea.style.height = 'auto';
  const minHeight = 40;
  const maxHeight = 120;
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)}px`;
}

export function extractMentionQuery(value: string, cursorPos: number): string | null {
  const textBeforeCursor = value.slice(0, cursorPos);
  const lastAt = textBeforeCursor.lastIndexOf('@');
  if (lastAt === -1) return null;
  if (lastAt > 0 && !/\s/.test(textBeforeCursor[lastAt - 1])) return null;
  const query = textBeforeCursor.slice(lastAt + 1);
  if (query.includes('\n')) return null;
  return query;
}

export function extractSlashQuery(value: string): string | null {
  if (!value.startsWith('/')) return null;
  const rest = value.slice(1);
  if (rest.includes(' ') || rest.includes('\n')) return null;
  return rest;
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

/* ---------- ComposerInput ---------- */

export type ComposerInputProps = {
  canSend: boolean;
  disabled: boolean;
  draft: string;
  handleChange: (value: string) => void;
  handleDragLeave: () => void;
  handleDragOver: (event: React.DragEvent) => void;
  handleDrop: (event: React.DragEvent) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  isSending: boolean;
  onPickImage?: () => Promise<void>;
  onSubmit: () => Promise<void>;
  threadIsBusy: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  useMentionSystem: boolean;
  onCloseAutocomplete?: () => void;
  onCloseMentionAutocomplete?: () => void;
};

function ComposerTextarea(props: ComposerInputProps): React.ReactElement {
  return (
    <textarea
      ref={props.textareaRef}
      defaultValue={props.draft}
      onChange={(event) => props.handleChange(event.target.value)}
      onKeyDown={props.handleKeyDown}
      onPaste={props.handlePaste}
      onBlur={() => {
        setTimeout(() => {
          if (props.useMentionSystem) props.onCloseMentionAutocomplete?.();
          else props.onCloseAutocomplete?.();
        }, 200);
      }}
      placeholder="Ask the agent... (/ for commands, @ to mention files)"
      disabled={props.disabled}
      rows={1}
      className="w-full resize-none border bg-surface-base text-sm text-text-semantic-primary placeholder:text-text-semantic-muted focus:placeholder:text-transparent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      style={getTextareaStyle(Boolean(props.onPickImage))}
      onFocus={(event) => {
        event.currentTarget.style.borderColor = 'var(--interactive-accent)';
        event.currentTarget.style.boxShadow =
          '0 0 0 2px var(--interactive-muted, rgba(88, 166, 255, 0.2))';
      }}
      onBlurCapture={(event) => {
        event.currentTarget.style.borderColor = 'var(--border-subtle, var(--border-default))';
        event.currentTarget.style.boxShadow = 'none';
      }}
    />
  );
}

export function ComposerInput(props: ComposerInputProps): React.ReactElement {
  return (
    <div className="relative">
      <ComposerTextarea {...props} />
      {props.onPickImage && (
        <button
          type="button"
          title="Attach image"
          onClick={() => void props.onPickImage?.()}
          className="absolute right-10 flex h-[28px] w-[28px] items-center justify-center rounded-md text-text-semantic-muted transition-colors duration-100 hover:bg-[rgba(255,255,255,0.08)] hover:text-text-semantic-primary"
          style={{ top: 6 }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
      )}
      <SendButton
        canSend={props.canSend}
        isSending={props.isSending}
        willQueue={props.threadIsBusy}
        onClick={() => void props.onSubmit()}
      />
    </div>
  );
}
