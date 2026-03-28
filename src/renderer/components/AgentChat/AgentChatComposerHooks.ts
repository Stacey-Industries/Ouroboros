/**
 * AgentChatComposerHooks.ts — React hooks for AgentChatComposer.
 * Extracted to keep AgentChatComposerSupport.ts under the 300-line limit.
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AgentChatMessageRecord,
  CodexModelOption,
  ImageAttachment,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { handleComposerChange, handleComposerKeyDown } from './AgentChatComposerKeyHandlers';
import { autoResizeTextarea } from './AgentChatComposerParts';
import {
  appendAttachments,
  readAttachmentFiles,
  selectComposerFile,
  selectComposerMention,
  selectComposerSlash,
  setDraftValue,
} from './AgentChatComposerSupport';
import type { ChatOverrides } from './ChatControlsBar';
import type { MentionItem } from './MentionAutocomplete';
import type { SlashCommand, SlashCommandContext } from './SlashCommandMenu';

function hasImageItems(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.items).some((i) => i.type.startsWith('image/'));
}

function hasFileTreeData(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes('application/json');
}

function buildMentionFromDrop(jsonData: string): MentionItem | null {
  try {
    const parsed = JSON.parse(jsonData);
    if (!parsed.path || typeof parsed.path !== 'string') return null;
    const isDir = Boolean(parsed.isDirectory);
    const name = parsed.name || parsed.path.split(/[\\/]/).pop() || parsed.path;
    return {
      type: isDir ? 'folder' : 'file',
      key: `@${isDir ? 'folder' : 'file'}:${parsed.path}`,
      label: name,
      path: parsed.relativePath || parsed.path,
      estimatedTokens: isDir ? 5000 : 500,
    };
  } catch {
    return null;
  }
}

function insertDroppedPath(
  textareaRef: React.RefObject<HTMLTextAreaElement>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
  path: string,
): void {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const cursor = textarea.selectionStart ?? textarea.value.length;
  const insertion = `@${path} `;
  const next = textarea.value.slice(0, cursor) + insertion + textarea.value.slice(cursor);
  setDraftValue(textareaRef, lastSyncedDraft, onChange, next);
  const newCursor = cursor + insertion.length;
  textarea.setSelectionRange(newCursor, newCursor);
  textarea.focus();
}

function useAttachmentDragHandlers(
  handleFiles: (files: File[]) => Promise<void>,
  textareaRef: React.RefObject<HTMLTextAreaElement>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!hasImageItems(event) && !hasFileTreeData(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      void handleFiles(
        Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith('image/')),
      );
      const jsonData = event.dataTransfer.getData('application/json');
      if (!jsonData) return;
      const mention = buildMentionFromDrop(jsonData);
      if (mention) insertDroppedPath(textareaRef, lastSyncedDraft, onChange, mention.path);
    },
    [handleFiles, textareaRef, lastSyncedDraft, onChange],
  );
  return { isDragging, handleDragOver, handleDragLeave, handleDrop };
}

function useRemoveAttachment(
  attachments: ImageAttachment[],
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void,
) {
  return useCallback(
    (name: string) => {
      const index = attachments.findIndex((a) => a.name === name);
      if (index === -1) return;
      const next = [...attachments];
      next.splice(index, 1);
      onAttachmentsChange?.(next);
    },
    [attachments, onAttachmentsChange],
  );
}

export function useImageAttachmentHandlers(
  attachments: ImageAttachment[],
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void,
  opts?: { textareaRef?: React.RefObject<HTMLTextAreaElement>; lastSyncedDraft?: React.MutableRefObject<string>; onChange?: (value: string) => void },
) {
  const handleFiles = useCallback(
    async (files: File[]) =>
      appendAttachments(attachments, await readAttachmentFiles(files), onAttachmentsChange),
    [attachments, onAttachmentsChange],
  );
  const noop = useCallback(() => {}, []);
  const nullRef = useRef<HTMLTextAreaElement>(null);
  const nullDraft = useRef('');
  const drag = useAttachmentDragHandlers(
    handleFiles,
    opts?.textareaRef ?? nullRef,
    opts?.lastSyncedDraft ?? nullDraft,
    opts?.onChange ?? noop,
  );
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(event.clipboardData.items)
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (!imageFiles.length) return;
      event.preventDefault();
      void handleFiles(imageFiles);
    },
    [handleFiles],
  );
  const handlePickImage = useCallback(async () => {
    if (!onAttachmentsChange || !window.electronAPI?.files?.showImageDialog) return;
    const result = await window.electronAPI.files.showImageDialog();
    if (result.success && !result.cancelled && result.attachments?.length)
      onAttachmentsChange([...attachments, ...(result.attachments as ImageAttachment[])]);
  }, [attachments, onAttachmentsChange]);
  return { ...drag, handlePaste, handlePickImage, handleRemoveAttachment: useRemoveAttachment(attachments, onAttachmentsChange) };
}

export interface ComposerDraftHandlersArgs {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  lastSyncedDraft: React.MutableRefObject<string>;
  draft: string;
  messages?: AgentChatMessageRecord[];
  canSend: boolean;
  isAutocompleteOpen: boolean;
  autocompleteResults: FileEntry[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  isSlashMenuOpen: boolean;
  isMentionAutocompleteOpen: boolean;
  useMentionSystem: boolean;
  mentionQuery: string | null;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setIsMentionAutocompleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  slashQuery: string | null;
  setSlashQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSlashMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: CodexModelOption[];
  onAutocompleteQuery?: (query: string) => void;
  onOpenAutocomplete?: () => void;
  onCloseAutocomplete?: () => void;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  slashCommandContext?: SlashCommandContext;
  onAddMention?: (mention: MentionItem) => void;
  onSelectFile?: (file: FileEntry) => void;
}

export function useComposerDraftHandlers(args: ComposerDraftHandlersArgs) {
  const ref = useRef(args);
  ref.current = args;
  const handleFileSelect = useCallback(
    (file: FileEntry) => selectComposerFile(ref.current, file),
    [],
  );
  return {
    handleFileSelect,
    handleMentionSelect: useCallback(
      (mention: MentionItem) => selectComposerMention(ref.current, mention),
      [],
    ),
    handleSlashSelect: useCallback(
      (cmd: SlashCommand) => selectComposerSlash(ref.current, cmd),
      [],
    ),
    handleChange: useCallback((value: string) => handleComposerChange(ref.current, value), []),
    handleKeyDown: useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
        handleComposerKeyDown({ ...ref.current, event, handleFileSelect }),
      [handleFileSelect],
    ),
  };
}

export function useComposerDraftSync(
  textareaRef: React.RefObject<HTMLTextAreaElement>,
  lastSyncedDraft: React.MutableRefObject<string>,
  draft: string,
): void {
  useEffect(() => {
    if (draft !== lastSyncedDraft.current && textareaRef.current) {
      lastSyncedDraft.current = draft;
      textareaRef.current.value = draft;
      autoResizeTextarea(textareaRef.current);
    }
  }, [draft, lastSyncedDraft, textareaRef]);
}

export function useComposerAutocompleteReset(
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
  autocompleteResultsLength: number,
): void {
  useEffect(() => {
    setSelectedIndex(0);
  }, [autocompleteResultsLength, setSelectedIndex]);
}

export function useComposerMenuState() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [isMentionAutocompleteOpen, setIsMentionAutocompleteOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);
  const closeMentionAutocomplete = useCallback(() => {
    setIsMentionAutocompleteOpen(false);
    setMentionQuery(null);
  }, []);
  const closeSlashMenu = useCallback(() => {
    setIsSlashMenuOpen(false);
    setSlashQuery(null);
  }, []);
  return {
    selectedIndex,
    setSelectedIndex,
    mentionQuery,
    setMentionQuery,
    isMentionAutocompleteOpen,
    setIsMentionAutocompleteOpen,
    slashQuery,
    setSlashQuery,
    isSlashMenuOpen,
    setIsSlashMenuOpen,
    closeMentionAutocomplete,
    closeSlashMenu,
  };
}

/** Pick only the fields needed for ComposerState from useComposerMenuState. */
export function pickMenuFields(m: ReturnType<typeof useComposerMenuState>) {
  const { selectedIndex, mentionQuery, isMentionAutocompleteOpen } = m;
  const { slashQuery, isSlashMenuOpen, closeMentionAutocomplete, closeSlashMenu } = m;
  return {
    selectedIndex,
    mentionQuery,
    isMentionAutocompleteOpen,
    slashQuery,
    isSlashMenuOpen,
    closeMentionAutocomplete,
    closeSlashMenu,
  };
}
