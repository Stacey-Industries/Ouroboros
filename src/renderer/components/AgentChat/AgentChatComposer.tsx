import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AgentChatMessageRecord, CodexModelOption, ImageAttachment, ImageMimeType, ModelProvider } from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { AttachmentChipsBar, AutocompleteDropdown, autoResizeTextarea, extractMentionQuery, extractSlashQuery, findLastUserMessageContent, SendButton } from './AgentChatComposerParts';
import { AgentChatContextBar } from './AgentChatContextBar';
import { ChatControlsBar, type ChatOverrides, cyclePermissionMode, resolveChatControlProvider } from './ChatControlsBar';
import type { MentionItem } from './MentionAutocomplete';
import { MentionAutocomplete } from './MentionAutocomplete';
import { MentionChipsBar } from './MentionChip';
import { buildChatSlashCommands, type SlashCommand, type SlashCommandContext, SlashCommandMenu } from './SlashCommandMenu';
import type { PinnedFile } from './useAgentChatContext';

export type AgentChatComposerProps = {
  canSend: boolean; disabled: boolean; draft: string; isSending: boolean; threadIsBusy?: boolean; messages?: AgentChatMessageRecord[];
  onChange: (value: string) => void; onSubmit: () => Promise<void>; pinnedFiles?: PinnedFile[]; onRemoveFile?: (path: string) => void;
  contextSummary?: string | null; autocompleteResults?: FileEntry[]; isAutocompleteOpen?: boolean; onAutocompleteQuery?: (query: string) => void;
  onSelectFile?: (file: FileEntry) => void; onCloseAutocomplete?: () => void; onOpenAutocomplete?: () => void; mentions?: MentionItem[];
  onAddMention?: (mention: MentionItem) => void; onRemoveMention?: (key: string) => void; allFiles?: FileEntry[]; chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void; settingsModel?: string; codexSettingsModel?: string; defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  modelProviders?: ModelProvider[]; codexModels?: CodexModelOption[]; threadModelUsage?: import('./AgentChatConversation').ModelContextUsage[];
  streamingTokenUsage?: { inputTokens: number; outputTokens: number }; slashCommandContext?: SlashCommandContext; attachments?: ImageAttachment[];
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void;
};

const MENU_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab']);
const noop = (): void => {};
const DIFF_MENTION: MentionItem = { type: 'diff', key: '@diff', label: 'Git Diff', path: '@diff', estimatedTokens: 2000 };

function getTextareaStyle(hasAttachmentButton: boolean): React.CSSProperties {
  return { borderColor: 'var(--border-muted, var(--border))', borderRadius: 8, fontFamily: 'var(--font-ui)', minHeight: 40, padding: hasAttachmentButton ? '10px 72px 10px 12px' : '10px 44px 10px 12px', lineHeight: 1.4, transition: 'border-color 150ms ease, box-shadow 150ms ease' };
}

function readImageFilesAsAttachments(files: File[]): Promise<ImageAttachment>[] {
  return files.map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({ name: file.name, mimeType: file.type as ImageMimeType, base64Data: dataUrl.split(',')[1], sizeBytes: file.size });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  }));
}

async function readAttachmentFiles(files: File[]): Promise<ImageAttachment[]> {
  return (await Promise.allSettled(readImageFilesAsAttachments(files))).filter((result): result is PromiseFulfilledResult<ImageAttachment> => result.status === 'fulfilled').map((result) => result.value);
}

function appendAttachments(existing: ImageAttachment[], additions: ImageAttachment[], onAttachmentsChange?: (attachments: ImageAttachment[]) => void): void {
  if (additions.length) onAttachmentsChange?.([...existing, ...additions]);
}

function getComposerRootClassName(isDragging: boolean): string {
  return `pb-1 pt-2${isDragging ? ' ring-2 ring-inset ring-interactive-accent' : ''}`;
}

function renderMentionChips(useMentionSystem: boolean, mentions: MentionItem[], onRemoveMention?: (key: string) => void): React.ReactNode {
  return useMentionSystem ? <MentionChipsBar mentions={mentions} onRemove={onRemoveMention ?? noop} totalTokens={mentions.reduce((sum, mention) => sum + mention.estimatedTokens, 0)} /> : null;
}

function setDraftValue(textareaRef: React.RefObject<HTMLTextAreaElement>, lastSyncedDraft: React.MutableRefObject<string>, onChange: (value: string) => void, value: string): void {
  lastSyncedDraft.current = value;
  onChange(value);
  if (textareaRef.current) autoResizeTextarea(textareaRef.current);
}

function resetDraftTextarea(textareaRef: React.RefObject<HTMLTextAreaElement>, lastSyncedDraft: React.MutableRefObject<string>, onChange: (value: string) => void): void {
  setDraftValue(textareaRef, lastSyncedDraft, onChange, '');
}

function removeTriggerBeforeCursor(textareaRef: React.RefObject<HTMLTextAreaElement>, lastSyncedDraft: React.MutableRefObject<string>, onChange: (value: string) => void): void {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const lastAt = textarea.value.slice(0, textarea.selectionStart).lastIndexOf('@');
  if (lastAt === -1) return;
  const nextDraft = textarea.value.slice(0, lastAt) + textarea.value.slice(textarea.selectionStart);
  setDraftValue(textareaRef, lastSyncedDraft, onChange, nextDraft);
}

function useImageAttachmentHandlers(attachments: ImageAttachment[], onAttachmentsChange?: (attachments: ImageAttachment[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const handleFiles = useCallback(async (files: File[]) => appendAttachments(attachments, await readAttachmentFiles(files), onAttachmentsChange), [attachments, onAttachmentsChange]);
  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items).filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
    if (!files.length) return;
    event.preventDefault();
    void handleFiles(files);
  }, [handleFiles]);
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!Array.from(event.dataTransfer.items).some((item) => item.type.startsWith('image/'))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/')));
  }, [handleFiles]);
  const handlePickImage = useCallback(async () => {
    if (!onAttachmentsChange || !window.electronAPI?.files?.showImageDialog) return;
    const result = await window.electronAPI.files.showImageDialog();
    if (result.success && !result.cancelled && result.attachments?.length) onAttachmentsChange([...attachments, ...(result.attachments as ImageAttachment[])]);
  }, [attachments, onAttachmentsChange]);
  const handleRemoveAttachment = useCallback((name: string) => {
    const index = attachments.findIndex((attachment) => attachment.name === name);
    if (index === -1) return;
    const next = [...attachments];
    next.splice(index, 1);
    onAttachmentsChange?.(next);
  }, [attachments, onAttachmentsChange]);
  return { isDragging, handlePaste, handleDragOver, handleDragLeave, handleDrop, handlePickImage, handleRemoveAttachment };
}

function createFileMention(file: FileEntry): MentionItem {
  return { type: 'file', key: `@file:${file.path}`, label: file.name, path: file.relativePath, estimatedTokens: file.size > 0 ? Math.ceil(file.size / 4) : 500 };
}

function selectComposerFile(args: { textareaRef: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft: React.MutableRefObject<string>; onChange: (value: string) => void; useMentionSystem: boolean; onAddMention?: (mention: MentionItem) => void; onSelectFile?: (file: FileEntry) => void; onCloseAutocomplete?: () => void; setMentionQuery?: React.Dispatch<React.SetStateAction<string | null>>; setIsMentionAutocompleteOpen?: React.Dispatch<React.SetStateAction<boolean>>; }, file: FileEntry): void {
  removeTriggerBeforeCursor(args.textareaRef, args.lastSyncedDraft, args.onChange);
  if (args.useMentionSystem && args.onAddMention) {
    args.onAddMention(createFileMention(file));
    args.setIsMentionAutocompleteOpen?.(false);
    args.setMentionQuery?.(null);
    return;
  }
  args.onSelectFile?.(file);
  args.onCloseAutocomplete?.();
}

function selectComposerMention(args: { textareaRef: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft: React.MutableRefObject<string>; onChange: (value: string) => void; onAddMention?: (mention: MentionItem) => void; setMentionQuery?: React.Dispatch<React.SetStateAction<string | null>>; setIsMentionAutocompleteOpen?: React.Dispatch<React.SetStateAction<boolean>>; }, mention: MentionItem): void {
  removeTriggerBeforeCursor(args.textareaRef, args.lastSyncedDraft, args.onChange);
  args.onAddMention?.(mention);
  args.setIsMentionAutocompleteOpen?.(false);
  args.setMentionQuery?.(null);
  args.textareaRef.current?.focus();
}

function runComposerSlashCommand(args: { draft: string; slashCommandContext?: SlashCommandContext; onAddMention?: (mention: MentionItem) => void; }, cmd: SlashCommand): void {
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

function selectComposerSlash(args: { draft: string; textareaRef: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft: React.MutableRefObject<string>; onChange: (value: string) => void; onAddMention?: (mention: MentionItem) => void; slashCommandContext?: SlashCommandContext; setSlashQuery?: React.Dispatch<React.SetStateAction<string | null>>; setIsSlashMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>; }, cmd: SlashCommand): void {
  runComposerSlashCommand({ draft: args.draft, slashCommandContext: args.slashCommandContext, onAddMention: args.onAddMention }, cmd);
  if (cmd.clearDraft !== false) resetDraftTextarea(args.textareaRef, args.lastSyncedDraft, args.onChange);
  args.setIsSlashMenuOpen?.(false);
  args.setSlashQuery?.(null);
  args.textareaRef.current?.focus();
}

function handleAutocompleteKeyDown(args: { event: React.KeyboardEvent<HTMLTextAreaElement>; autocompleteResults: FileEntry[]; selectedIndex: number; setSelectedIndex: React.Dispatch<React.SetStateAction<number>>; handleFileSelect: (file: FileEntry) => void; onCloseAutocomplete?: () => void; }): boolean {
  if (!args.autocompleteResults.length) return false;
  switch (args.event.key) {
    case 'ArrowDown':
      args.event.preventDefault();
      args.setSelectedIndex((value) => (value + 1) % args.autocompleteResults.length);
      return true;
    case 'ArrowUp':
      args.event.preventDefault();
      args.setSelectedIndex((value) => (value - 1 + args.autocompleteResults.length) % args.autocompleteResults.length);
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

function handlePermissionModeShortcut(args: { event: React.KeyboardEvent<HTMLTextAreaElement>; chatOverrides?: ChatOverrides; onChatOverridesChange?: (overrides: ChatOverrides) => void; defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api'; codexModels?: CodexModelOption[]; }): boolean {
  if (args.event.key !== 'Tab' || !args.event.shiftKey || !args.chatOverrides || !args.onChatOverridesChange) return false;
  args.event.preventDefault();
  const provider = resolveChatControlProvider(args.chatOverrides.model, args.defaultProvider ?? 'claude-code', args.codexModels);
  args.onChatOverridesChange({ ...args.chatOverrides, permissionMode: cyclePermissionMode(args.chatOverrides.permissionMode, provider) });
  return true;
}

function handleEscapeShortcut(args: { event: React.KeyboardEvent<HTMLTextAreaElement>; textareaRef: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft: React.MutableRefObject<string>; onChange: (value: string) => void; }): boolean {
  if (args.event.key !== 'Escape') return false;
  args.event.preventDefault();
  resetDraftTextarea(args.textareaRef, args.lastSyncedDraft, args.onChange);
  return true;
}

function handleArrowUpShortcut(args: { event: React.KeyboardEvent<HTMLTextAreaElement>; messages?: AgentChatMessageRecord[]; textareaRef: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft: React.MutableRefObject<string>; onChange: (value: string) => void; }): boolean {
  const target = args.event.currentTarget;
  if (args.event.key !== 'ArrowUp' || args.event.shiftKey || args.event.ctrlKey || args.event.metaKey || target.value.trim() || target.selectionStart !== 0) return false;
  const lastContent = findLastUserMessageContent(args.messages);
  if (lastContent) setDraftValue(args.textareaRef, args.lastSyncedDraft, args.onChange, lastContent);
  return true;
}

function handleEnterShortcut(args: { event: React.KeyboardEvent<HTMLTextAreaElement>; draft: string; slashCommandContext?: SlashCommandContext; textareaRef: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft: React.MutableRefObject<string>; onChange: (value: string) => void; canSend: boolean; onSubmit: () => Promise<void>; }): boolean {
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

function handleComposerShortcutKeyDown(args: { event: React.KeyboardEvent<HTMLTextAreaElement>; chatOverrides?: ChatOverrides; onChatOverridesChange?: (overrides: ChatOverrides) => void; defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api'; codexModels?: CodexModelOption[]; draft: string; messages?: AgentChatMessageRecord[]; onChange: (value: string) => void; slashCommandContext?: SlashCommandContext; textareaRef: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft: React.MutableRefObject<string>; canSend: boolean; onSubmit: () => Promise<void>; }): boolean {
  return handlePermissionModeShortcut(args) || handleEscapeShortcut(args) || handleArrowUpShortcut(args) || handleEnterShortcut(args);
}

function handleComposerKeyDown(args: { event: React.KeyboardEvent<HTMLTextAreaElement>; isSlashMenuOpen: boolean; isMentionAutocompleteOpen: boolean; useMentionSystem: boolean; isAutocompleteOpen: boolean; autocompleteResults: FileEntry[]; selectedIndex: number; setSelectedIndex: React.Dispatch<React.SetStateAction<number>>; handleFileSelect: (file: FileEntry) => void; chatOverrides?: ChatOverrides; onChatOverridesChange?: (overrides: ChatOverrides) => void; defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api'; codexModels?: CodexModelOption[]; onCloseAutocomplete?: () => void; messages?: AgentChatMessageRecord[]; draft: string; onChange: (value: string) => void; slashCommandContext?: SlashCommandContext; textareaRef: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft: React.MutableRefObject<string>; canSend: boolean; onSubmit: () => Promise<void>; }): void {
  if ((args.isSlashMenuOpen || (args.useMentionSystem && args.isMentionAutocompleteOpen)) && MENU_KEYS.has(args.event.key)) return;
  if (!args.useMentionSystem && args.isAutocompleteOpen && handleAutocompleteKeyDown({ event: args.event, autocompleteResults: args.autocompleteResults, selectedIndex: args.selectedIndex, setSelectedIndex: args.setSelectedIndex, handleFileSelect: args.handleFileSelect, onCloseAutocomplete: args.onCloseAutocomplete })) return;
  handleComposerShortcutKeyDown(args);
}

function handleComposerChange(args: { textareaRef: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft: React.MutableRefObject<string>; onChange: (value: string) => void; onAutocompleteQuery?: (query: string) => void; onOpenAutocomplete?: () => void; onCloseAutocomplete?: () => void; useMentionSystem: boolean; setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>; setIsMentionAutocompleteOpen: React.Dispatch<React.SetStateAction<boolean>>; setSlashQuery: React.Dispatch<React.SetStateAction<string | null>>; setIsSlashMenuOpen: React.Dispatch<React.SetStateAction<boolean>>; }, value: string): void {
  setDraftValue(args.textareaRef, args.lastSyncedDraft, args.onChange, value);
  const slashQuery = extractSlashQuery(value);
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
  const mentionQuery = extractMentionQuery(value, args.textareaRef.current?.selectionStart ?? value.length);
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

function useComposerDraftHandlers(args: { textareaRef: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft: React.MutableRefObject<string>; draft: string; messages?: AgentChatMessageRecord[]; canSend: boolean; isAutocompleteOpen: boolean; autocompleteResults: FileEntry[]; selectedIndex: number; setSelectedIndex: React.Dispatch<React.SetStateAction<number>>; isSlashMenuOpen: boolean; isMentionAutocompleteOpen: boolean; useMentionSystem: boolean; mentionQuery: string | null; setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>; setIsMentionAutocompleteOpen: React.Dispatch<React.SetStateAction<boolean>>; slashQuery: string | null; setSlashQuery: React.Dispatch<React.SetStateAction<string | null>>; setIsSlashMenuOpen: React.Dispatch<React.SetStateAction<boolean>>; chatOverrides?: ChatOverrides; onChatOverridesChange?: (overrides: ChatOverrides) => void; defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api'; codexModels?: CodexModelOption[]; onAutocompleteQuery?: (query: string) => void; onOpenAutocomplete?: () => void; onCloseAutocomplete?: () => void; onChange: (value: string) => void; onSubmit: () => Promise<void>; slashCommandContext?: SlashCommandContext; onAddMention?: (mention: MentionItem) => void; onSelectFile?: (file: FileEntry) => void; }) {
  const ref = useRef(args);
  ref.current = args;
  const handleFileSelect = useCallback((file: FileEntry) => selectComposerFile(ref.current, file), []);
  return { handleFileSelect, handleMentionSelect: useCallback((mention: MentionItem) => selectComposerMention(ref.current, mention), []), handleSlashSelect: useCallback((cmd: SlashCommand) => selectComposerSlash(ref.current, cmd), []), handleChange: useCallback((value: string) => handleComposerChange(ref.current, value), []), handleKeyDown: useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => handleComposerKeyDown({ ...ref.current, event, handleFileSelect }), [handleFileSelect]) };
}

function useComposerDraftSync(textareaRef: React.RefObject<HTMLTextAreaElement>, lastSyncedDraft: React.MutableRefObject<string>, draft: string): void {
  useEffect(() => {
    if (draft !== lastSyncedDraft.current && textareaRef.current) {
      lastSyncedDraft.current = draft;
      textareaRef.current.value = draft;
      autoResizeTextarea(textareaRef.current);
    }
  }, [draft, lastSyncedDraft, textareaRef]);
}

function useComposerAutocompleteReset(setSelectedIndex: React.Dispatch<React.SetStateAction<number>>, autocompleteResultsLength: number): void {
  useEffect(() => { setSelectedIndex(0); }, [autocompleteResultsLength, setSelectedIndex]);
}

type ComposerMenusProps = { allFiles: FileEntry[]; autocompleteResults: FileEntry[]; handleFileSelect: (file: FileEntry) => void; handleMentionSelect: (mention: MentionItem) => void; isAutocompleteOpen: boolean; isMentionAutocompleteOpen: boolean; isSlashMenuOpen: boolean; mentionQuery: string | null; mentions: MentionItem[]; onCloseMentionAutocomplete: () => void; onCloseSlashMenu: () => void; onSlashSelect: (cmd: SlashCommand) => void; selectedIndex: number; slashCommands: SlashCommand[]; slashQuery: string | null; useMentionSystem: boolean; };

function ComposerMenus(props: ComposerMenusProps): React.ReactElement {
  return <div className="relative">{props.isSlashMenuOpen && props.slashQuery !== null && <SlashCommandMenu query={props.slashQuery} commands={props.slashCommands} onSelect={props.onSlashSelect} onClose={props.onCloseSlashMenu} isOpen />}{props.useMentionSystem && props.isMentionAutocompleteOpen && props.mentionQuery !== null && <MentionAutocomplete query={props.mentionQuery} allFiles={props.allFiles} selectedMentions={props.mentions} onSelect={props.handleMentionSelect} onClose={props.onCloseMentionAutocomplete} isOpen />}{!props.useMentionSystem && props.isAutocompleteOpen && <AutocompleteDropdown results={props.autocompleteResults} selectedIndex={props.selectedIndex} onSelect={props.handleFileSelect} />}</div>;
}

type ComposerInputProps = { canSend: boolean; disabled: boolean; draft: string; handleChange: (value: string) => void; handleDragLeave: () => void; handleDragOver: (event: React.DragEvent) => void; handleDrop: (event: React.DragEvent) => void; handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void; handlePaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void; isSending: boolean; onPickImage?: () => Promise<void>; onSubmit: () => Promise<void>; threadIsBusy: boolean; textareaRef: React.RefObject<HTMLTextAreaElement>; useMentionSystem: boolean; onCloseAutocomplete?: () => void; onCloseMentionAutocomplete?: () => void; };

function ComposerInput(props: ComposerInputProps): React.ReactElement {
  return <div className="relative"><textarea ref={props.textareaRef} defaultValue={props.draft} onChange={(event) => props.handleChange(event.target.value)} onKeyDown={props.handleKeyDown} onPaste={props.handlePaste} onBlur={() => { setTimeout(() => { if (props.useMentionSystem) props.onCloseMentionAutocomplete?.(); else props.onCloseAutocomplete?.(); }, 200); }} placeholder="Ask the agent... (/ for commands, @ to mention files)" disabled={props.disabled} rows={1} className="w-full resize-none border bg-surface-base text-sm text-text-semantic-primary placeholder:text-text-semantic-muted focus:placeholder:text-transparent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60" style={getTextareaStyle(Boolean(props.onPickImage))} onFocus={(event) => { event.currentTarget.style.borderColor = 'var(--accent)'; event.currentTarget.style.boxShadow = '0 0 0 2px var(--accent-muted, rgba(88, 166, 255, 0.2))'; }} onBlurCapture={(event) => { event.currentTarget.style.borderColor = 'var(--border-muted, var(--border))'; event.currentTarget.style.boxShadow = 'none'; }} />{props.onPickImage && <button type="button" title="Attach image" onClick={() => void props.onPickImage?.()} className="absolute right-10 flex h-[28px] w-[28px] items-center justify-center rounded-md text-text-semantic-muted transition-colors duration-100 hover:bg-[rgba(255,255,255,0.08)] hover:text-text-semantic-primary" style={{ top: 6 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg></button>}<SendButton canSend={props.canSend} isSending={props.isSending} willQueue={props.threadIsBusy} onClick={() => void props.onSubmit()} /></div>;
}

type ComposerFooterProps = { chatOverrides?: ChatOverrides; codexModels?: CodexModelOption[]; codexSettingsModel?: string; defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api'; modelProviders?: ModelProvider[]; onChatOverridesChange?: (overrides: ChatOverrides) => void; settingsModel?: string; streamingTokenUsage?: { inputTokens: number; outputTokens: number }; threadModelUsage?: import('./AgentChatConversation').ModelContextUsage[]; };

function ComposerFooter(props: ComposerFooterProps): React.ReactElement | null {
  return props.chatOverrides && props.onChatOverridesChange ? <ChatControlsBar overrides={props.chatOverrides} onChange={props.onChatOverridesChange} settingsModel={props.settingsModel} codexSettingsModel={props.codexSettingsModel} defaultProvider={props.defaultProvider} providers={props.modelProviders} codexModels={props.codexModels} threadModelUsage={props.threadModelUsage} streamingTokenUsage={props.streamingTokenUsage} /> : null;
}

export function AgentChatComposer(props: AgentChatComposerProps): React.ReactElement {
  const { canSend, disabled, draft, isSending, threadIsBusy = false, messages, onChange, onSubmit, pinnedFiles = [], onRemoveFile, contextSummary, autocompleteResults = [], isAutocompleteOpen = false, onAutocompleteQuery, onSelectFile, onCloseAutocomplete, onOpenAutocomplete, mentions = [], onAddMention, onRemoveMention, allFiles = [], chatOverrides, onChatOverridesChange, settingsModel, codexSettingsModel, defaultProvider, modelProviders, codexModels, threadModelUsage, streamingTokenUsage, slashCommandContext, attachments = [], onAttachmentsChange } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedDraft = useRef(draft);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [isMentionAutocompleteOpen, setIsMentionAutocompleteOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);
  const useMentionSystem = Boolean(onAddMention);
  const attachmentHandlers = useImageAttachmentHandlers(attachments, onAttachmentsChange);
  const slashCommands = useMemo(() => buildChatSlashCommands(slashCommandContext ?? {}), [slashCommandContext]);
  const closeAutocomplete = useCallback(() => onCloseAutocomplete?.(), [onCloseAutocomplete]);
  const closeMentionAutocomplete = useCallback(() => { setIsMentionAutocompleteOpen(false); setMentionQuery(null); }, []);
  const closeSlashMenu = useCallback(() => { setIsSlashMenuOpen(false); setSlashQuery(null); }, []);
  const handlers = useComposerDraftHandlers({ textareaRef, lastSyncedDraft, draft, messages, canSend, isAutocompleteOpen, autocompleteResults, selectedIndex, setSelectedIndex, isSlashMenuOpen, isMentionAutocompleteOpen, useMentionSystem, mentionQuery, setMentionQuery, setIsMentionAutocompleteOpen, slashQuery, setSlashQuery, setIsSlashMenuOpen, chatOverrides, onChatOverridesChange, defaultProvider, codexModels, onAutocompleteQuery, onOpenAutocomplete, onCloseAutocomplete, onChange, onSubmit, slashCommandContext, onAddMention, onSelectFile });

  useComposerDraftSync(textareaRef, lastSyncedDraft, draft);
  useComposerAutocompleteReset(setSelectedIndex, autocompleteResults.length);

  const rootClassName = getComposerRootClassName(attachmentHandlers.isDragging);
  const mentionChips = renderMentionChips(useMentionSystem, mentions, onRemoveMention);

  return <div className={rootClassName} onDragOver={attachmentHandlers.handleDragOver} onDragLeave={attachmentHandlers.handleDragLeave} onDrop={attachmentHandlers.handleDrop}><div className="px-3"><AgentChatContextBar pinnedFiles={pinnedFiles} onRemoveFile={onRemoveFile ?? noop} contextSummary={contextSummary ?? null} />{mentionChips}<AttachmentChipsBar attachments={attachments} onRemove={attachmentHandlers.handleRemoveAttachment} /><ComposerMenus allFiles={allFiles} autocompleteResults={autocompleteResults} handleFileSelect={handlers.handleFileSelect} handleMentionSelect={handlers.handleMentionSelect} isAutocompleteOpen={isAutocompleteOpen} isMentionAutocompleteOpen={isMentionAutocompleteOpen} isSlashMenuOpen={isSlashMenuOpen} mentionQuery={mentionQuery} mentions={mentions} onCloseMentionAutocomplete={closeMentionAutocomplete} onCloseSlashMenu={closeSlashMenu} onSlashSelect={handlers.handleSlashSelect} selectedIndex={selectedIndex} slashCommands={slashCommands} slashQuery={slashQuery} useMentionSystem={useMentionSystem} /><ComposerInput canSend={canSend} disabled={disabled} draft={draft} handleChange={handlers.handleChange} handleDragLeave={attachmentHandlers.handleDragLeave} handleDragOver={attachmentHandlers.handleDragOver} handleDrop={attachmentHandlers.handleDrop} handleKeyDown={handlers.handleKeyDown} handlePaste={attachmentHandlers.handlePaste} isSending={isSending} onPickImage={attachmentHandlers.handlePickImage} onSubmit={onSubmit} threadIsBusy={threadIsBusy} textareaRef={textareaRef} useMentionSystem={useMentionSystem} onCloseAutocomplete={closeAutocomplete} onCloseMentionAutocomplete={closeMentionAutocomplete} /></div><ComposerFooter chatOverrides={chatOverrides} codexModels={codexModels} codexSettingsModel={codexSettingsModel} defaultProvider={defaultProvider} modelProviders={modelProviders} onChatOverridesChange={onChatOverridesChange} settingsModel={settingsModel} streamingTokenUsage={streamingTokenUsage} threadModelUsage={threadModelUsage} /></div>;
}
