import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentChatMessageRecord } from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import type { PinnedFile } from './useAgentChatContext';
import type { MentionItem } from './MentionAutocomplete';
import { AgentChatContextBar } from './AgentChatContextBar';
import { MentionAutocomplete } from './MentionAutocomplete';
import { MentionChipsBar } from './MentionChip';

export interface AgentChatComposerProps {
  canSend: boolean;
  disabled: boolean;
  draft: string;
  isSending: boolean;
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

function extractMentionQuery(value: string, cursorPos: number): string | null {
  // Walk backwards from cursor to find an unmatched @
  const textBeforeCursor = value.slice(0, cursorPos);
  const lastAt = textBeforeCursor.lastIndexOf('@');
  if (lastAt === -1) return null;

  // @ must be at start or preceded by whitespace
  if (lastAt > 0 && !/\s/.test(textBeforeCursor[lastAt - 1])) return null;

  const query = textBeforeCursor.slice(lastAt + 1);
  // If query contains whitespace with more than one word, it's probably not a mention
  if (query.includes('\n')) return null;

  return query;
}

function SendButton(props: { canSend: boolean; isSending: boolean; onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={props.onClick}
      disabled={!props.canSend}
      className="absolute bottom-2 right-2 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-30"
      style={{
        backgroundColor: props.canSend ? 'var(--accent)' : 'transparent',
        color: props.canSend ? 'var(--bg)' : 'var(--text-muted)',
      }}
    >
      {props.isSending ? '\u2026' : '\u2191'}
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
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[240px] overflow-y-auto rounded-lg border shadow-lg"
      style={{
        backgroundColor: 'var(--bg)',
        borderColor: 'var(--border)',
      }}
    >
      {props.results.map((file, index) => (
        <button
          key={file.path}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors duration-75"
          style={{
            backgroundColor: index === props.selectedIndex ? 'var(--bg-hover, var(--border))' : 'transparent',
            color: 'var(--text)',
          }}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent textarea blur
            props.onSelect(file);
          }}
        >
          <span className="shrink-0 text-[var(--text-muted)]">@</span>
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
}: AgentChatComposerProps): React.ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [isMentionAutocompleteOpen, setIsMentionAutocompleteOpen] = useState(false);

  // Use the new mention autocomplete system when onAddMention is provided
  const useMentionSystem = Boolean(onAddMention);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [autocompleteResults.length]);

  const handleFileSelect = useCallback((file: FileEntry) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = draft.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1) {
      // Replace the @query with just the text before @
      const newDraft = draft.slice(0, lastAt) + draft.slice(cursorPos);
      onChange(newDraft);
    }

    if (useMentionSystem && onAddMention) {
      // Convert to a MentionItem and add via mention system
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
  }, [draft, onChange, onSelectFile, onCloseAutocomplete, useMentionSystem, onAddMention]);

  const handleMentionSelect = useCallback((mention: MentionItem) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = draft.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1) {
      const newDraft = draft.slice(0, lastAt) + draft.slice(cursorPos);
      onChange(newDraft);
    }

    onAddMention?.(mention);
    setIsMentionAutocompleteOpen(false);
    setMentionQuery(null);
    textareaRef.current?.focus();
  }, [draft, onChange, onAddMention]);

  const handleChange = useCallback((value: string) => {
    onChange(value);

    const textarea = textareaRef.current;
    if (!textarea) return;

    // Use setTimeout to get the updated selectionStart after React re-render
    setTimeout(() => {
      const cursorPos = textarea.selectionStart;
      const query = extractMentionQuery(value, cursorPos);

      if (useMentionSystem) {
        if (query !== null) {
          setMentionQuery(query);
          setIsMentionAutocompleteOpen(true);
        } else {
          setMentionQuery(null);
          setIsMentionAutocompleteOpen(false);
        }
      } else if (onAutocompleteQuery) {
        if (query !== null) {
          onOpenAutocomplete?.();
          onAutocompleteQuery(query);
        } else {
          onCloseAutocomplete?.();
        }
      }
    }, 0);
  }, [onChange, onAutocompleteQuery, onOpenAutocomplete, onCloseAutocomplete, useMentionSystem]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // When the new mention autocomplete is open, let it handle keyboard events
    // (it uses a global keydown listener)
    if (useMentionSystem && isMentionAutocompleteOpen) {
      // Still allow Enter/Escape/Arrow to be handled by MentionAutocomplete
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
        return; // Let MentionAutocomplete's global handler deal with it
      }
    }

    // Handle legacy autocomplete keyboard navigation
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

    // Original composer key handling
    if (event.key === 'Escape') {
      event.preventDefault();
      onChange('');
      return;
    }

    if (
      event.key === 'ArrowUp' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      draft.trim() === '' &&
      (event.target as HTMLTextAreaElement).selectionStart === 0
    ) {
      const lastContent = findLastUserMessageContent(messages);
      if (lastContent) {
        event.preventDefault();
        onChange(lastContent);
      }
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (!canSend) {
      return;
    }

    void onSubmit();
  }, [
    autocompleteResults,
    canSend,
    draft,
    handleFileSelect,
    isAutocompleteOpen,
    isMentionAutocompleteOpen,
    messages,
    onChange,
    onCloseAutocomplete,
    onSubmit,
    selectedIndex,
    useMentionSystem,
  ]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const minHeight = 40;
    const maxHeight = 120;
    textarea.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`;
  }, [draft]);

  const mentionTotalTokens = mentions.reduce((sum, m) => sum + m.estimatedTokens, 0);

  return (
    <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: 'var(--border)' }}>
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
      <div className="relative">
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
          value={draft}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay close to allow click on dropdown items
            setTimeout(() => {
              if (useMentionSystem) {
                setIsMentionAutocompleteOpen(false);
                setMentionQuery(null);
              } else {
                onCloseAutocomplete?.();
              }
            }, 200);
          }}
          placeholder="Ask Claude... (@ to mention files, @folder: for dirs, @diff, @terminal)"
          disabled={disabled}
          rows={1}
          className="w-full resize-none rounded-lg border bg-[var(--bg)] py-2.5 pl-3 pr-10 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderColor: 'var(--border)', fontFamily: 'var(--font-ui)', minHeight: '40px' }}
        />
        <SendButton
          canSend={canSend}
          isSending={isSending}
          onClick={() => void onSubmit()}
        />
      </div>
    </div>
  );
}
