/**
 * AgentChatComposerSupport.ts — Pure helpers for AgentChatComposer.
 * Hooks live in AgentChatComposerHooks.ts.
 * Extracted to keep AgentChatComposer.tsx under the 300-line limit.
 */
import type React from 'react';

import type { ImageAttachment, ImageMimeType } from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { autoResizeTextarea } from './AgentChatComposerParts';
import type { MentionItem } from './MentionAutocomplete';
import type { SlashCommand, SlashCommandContext } from './SlashCommandMenu';

/* ---------- Constants ---------- */

export const MENU_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab']);
export const noop = (): void => {};
export const DIFF_MENTION: MentionItem = {
  type: 'diff',
  key: '@diff',
  label: 'Git Diff',
  path: '@diff',
  estimatedTokens: 2000,
};

/* ---------- Style helpers ---------- */

export function getTextareaStyle(hasAttachmentButton: boolean): React.CSSProperties {
  return {
    borderColor: 'var(--border-subtle, var(--border-default))',
    borderRadius: 8,
    fontFamily: 'var(--font-ui)',
    minHeight: 40,
    padding: hasAttachmentButton ? '10px 72px 10px 12px' : '10px 44px 10px 12px',
    lineHeight: 1.4,
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
  };
}

export function getComposerRootClassName(isDragging: boolean): string {
  return `pb-1 pt-2${isDragging ? ' ring-2 ring-inset ring-interactive-accent' : ''}`;
}

/* ---------- Attachment file readers ---------- */

function readImageFilesAsAttachments(files: File[]): Promise<ImageAttachment>[] {
  return files.map(
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
}

export async function readAttachmentFiles(files: File[]): Promise<ImageAttachment[]> {
  return (await Promise.allSettled(readImageFilesAsAttachments(files)))
    .filter(
      (result): result is PromiseFulfilledResult<ImageAttachment> => result.status === 'fulfilled',
    )
    .map((result) => result.value);
}

export function appendAttachments(
  existing: ImageAttachment[],
  additions: ImageAttachment[],
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void,
): void {
  if (additions.length) onAttachmentsChange?.([...existing, ...additions]);
}

/* ---------- Draft helpers ---------- */

export function setDraftValue(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
  value: string,
): void {
  lastSyncedDraft.current = value;
  onChange(value);
  if (textareaRef.current) {
    textareaRef.current.value = value;
    autoResizeTextarea(textareaRef.current);
  }
}

export function resetDraftTextarea(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
): void {
  setDraftValue(textareaRef, lastSyncedDraft, onChange, '');
}

export function removeTriggerBeforeCursor(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
): void {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const lastAt = textarea.value.slice(0, textarea.selectionStart).lastIndexOf('@');
  if (lastAt === -1) return;
  const nextDraft = textarea.value.slice(0, lastAt) + textarea.value.slice(textarea.selectionStart);
  setDraftValue(textareaRef, lastSyncedDraft, onChange, nextDraft);
}

/** Replace the @trigger text with `@path ` inline in the textarea. */
export function replaceTriggerWithPath(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
  path: string,
): void {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const cursor = textarea.selectionStart;
  const lastAt = textarea.value.slice(0, cursor).lastIndexOf('@');
  if (lastAt === -1) return;
  const insertion = `@${path} `;
  const nextDraft = textarea.value.slice(0, lastAt) + insertion + textarea.value.slice(cursor);
  setDraftValue(textareaRef, lastSyncedDraft, onChange, nextDraft);
  const newCursor = lastAt + insertion.length;
  textarea.setSelectionRange(newCursor, newCursor);
}

/* ---------- Mention/file selection helpers ---------- */

export function createFileMention(file: FileEntry): MentionItem {
  return {
    type: 'file',
    key: `@file:${file.path}`,
    label: file.name,
    path: file.relativePath,
    estimatedTokens: file.size > 0 ? Math.ceil(file.size / 4) : 500,
  };
}

export function selectComposerFile(
  args: {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    lastSyncedDraft: React.MutableRefObject<string>;
    onChange: (value: string) => void;
    useMentionSystem: boolean;
    onAddMention?: (mention: MentionItem) => void;
    onSelectFile?: (file: FileEntry) => void;
    onCloseAutocomplete?: () => void;
    setMentionQuery?: React.Dispatch<React.SetStateAction<string | null>>;
    setIsMentionAutocompleteOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  },
  file: FileEntry,
): void {
  if (args.useMentionSystem) {
    replaceTriggerWithPath(args.textareaRef, args.lastSyncedDraft, args.onChange, file.relativePath);
    args.setIsMentionAutocompleteOpen?.(false);
    args.setMentionQuery?.(null);
    return;
  }
  removeTriggerBeforeCursor(args.textareaRef, args.lastSyncedDraft, args.onChange);
  args.onSelectFile?.(file);
  args.onCloseAutocomplete?.();
}

export function selectComposerMention(
  args: {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    lastSyncedDraft: React.MutableRefObject<string>;
    onChange: (value: string) => void;
    onAddMention?: (mention: MentionItem) => void;
    setMentionQuery?: React.Dispatch<React.SetStateAction<string | null>>;
    setIsMentionAutocompleteOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  },
  mention: MentionItem,
): void {
  replaceTriggerWithPath(args.textareaRef, args.lastSyncedDraft, args.onChange, mention.path);
  args.setIsMentionAutocompleteOpen?.(false);
  args.setMentionQuery?.(null);
  args.textareaRef.current?.focus();
}

/* ---------- Slash command helpers ---------- */

function runComposerSlashCommand(
  args: {
    draft: string;
    slashCommandContext?: SlashCommandContext;
    onAddMention?: (mention: MentionItem) => void;
  },
  cmd: SlashCommand,
): void {
  if (cmd.id === 'remember') {
    const text = args.draft.replace(/^\/remember\s*/i, '').trim();
    if (text) args.slashCommandContext?.onRemember?.(text);
    return;
  }
  if (cmd.id === 'diff') {
    args.onAddMention?.(DIFF_MENTION);
    return;
  }
  cmd.action();
}

export function selectComposerSlash(
  args: {
    draft: string;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    lastSyncedDraft: React.MutableRefObject<string>;
    onChange: (value: string) => void;
    onAddMention?: (mention: MentionItem) => void;
    slashCommandContext?: SlashCommandContext;
    setSlashQuery?: React.Dispatch<React.SetStateAction<string | null>>;
    setIsSlashMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  },
  cmd: SlashCommand,
): void {
  runComposerSlashCommand(
    {
      draft: args.draft,
      slashCommandContext: args.slashCommandContext,
      onAddMention: args.onAddMention,
    },
    cmd,
  );
  if (cmd.clearDraft !== false)
    resetDraftTextarea(args.textareaRef, args.lastSyncedDraft, args.onChange);
  args.setIsSlashMenuOpen?.(false);
  args.setSlashQuery?.(null);
  args.textareaRef.current?.focus();
}

/* ---------- Re-exports from key handlers module ---------- */
export {
  handleAutocompleteKeyDown,
  handleComposerChange,
  handleComposerKeyDown,
  handleComposerShortcutKeyDown,
} from './AgentChatComposerKeyHandlers';
