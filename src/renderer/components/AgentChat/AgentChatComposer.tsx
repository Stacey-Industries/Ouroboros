import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AgentChatMessageRecord, CodexModelOption, ImageAttachment, ImageMimeType, ModelProvider } from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { AgentChatContextBar } from './AgentChatContextBar';
import {
  ChatControlsBar,
  type ChatOverrides,
  cyclePermissionMode,
  resolveChatControlProvider,
} from './ChatControlsBar';
import type { MentionItem } from './MentionAutocomplete';
import { MentionAutocomplete } from './MentionAutocomplete';
import { MentionChipsBar } from './MentionChip';
import { buildChatSlashCommands, type SlashCommand, type SlashCommandContext, SlashCommandMenu } from './SlashCommandMenu';
import type { PinnedFile } from './useAgentChatContext';

export interface AgentChatComposerProps {
  canSend: boolean;
  disabled: boolean;
  draft: string;
  isSending: boolean;
  /** True when the active thread's agent is still working (submitting/running). */
  threadIsBusy?: boolean;
  messages?: AgentChatMessageRecord[];
  onChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  // Context integration
  pinnedFiles?: PinnedFile[];
  onRemoveFile?: (path: string) => void;
  contextSummary?: string | null;
  autocompleteResults?: FileEntry[];
  isAutocompleteOpen?: boolean;
  onAutocompleteQuery?: (query: string) => void;
  onSelectFile?: (file: FileEntry) => void;
  onCloseAutocomplete?: () => void;
  onOpenAutocomplete?: () => void;
  // Mention system
  mentions?: MentionItem[];
  onAddMention?: (mention: MentionItem) => void;
  onRemoveMention?: (key: string) => void;
  allFiles?: FileEntry[];
  // Chat-level overrides
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  /** Model ID from settings, used to label the "Default" option. */
  settingsModel?: string;
  codexSettingsModel?: string;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  /** Configured model providers for the model picker dropdown. */
  modelProviders?: ModelProvider[];
  codexModels?: CodexModelOption[];
  /** Per-model context usage for the active thread. */
  threadModelUsage?: import('./AgentChatConversation').ModelContextUsage[];
  /** Real-time token usage during streaming — shown in the context ring while agent is working. */
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
  /** Slash command callbacks for /clear, /compact, /new, etc. */
  slashCommandContext?: SlashCommandContext;
  /** Image attachments for the current message */
  attachments?: ImageAttachment[];
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void;
}

function findLastUserMessageContent(messages: AgentChatMessageRecord[] | undefined): string {
  if (!messages) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].content.trim()) {
      return messages[i].content;
    }
  }
  return '';
}

/**
 * If the draft starts with `/` and contains no whitespace yet, return the query after `/`.
 * e.g. "/cle" -> "cle", "/clear something" -> null, "hello /foo" -> null.
 */
function extractSlashQuery(value: string): string | null {
  if (!value.startsWith('/')) return null;
  const rest = value.slice(1);
  if (rest.includes(' ') || rest.includes('\n')) return null;
  return rest;
}

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  const minHeight = 40;
  const maxHeight = 120;
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)}px`;
}

function extractMentionQuery(value: string, cursorPos: number): string | null {
  const textBeforeCursor = value.slice(0, cursorPos);
  const lastAt = textBeforeCursor.lastIndexOf('@');
  if (lastAt === -1) return null;
  if (lastAt > 0 && !/\s/.test(textBeforeCursor[lastAt - 1])) return null;
  const query = textBeforeCursor.slice(lastAt + 1);
  if (query.includes('\n')) return null;
  return query;
}

function AttachmentChip({ attachment, onRemove }: { attachment: ImageAttachment; onRemove: () => void }): React.ReactElement {
  const src = `data:${attachment.mimeType};base64,${attachment.base64Data}`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-tight text-interactive-accent"
      style={{ backgroundColor: 'rgba(100,180,255,0.08)', borderColor: 'rgba(100,180,255,0.25)' }}
    >
      <img src={src} alt="" className="h-4 w-4 rounded object-cover" />
      <span className="max-w-[100px] truncate" style={{ fontFamily: 'var(--font-mono)' }}>{attachment.name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="ml-0.5 opacity-60 hover:opacity-100"
        type="button"
        title="Remove attachment"
      >&times;</button>
    </span>
  );
}

function AttachmentChipsBar({ attachments, onRemove }: { attachments: ImageAttachment[]; onRemove: (name: string) => void }): React.ReactElement | null {
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

function SendButton(props: { canSend: boolean; isSending: boolean; willQueue: boolean; onClick: () => void }): React.ReactElement {
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      ) : '\u2191'}
    </button>
  );
}

function AutocompleteDropdown(props: {
  results: FileEntry[];
  selectedIndex: number;
  onSelect: (file: FileEntry) => void;
}): React.ReactElement | null {
  if (props.results.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[240px] overflow-y-auto rounded-lg border border-border-semantic shadow-lg bg-surface-base"
    >
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

export function AgentChatComposer({
  canSend,
  disabled,
  draft,
  isSending,
  threadIsBusy = false,
  messages,
  onChange,
  onSubmit,
  pinnedFiles = [],
  onRemoveFile,
  contextSummary,
  autocompleteResults = [],
  isAutocompleteOpen = false,
  onAutocompleteQuery,
  onSelectFile,
  onCloseAutocomplete,
  onOpenAutocomplete,
  mentions = [],
  onAddMention,
  onRemoveMention,
  allFiles = [],
  chatOverrides,
  onChatOverridesChange,
  settingsModel,
  codexSettingsModel,
  defaultProvider,
  modelProviders,
  codexModels,
  threadModelUsage,
  streamingTokenUsage,
  slashCommandContext,
  attachments = [],
  onAttachmentsChange,
}: AgentChatComposerProps): React.ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [isMentionAutocompleteOpen, setIsMentionAutocompleteOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const lastSyncedDraft = useRef(draft);

  useEffect(() => {
    if (draft !== lastSyncedDraft.current) {
      lastSyncedDraft.current = draft;
      if (textareaRef.current) {
        textareaRef.current.value = draft;
        autoResizeTextarea(textareaRef.current);
      }
    }
  }, [draft]);

  const useMentionSystem = Boolean(onAddMention);

  const slashCommands = useMemo(
    () => buildChatSlashCommands(slashCommandContext ?? {}),
    [slashCommandContext],
  );

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    if (cmd.id === 'remember' && slashCommandContext?.onRemember) {
      const text = draft.replace(/^\/remember\s*/i, '').trim();
      if (text) {
        slashCommandContext.onRemember(text);
      }
      // Draft is cleared below via clearDraft: true
    } else if (cmd.id === 'diff' && onAddMention) {
      onAddMention({
        type: 'diff',
        key: '@diff',
        label: 'Git Diff',
        path: '@diff',
        estimatedTokens: 2000,
      });
    } else {
      cmd.action();
    }
    if (cmd.clearDraft !== false) {
      if (textareaRef.current) {
        textareaRef.current.value = '';
        autoResizeTextarea(textareaRef.current);
      }
      lastSyncedDraft.current = '';
      onChange('');
    }
    setIsSlashMenuOpen(false);
    setSlashQuery(null);
    textareaRef.current?.focus();
  }, [draft, onChange, onAddMention, slashCommandContext]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [autocompleteResults.length]);

  const handleFileSelect = useCallback((file: FileEntry) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const currentValue = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = currentValue.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1) {
      const newDraft = currentValue.slice(0, lastAt) + currentValue.slice(cursorPos);
      textarea.value = newDraft;
      lastSyncedDraft.current = newDraft;
      onChange(newDraft);
    }

    if (useMentionSystem && onAddMention) {
      onAddMention({
        type: 'file',
        key: `@file:${file.path}`,
        label: file.name,
        path: file.relativePath,
        estimatedTokens: file.size > 0 ? Math.ceil(file.size / 4) : 500,
      });
      setIsMentionAutocompleteOpen(false);
      setMentionQuery(null);
    } else if (onSelectFile) {
      onSelectFile(file);
      onCloseAutocomplete?.();
    }
  }, [onChange, onSelectFile, onCloseAutocomplete, useMentionSystem, onAddMention]);

  const handleMentionSelect = useCallback((mention: MentionItem) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const currentValue = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = currentValue.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1) {
      const newDraft = currentValue.slice(0, lastAt) + currentValue.slice(cursorPos);
      textarea.value = newDraft;
      lastSyncedDraft.current = newDraft;
      onChange(newDraft);
    }

    onAddMention?.(mention);
    setIsMentionAutocompleteOpen(false);
    setMentionQuery(null);
    textarea.focus();
  }, [onChange, onAddMention]);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    event.preventDefault();

    const readers: Promise<ImageAttachment>[] = imageItems.map(
      (item) =>
        new Promise((resolve, reject) => {
          const blob = item.getAsFile();
          if (!blob) {
            reject(new Error('No file'));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve({
              name: blob.name || `screenshot-${Date.now()}.png`,
              mimeType: blob.type as ImageMimeType,
              base64Data: dataUrl.split(',')[1],
              sizeBytes: blob.size,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }),
    );

    void Promise.allSettled(readers).then((results) => {
      const newAtts = results
        .filter((r): r is PromiseFulfilledResult<ImageAttachment> => r.status === 'fulfilled')
        .map((r) => r.value);
      if (newAtts.length > 0) onAttachmentsChange?.([...attachments, ...newAtts]);
    });
  }, [attachments, onAttachmentsChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.items).some((i) => i.type.startsWith('image/'))) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const readers: Promise<ImageAttachment>[] = files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve({
              name: file.name,
              mimeType: file.type as ImageMimeType,
              base64Data: dataUrl.split(',')[1],
              sizeBytes: file.size,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
    );

    void Promise.allSettled(readers).then((results) => {
      const newAtts = results
        .filter((r): r is PromiseFulfilledResult<ImageAttachment> => r.status === 'fulfilled')
        .map((r) => r.value);
      if (newAtts.length > 0) onAttachmentsChange?.([...attachments, ...newAtts]);
    });
  }, [attachments, onAttachmentsChange]);

  const handlePickImage = useCallback(async () => {
    if (!onAttachmentsChange) return;
    if (!window.electronAPI?.files?.showImageDialog) return;
    const result = await window.electronAPI.files.showImageDialog();
    if (!result.success || result.cancelled || !result.attachments?.length) return;
    onAttachmentsChange([...attachments, ...(result.attachments as ImageAttachment[])]);
  }, [attachments, onAttachmentsChange]);

  const handleRemoveAttachment = useCallback((name: string) => {
    const idx = attachments.findIndex((a) => a.name === name);
    if (idx === -1) return;
    const next = [...attachments];
    next.splice(idx, 1);
    onAttachmentsChange?.(next);
  }, [attachments, onAttachmentsChange]);

  const handleChange = useCallback((value: string) => {
    lastSyncedDraft.current = value;
    onChange(value);

    if (textareaRef.current) autoResizeTextarea(textareaRef.current);

    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const sq = extractSlashQuery(value);
    if (sq !== null) {
      setSlashQuery(sq);
      setIsSlashMenuOpen(true);
      setIsMentionAutocompleteOpen(false);
      setMentionQuery(null);
      onCloseAutocomplete?.();
      return;
    }
    setSlashQuery(null);
    setIsSlashMenuOpen(false);

    const query = extractMentionQuery(value, cursorPos);
    if (useMentionSystem) {
      setMentionQuery(query);
      setIsMentionAutocompleteOpen(query !== null);
    } else if (onAutocompleteQuery) {
      if (query !== null) {
        onOpenAutocomplete?.();
        onAutocompleteQuery(query);
      } else {
        onCloseAutocomplete?.();
      }
    }
  }, [onChange, onAutocompleteQuery, onOpenAutocomplete, onCloseAutocomplete, useMentionSystem]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSlashMenuOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
        return;
      }
    }

    if (useMentionSystem && isMentionAutocompleteOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
        return;
      }
    }

    if (!useMentionSystem && isAutocompleteOpen && autocompleteResults.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((i) => (i + 1) % autocompleteResults.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((i) => (i - 1 + autocompleteResults.length) % autocompleteResults.length);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleFileSelect(autocompleteResults[selectedIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseAutocomplete?.();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        handleFileSelect(autocompleteResults[selectedIndex]);
        return;
      }
    }

    if (event.key === 'Tab' && event.shiftKey && chatOverrides && onChatOverridesChange) {
      event.preventDefault();
      const provider = resolveChatControlProvider(
        chatOverrides.model,
        defaultProvider ?? 'claude-code',
        codexModels,
      );
      onChatOverridesChange({
        ...chatOverrides,
        permissionMode: cyclePermissionMode(chatOverrides.permissionMode, provider),
      });
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (textareaRef.current) {
        textareaRef.current.value = '';
        autoResizeTextarea(textareaRef.current);
      }
      lastSyncedDraft.current = '';
      onChange('');
      return;
    }

    if (
      event.key === 'ArrowUp' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.target as HTMLTextAreaElement).value.trim() === '' &&
      (event.target as HTMLTextAreaElement).selectionStart === 0
    ) {
      const lastContent = findLastUserMessageContent(messages);
      if (lastContent) {
        event.preventDefault();
        if (textareaRef.current) {
          textareaRef.current.value = lastContent;
          autoResizeTextarea(textareaRef.current);
        }
        lastSyncedDraft.current = lastContent;
        onChange(lastContent);
      }
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();

    // Intercept /remember <text> typed directly and submitted via Enter
    if (draft.match(/^\/remember\s+/i) && slashCommandContext?.onRemember) {
      const text = draft.replace(/^\/remember\s*/i, '').trim();
      if (text) {
        slashCommandContext.onRemember(text);
      }
      if (textareaRef.current) {
        textareaRef.current.value = '';
        autoResizeTextarea(textareaRef.current);
      }
      lastSyncedDraft.current = '';
      onChange('');
      return;
    }

    if (!canSend) {
      return;
    }

    void onSubmit();
  }, [
    autocompleteResults,
    canSend,
    chatOverrides,
    draft,
    handleFileSelect,
    isAutocompleteOpen,
    isMentionAutocompleteOpen,
    isSlashMenuOpen,
    messages,
    onChange,
    onChatOverridesChange,
    onCloseAutocomplete,
    onSubmit,
    selectedIndex,
    slashCommandContext,
    useMentionSystem,
  ]);

  const mentionTotalTokens = mentions.reduce((sum, m) => sum + m.estimatedTokens, 0);

  return (
    <div
      className={`pb-1 pt-2${isDragging ? ' ring-2 ring-inset ring-interactive-accent' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="px-3">
        <AgentChatContextBar
          pinnedFiles={pinnedFiles}
          onRemoveFile={onRemoveFile ?? (() => {})}
          contextSummary={contextSummary ?? null}
        />
        {useMentionSystem && (
          <MentionChipsBar
            mentions={mentions}
            onRemove={onRemoveMention ?? (() => {})}
            totalTokens={mentionTotalTokens}
          />
        )}
        <AttachmentChipsBar attachments={attachments} onRemove={handleRemoveAttachment} />
        <div className="relative">
          {isSlashMenuOpen && slashQuery !== null && (
            <SlashCommandMenu
              query={slashQuery}
              commands={slashCommands}
              onSelect={handleSlashSelect}
              onClose={() => {
                setIsSlashMenuOpen(false);
                setSlashQuery(null);
              }}
              isOpen={isSlashMenuOpen}
            />
          )}
          {useMentionSystem && isMentionAutocompleteOpen && mentionQuery !== null && (
            <MentionAutocomplete
              query={mentionQuery}
              allFiles={allFiles}
              selectedMentions={mentions}
              onSelect={handleMentionSelect}
              onClose={() => {
                setIsMentionAutocompleteOpen(false);
                setMentionQuery(null);
              }}
              isOpen={isMentionAutocompleteOpen}
            />
          )}
          {!useMentionSystem && isAutocompleteOpen && (
            <AutocompleteDropdown
              results={autocompleteResults}
              selectedIndex={selectedIndex}
              onSelect={handleFileSelect}
            />
          )}
          <textarea
            ref={textareaRef}
            defaultValue={draft}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => {
              setTimeout(() => {
                if (useMentionSystem) {
                  setIsMentionAutocompleteOpen(false);
                  setMentionQuery(null);
                } else {
                  onCloseAutocomplete?.();
                }
              }, 200);
            }}
            placeholder="Ask the agent... (/ for commands, @ to mention files)"
            disabled={disabled}
            rows={1}
            className="w-full resize-none border bg-surface-base text-sm text-text-semantic-primary placeholder:text-text-semantic-muted focus:placeholder:text-transparent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: 'var(--border-muted, var(--border))',
              borderRadius: '8px',
              fontFamily: 'var(--font-ui)',
              minHeight: '40px',
              padding: onAttachmentsChange ? '10px 72px 10px 12px' : '10px 44px 10px 12px',
              lineHeight: '1.4',
              transition: 'border-color 150ms ease, box-shadow 150ms ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent-muted, rgba(88, 166, 255, 0.2))';
            }}
            onBlurCapture={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-muted, var(--border))';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          {onAttachmentsChange && (
            <button
              type="button"
              title="Attach image"
              onClick={() => void handlePickImage()}
              className="absolute right-10 flex h-[28px] w-[28px] items-center justify-center rounded-md transition-colors duration-100 text-text-semantic-muted hover:text-text-semantic-primary hover:bg-[rgba(255,255,255,0.08)]"
              style={{ top: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          )}
          <SendButton
            canSend={canSend}
            isSending={isSending}
            willQueue={threadIsBusy}
            onClick={() => void onSubmit()}
          />
        </div>
      </div>
      {chatOverrides && onChatOverridesChange && (
        <ChatControlsBar
          overrides={chatOverrides}
          onChange={onChatOverridesChange}
          settingsModel={settingsModel}
          codexSettingsModel={codexSettingsModel}
          defaultProvider={defaultProvider}
          providers={modelProviders}
          codexModels={codexModels}
          threadModelUsage={threadModelUsage}
          streamingTokenUsage={streamingTokenUsage}
        />
      )}
    </div>
  );
}
