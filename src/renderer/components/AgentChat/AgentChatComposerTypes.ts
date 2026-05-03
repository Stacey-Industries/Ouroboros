/**
 * AgentChatComposerTypes.ts — Shared types and pure helpers for the composer.
 *
 * Extracted from AgentChatComposerInput.tsx to keep that file under the
 * 300-line limit. All exports here are re-exported from AgentChatComposerInput
 * for backwards compatibility with existing importers.
 */
import type React from 'react';

import type { AgentChatMessageRecord, CodexModelOption } from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import type { ChatOverrides } from './ChatControlsBar';
import type { SlashState } from './lexicalComposer/SlashCommandPlugin';
import type { MentionItem, SymbolGraphNode } from './MentionAutocomplete';
import type { SlashCommand, SlashCommandContext } from './SlashCommandMenu';

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
  onStop?: () => Promise<void>;
  onSubmit: () => Promise<void>;
  threadIsBusy: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  useMentionSystem: boolean;
  onCloseAutocomplete?: () => void;
  onCloseMentionAutocomplete?: () => void;
  onCloseSlashMenu?: () => void;
  /** taskId of the active warm process — enables mid-turn inject button when streaming. */
  activeMidTurnTaskId?: string | null;
  onInjectMidTurn?: (taskId: string, content: string) => Promise<void>;
  // --- Lexical-path only (ignored by the legacy RichTextarea path) ---
  /** Message history — ArrowUp restore-last-message in LexicalChatComposer. */
  messages?: AgentChatMessageRecord[];
  /** Chat overrides — Shift+Tab permission cycle in LexicalChatComposer. */
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: CodexModelOption[];
  codexAppServerTransport?: boolean;
  // --- Phase C: mention bridge (Lexical path only, ignored by legacy RichTextarea) ---
  /** All indexed project files for @ mention search. */
  allFiles?: FileEntry[];
  /** Currently selected mentions — excluded from dropdown results. */
  mentions?: MentionItem[];
  /** Symbol graph results for symbol-type mention search. */
  symbolResults?: SymbolGraphNode[];
  /** Called when a mention chip is inserted (bridges to mentions[] store). */
  addMention?: (mention: MentionItem) => void;
  /** Called when a mention chip is removed (bridges to mentions[] store). */
  removeMention?: (key: string) => void;
  // --- Phase D: slash command integration (Lexical path only) ---
  /** Callback fired by SlashCommandPlugin when slash state changes. */
  onSlashStateChange?: (state: SlashState) => void;
  /** Commands to pass through to SlashCommandPlugin for action dispatch. */
  slashCommands?: SlashCommand[];
  /** Context forwarded to each slash command's action handler. */
  slashCommandContext?: SlashCommandContext;
  /** Imperative handle — populated by useSlashSelectHandler; call ref.current?.(cmd) from SlashCommandMenu.onSelect. */
  slashSelectHandlerRef?: React.MutableRefObject<((cmd: SlashCommand) => void) | null>;
  // --- Phase E: auxiliary parity (Lexical path only) ---
  /** Called with image File[] when images are pasted — bridges to useImageAttachmentHandlers. */
  onImagePaste?: (files: File[]) => void;
};
