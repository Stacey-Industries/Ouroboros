/**
 * AgentChatComposerKeyHandlers.ts — Keyboard event handlers and change handler for AgentChatComposer.
 * Extracted to keep AgentChatComposerSupport.ts under the 300-line limit.
 */
import type React from 'react';

import type { AgentChatMessageRecord, CodexModelOption } from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import {
  extractMentionQuery,
  extractSlashQuery,
  findLastUserMessageContent,
} from './AgentChatComposerParts';
import { MENU_KEYS, resetDraftTextarea, setDraftValue } from './AgentChatComposerSupport';
import type { ChatOverrides } from './ChatControlsBar';
import { cyclePermissionMode, resolveChatControlProvider } from './ChatControlsBar';
import type { SlashCommandContext } from './SlashCommandMenu';

/* ---------- KeyDown handlers ---------- */

export function handleAutocompleteKeyDown(args: {
  event: React.KeyboardEvent<HTMLTextAreaElement>;
  autocompleteResults: FileEntry[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  handleFileSelect: (file: FileEntry) => void;
  onCloseAutocomplete?: () => void;
}): boolean {
  if (!args.autocompleteResults.length) return false;
  switch (args.event.key) {
    case 'ArrowDown':
      args.event.preventDefault();
      args.setSelectedIndex((value) => (value + 1) % args.autocompleteResults.length);
      return true;
    case 'ArrowUp':
      args.event.preventDefault();
      args.setSelectedIndex(
        (value) => (value - 1 + args.autocompleteResults.length) % args.autocompleteResults.length,
      );
      return true;
    case 'Enter':
      if (!args.event.shiftKey) {
        args.event.preventDefault();
        args.handleFileSelect(args.autocompleteResults[args.selectedIndex]);
        return true;
      }
      return false;
    case 'Tab':
      args.event.preventDefault();
      args.handleFileSelect(args.autocompleteResults[args.selectedIndex]);
      return true;
    case 'Escape':
      args.event.preventDefault();
      args.onCloseAutocomplete?.();
      return true;
    default:
      return false;
  }
}

function handlePermissionModeShortcut(args: {
  event: React.KeyboardEvent<HTMLTextAreaElement>;
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: CodexModelOption[];
}): boolean {
  if (
    args.event.key !== 'Tab' ||
    !args.event.shiftKey ||
    !args.chatOverrides ||
    !args.onChatOverridesChange
  )
    return false;
  args.event.preventDefault();
  const provider = resolveChatControlProvider(
    args.chatOverrides.model,
    args.defaultProvider ?? 'claude-code',
    args.codexModels,
  );
  args.onChatOverridesChange({
    ...args.chatOverrides,
    permissionMode: cyclePermissionMode(args.chatOverrides.permissionMode, provider),
  });
  return true;
}

function handleEscapeShortcut(args: {
  event: React.KeyboardEvent<HTMLTextAreaElement>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  lastSyncedDraft: React.MutableRefObject<string>;
  onChange: (value: string) => void;
}): boolean {
  if (args.event.key !== 'Escape') return false;
  args.event.preventDefault();
  resetDraftTextarea(args.textareaRef, args.lastSyncedDraft, args.onChange);
  return true;
}

function handleArrowUpShortcut(args: {
  event: React.KeyboardEvent<HTMLTextAreaElement>;
  messages?: AgentChatMessageRecord[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  lastSyncedDraft: React.MutableRefObject<string>;
  onChange: (value: string) => void;
}): boolean {
  const target = args.event.currentTarget;
  if (
    args.event.key !== 'ArrowUp' ||
    args.event.shiftKey ||
    args.event.ctrlKey ||
    args.event.metaKey ||
    target.value.trim() ||
    target.selectionStart !== 0
  )
    return false;
  const lastContent = findLastUserMessageContent(args.messages);
  if (lastContent)
    setDraftValue(args.textareaRef, args.lastSyncedDraft, args.onChange, lastContent);
  return true;
}

function handleEnterShortcut(args: {
  event: React.KeyboardEvent<HTMLTextAreaElement>;
  draft: string;
  slashCommandContext?: SlashCommandContext;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  lastSyncedDraft: React.MutableRefObject<string>;
  onChange: (value: string) => void;
  canSend: boolean;
  onSubmit: () => Promise<void>;
}): boolean {
  if (args.event.key !== 'Enter' || args.event.shiftKey) return false;
  args.event.preventDefault();
  if (/^\/remember\s+/i.test(args.draft) && args.slashCommandContext?.onRemember) {
    const text = args.draft.replace(/^\/remember\s*/i, '').trim();
    if (text) args.slashCommandContext.onRemember(text);
    resetDraftTextarea(args.textareaRef, args.lastSyncedDraft, args.onChange);
    return true;
  }
  if (args.canSend) void args.onSubmit();
  return true;
}

export function handleComposerShortcutKeyDown(args: {
  event: React.KeyboardEvent<HTMLTextAreaElement>;
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: CodexModelOption[];
  draft: string;
  messages?: AgentChatMessageRecord[];
  onChange: (value: string) => void;
  slashCommandContext?: SlashCommandContext;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  lastSyncedDraft: React.MutableRefObject<string>;
  canSend: boolean;
  onSubmit: () => Promise<void>;
}): boolean {
  return (
    handlePermissionModeShortcut(args) ||
    handleEscapeShortcut(args) ||
    handleArrowUpShortcut(args) ||
    handleEnterShortcut(args)
  );
}

export interface ComposerKeyDownArgs {
  event: React.KeyboardEvent<HTMLTextAreaElement>;
  isSlashMenuOpen: boolean;
  isMentionAutocompleteOpen: boolean;
  useMentionSystem: boolean;
  isAutocompleteOpen: boolean;
  autocompleteResults: FileEntry[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  handleFileSelect: (file: FileEntry) => void;
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: CodexModelOption[];
  onCloseAutocomplete?: () => void;
  messages?: AgentChatMessageRecord[];
  draft: string;
  onChange: (value: string) => void;
  slashCommandContext?: SlashCommandContext;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  lastSyncedDraft: React.MutableRefObject<string>;
  canSend: boolean;
  onSubmit: () => Promise<void>;
}

export function handleComposerKeyDown(args: ComposerKeyDownArgs): void {
  // If a capture-phase listener (e.g. MentionAutocomplete) already handled this
  // event, bail out — otherwise we'd send the message on Enter even though the
  // listener already selected a mention.
  if (args.event.nativeEvent?.defaultPrevented) return;
  if (
    (args.isSlashMenuOpen || (args.useMentionSystem && args.isMentionAutocompleteOpen)) &&
    MENU_KEYS.has(args.event.key)
  )
    return;
  if (
    !args.useMentionSystem &&
    args.isAutocompleteOpen &&
    handleAutocompleteKeyDown({
      event: args.event,
      autocompleteResults: args.autocompleteResults,
      selectedIndex: args.selectedIndex,
      setSelectedIndex: args.setSelectedIndex,
      handleFileSelect: args.handleFileSelect,
      onCloseAutocomplete: args.onCloseAutocomplete,
    })
  )
    return;
  handleComposerShortcutKeyDown(args);
}

export interface ComposerChangeArgs {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  lastSyncedDraft: React.MutableRefObject<string>;
  onChange: (value: string) => void;
  onAutocompleteQuery?: (query: string) => void;
  onOpenAutocomplete?: () => void;
  onCloseAutocomplete?: () => void;
  useMentionSystem: boolean;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setIsMentionAutocompleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSlashQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSlashMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function handleMentionOrAutocomplete(args: ComposerChangeArgs, mentionQuery: string | null): void {
  if (args.useMentionSystem) {
    args.setMentionQuery(mentionQuery);
    args.setIsMentionAutocompleteOpen(mentionQuery !== null);
    return;
  }
  if (!args.onAutocompleteQuery) return;
  if (mentionQuery !== null) {
    args.onOpenAutocomplete?.();
    args.onAutocompleteQuery(mentionQuery);
  } else {
    args.onCloseAutocomplete?.();
  }
}

export function handleComposerChange(args: ComposerChangeArgs, value: string): void {
  setDraftValue(args.textareaRef, args.lastSyncedDraft, args.onChange, value);
  const cursorPos = args.textareaRef.current?.selectionStart ?? value.length;
  const slashQuery = extractSlashQuery(value, cursorPos);
  if (slashQuery !== null) {
    args.setSlashQuery(slashQuery);
    args.setIsSlashMenuOpen(true);
    args.setIsMentionAutocompleteOpen(false);
    args.setMentionQuery(null);
    args.onCloseAutocomplete?.();
    return;
  }
  args.setSlashQuery(null);
  args.setIsSlashMenuOpen(false);
  const mentionQuery = extractMentionQuery(value, cursorPos);
  handleMentionOrAutocomplete(args, mentionQuery);
}
